import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { onRequestPost } from '../functions/api/contact.ts';

const originalFetch = globalThis.fetch;

const validBody = {
    name: 'Test Visitor',
    email: 'visitor@example.com',
    message: 'This is a valid contact message.',
    turnstileToken: 'test-turnstile-token',
    website: '',
};

const validEnv = {
    RESEND_API_KEY: 'test-resend-key',
    CONTACT_SENDER: 'Portfolio <sender@example.com>',
    CONTACT_RECIPIENT: 'recipient@example.com',
    TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
};

const createRequest = (body: unknown, headers: Record<string, string> = {}): Request =>
    new Request('https://example.com/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const assertGenericNoStoreResponse = async (response: Response, status: number): Promise<void> => {
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(await response.text(), '');
};

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('contact Pages Function', () => {
    it('rejects invalid input without making external requests', async () => {
        let fetchCalled = false;
        globalThis.fetch = (async () => {
            fetchCalled = true;
            throw new Error('Unexpected fetch');
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest({ ...validBody, email: 'invalid' }),
            env: validEnv,
        });

        await assertGenericNoStoreResponse(response, 400);
        assert.equal(fetchCalled, false);
    });

    it('silently accepts a filled honeypot before validation or external requests', async () => {
        let fetchCalled = false;
        globalThis.fetch = (async () => {
            fetchCalled = true;
            throw new Error('Unexpected fetch');
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest({ website: 'https://spam.example' }),
            env: {},
        });

        await assertGenericNoStoreResponse(response, 204);
        assert.equal(fetchCalled, false);
    });

    it('rejects a failed Turnstile challenge without calling Resend', async () => {
        let fetchCount = 0;
        globalThis.fetch = (async () => {
            fetchCount += 1;
            return jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] });
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest(validBody),
            env: { ...validEnv, SEND_VISITOR_CONFIRMATION: 'true' },
        });

        await assertGenericNoStoreResponse(response, 400);
        assert.equal(fetchCount, 1);
    });

    it('returns a generic upstream error when Siteverify is unavailable', async () => {
        globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest(validBody),
            env: validEnv,
        });

        await assertGenericNoStoreResponse(response, 502);
    });

    it('returns a generic upstream error when Resend rejects the batch', async () => {
        let fetchCount = 0;
        globalThis.fetch = (async () => {
            fetchCount += 1;
            return fetchCount === 1
                ? jsonResponse({ success: true })
                : jsonResponse({ message: 'rejected' }, 500);
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest(validBody),
            env: validEnv,
        });

        await assertGenericNoStoreResponse(response, 502);
        assert.equal(fetchCount, 2);
    });

    it('verifies the visitor IP and sends one email when confirmation is disabled', async () => {
        const calls: Array<{ input: string; init?: RequestInit }> = [];
        globalThis.fetch = (async (input, init) => {
            calls.push({ input: String(input), init });
            return calls.length === 1
                ? jsonResponse({ success: true })
                : jsonResponse({ data: [{ id: 'email-id' }] });
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest(validBody, { 'CF-Connecting-IP': '203.0.113.10' }),
            env: validEnv,
        });

        await assertGenericNoStoreResponse(response, 204);
        assert.equal(calls.length, 2);
        assert.match(calls[0]?.input ?? '', /siteverify$/);
        assert.match(calls[1]?.input ?? '', /emails\/batch$/);
        assert.equal(calls[0]?.init?.signal instanceof AbortSignal, true);
        assert.equal(calls[1]?.init?.signal instanceof AbortSignal, true);

        const verificationBody = JSON.parse(String(calls[0]?.init?.body));
        assert.equal(verificationBody.remoteip, '203.0.113.10');
        assert.equal(verificationBody.response, validBody.turnstileToken);

        const emailBatch = JSON.parse(String(calls[1]?.init?.body));
        assert.equal(emailBatch.length, 1);
    });

    it('sends visitor confirmation only when explicitly enabled after Turnstile passes', async () => {
        let fetchCount = 0;
        let resendBody: unknown;
        globalThis.fetch = (async (_input, init) => {
            fetchCount += 1;
            if (fetchCount === 1) {
                return jsonResponse({ success: true });
            }

            resendBody = JSON.parse(String(init?.body));
            return jsonResponse({ data: [{ id: 'owner-email' }, { id: 'visitor-email' }] });
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest(validBody),
            env: { ...validEnv, SEND_VISITOR_CONFIRMATION: 'true' },
        });

        await assertGenericNoStoreResponse(response, 204);
        assert.equal(Array.isArray(resendBody) ? resendBody.length : 0, 2);
        assert.ok(Array.isArray(resendBody));
        const visitorEmail = resendBody[1] as Record<string, unknown>;
        assert.equal((visitorEmail.to as string[])[0], validBody.email);
        assert.equal(typeof visitorEmail.text, 'string');
        assert.equal(typeof visitorEmail.html, 'string');
        assert.match(String(visitorEmail.html), /Hi Test Visitor,/);
        assert.match(String(visitorEmail.html), /https:\/\/nowakkamil\.com/);
        assert.doesNotMatch(String(visitorEmail.html), /{{\s*(?:name|message|ctaText|ctaUrl)\s*}}/);
    });

    it('HTML-escapes the visitor name before rendering the customer template', async () => {
        let fetchCount = 0;
        let resendBody: unknown;
        globalThis.fetch = (async (_input, init) => {
            fetchCount += 1;
            if (fetchCount === 1) {
                return jsonResponse({ success: true });
            }

            resendBody = JSON.parse(String(init?.body));
            return jsonResponse({ data: [{ id: 'owner-email' }, { id: 'visitor-email' }] });
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest({ ...validBody, name: 'Test <Visitor> & Co' }),
            env: { ...validEnv, SEND_VISITOR_CONFIRMATION: 'true' },
        });

        await assertGenericNoStoreResponse(response, 204);
        assert.ok(Array.isArray(resendBody));
        const visitorHtml = String((resendBody[1] as Record<string, unknown>).html);
        assert.match(visitorHtml, /Hi Test &lt;Visitor&gt; &amp; Co,/);
        assert.doesNotMatch(visitorHtml, /Hi Test <Visitor>/);
    });
});
