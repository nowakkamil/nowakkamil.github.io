import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { onRequestPost } from '../functions/api/contact.ts';
import { renderCustomerConfirmationBodyHtml } from '../functions/customerConfirmation.ts';

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

describe('customer confirmation markup', () => {
    it('allows a single long token to wrap inside the message block', () => {
        const html = renderCustomerConfirmationBodyHtml(
            'https://nowakkamil.com/https://nowakkamil.com/https://nowakkamil.com/',
        );

        assert.match(html, /table-layout: fixed/);
        assert.match(html, /overflow-wrap: anywhere/);
        assert.match(html, /word-break: break-word/);
        assert.match(html, /word-wrap: break-word/);
    });
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

    it('returns a generic upstream error when Resend rejects the email', async () => {
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
        assert.match(calls[1]?.input ?? '', /emails$/);
        assert.equal(calls[0]?.init?.signal instanceof AbortSignal, true);

        const verificationBody = JSON.parse(String(calls[0]?.init?.body));
        assert.equal(verificationBody.remoteip, '203.0.113.10');
        assert.equal(verificationBody.response, validBody.turnstileToken);

        const ownerEmail = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
        assert.deepEqual(ownerEmail.to, [validEnv.CONTACT_RECIPIENT]);
        assert.equal(ownerEmail.reply_to, validBody.email);
        assert.equal(ownerEmail.subject, 'Project inquiry via nowakkamil.com');
        assert.match(String(ownerEmail.html), /New inquiry/);
        assert.match(String(ownerEmail.html), /Test Visitor/);
        assert.match(String(ownerEmail.html), /visitor@example\.com/);
        assert.match(String(ownerEmail.html), /This is a valid contact message\./);
        assert.doesNotMatch(
            String(ownerEmail.html),
            /{{\s*(?:customerName|customerEmail|message)\s*}}/,
        );
        assert.equal(ownerEmail.attachments, undefined);
    });

    it('sends visitor confirmation only when explicitly enabled after Turnstile passes', async () => {
        let fetchCount = 0;
        const resendBodies: Array<Record<string, unknown>> = [];
        globalThis.fetch = (async (_input, init) => {
            fetchCount += 1;
            if (fetchCount === 1) {
                return jsonResponse({ success: true });
            }

            resendBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
            return jsonResponse({ id: `email-${fetchCount}` });
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest(validBody),
            env: { ...validEnv, SEND_VISITOR_CONFIRMATION: 'true' },
        });

        await assertGenericNoStoreResponse(response, 204);
        assert.equal(resendBodies.length, 2);
        const ownerEmail = resendBodies.find(
            ({ to }) => (to as string[] | undefined)?.[0] === validEnv.CONTACT_RECIPIENT,
        );
        const visitorEmail = resendBodies.find(
            ({ to }) => (to as string[] | undefined)?.[0] === validBody.email,
        );
        assert.ok(ownerEmail);
        assert.ok(visitorEmail);
        assert.equal(ownerEmail.reply_to, validBody.email);
        assert.equal(visitorEmail.reply_to, validEnv.CONTACT_RECIPIENT);
        assert.equal((visitorEmail.to as string[])[0], validBody.email);
        assert.equal(typeof visitorEmail.text, 'string');
        assert.equal(typeof visitorEmail.html, 'string');
        assert.match(String(visitorEmail.html), /Hi Test,/);
        assert.match(String(visitorEmail.html), /This is a valid contact message\./);
        assert.match(String(visitorEmail.text), /This is a valid contact message\./);
        assert.match(String(visitorEmail.html), /https:\/\/nowakkamil\.com/);
        assert.match(String(visitorEmail.html), /src="cid:kn-monogram"/);
        assert.match(String(visitorEmail.html), /src="cid:signature-globe"/);
        assert.match(String(visitorEmail.html), /src="cid:signature-wave"/);
        assert.equal((visitorEmail.attachments as unknown[]).length, 6);
        assert.doesNotMatch(String(visitorEmail.html), /{{\s*(?:firstName|message|asset\w+)\s*}}/);
    });

    it('HTML-escapes the visitor name before rendering the customer template', async () => {
        let fetchCount = 0;
        const resendBodies: Array<Record<string, unknown>> = [];
        globalThis.fetch = (async (_input, init) => {
            fetchCount += 1;
            if (fetchCount === 1) {
                return jsonResponse({ success: true });
            }

            resendBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
            return jsonResponse({ id: `email-${fetchCount}` });
        }) as typeof fetch;

        const response = await onRequestPost({
            request: createRequest({
                ...validBody,
                name: '<Test> Visitor & Co',
                message: 'Please review <script>alert("email")</script>.\nSecond line.',
            }),
            env: { ...validEnv, SEND_VISITOR_CONFIRMATION: 'true' },
        });

        await assertGenericNoStoreResponse(response, 204);
        const ownerEmail = resendBodies.find(
            ({ to }) => (to as string[] | undefined)?.[0] === validEnv.CONTACT_RECIPIENT,
        );
        const visitorEmail = resendBodies.find(
            ({ to }) => (to as string[] | undefined)?.[0] === validBody.email,
        );
        assert.ok(ownerEmail);
        assert.ok(visitorEmail);
        const ownerHtml = String(ownerEmail.html);
        const visitorHtml = String(visitorEmail.html);
        assert.match(ownerHtml, /&lt;Test&gt; Visitor &amp; Co/);
        assert.doesNotMatch(ownerHtml, /<Test> Visitor/);
        assert.match(
            ownerHtml,
            /Please review &lt;script&gt;alert\(&quot;email&quot;\)&lt;\/script&gt;\.<br \/>Second line\./,
        );
        assert.doesNotMatch(ownerHtml, /<script>alert/);
        assert.match(visitorHtml, /Hi &lt;Test&gt;,/);
        assert.doesNotMatch(visitorHtml, /Hi <Test>/);
        assert.match(
            visitorHtml,
            /Please review &lt;script&gt;alert\(&quot;email&quot;\)&lt;\/script&gt;\.<br \/>Second line\./,
        );
        assert.doesNotMatch(visitorHtml, /<script>alert/);
    });
});
