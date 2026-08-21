import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createServer, type ViteDevServer } from 'vite';

type TurnstileControllerFactory = (
    container: HTMLElement,
    sitekey: string,
) => {
    getTokenForSubmission: () => Promise<string>;
    initialize: () => void;
    reset: () => void;
};

interface TestTurnstileCallbacks {
    callback: (token: string) => void;
    'error-callback': () => void;
    'expired-callback': () => void;
    'timeout-callback': () => void;
}

const flushPromises = async (): Promise<void> => {
    await new Promise<void>((resolve) => setImmediate(resolve));
};

let vite: ViteDevServer;
let createTurnstileController: TurnstileControllerFactory;

before(async () => {
    vite = await createServer({
        appType: 'custom',
        configFile: false,
        server: { middlewareMode: true },
    });
    const contactFormModule = (await vite.ssrLoadModule(
        '/src/sections/contact/contactForm.ts',
    )) as {
        createTurnstileController: TurnstileControllerFactory;
    };
    createTurnstileController = contactFormModule.createTurnstileController;
});

after(async () => {
    await vite.close();
});

const createTurnstileMock = () => {
    const calls = {
        execute: 0,
        remove: 0,
        render: 0,
        reset: 0,
    };
    let callbacks: TestTurnstileCallbacks | undefined;

    const api = {
        execute: (): void => {
            calls.execute += 1;
        },
        isExpired: (): boolean => false,
        remove: (): void => {
            calls.remove += 1;
        },
        render: (_container: HTMLElement, options: TestTurnstileCallbacks): string => {
            calls.render += 1;
            callbacks = options;
            return `widget-${calls.render}`;
        },
        reset: (): void => {
            calls.reset += 1;
        },
    };

    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            clearTimeout,
            setTimeout,
            turnstile: api,
        },
        writable: true,
    });

    return {
        calls,
        getCallbacks: (): TestTurnstileCallbacks => {
            assert.ok(callbacks);
            return callbacks;
        },
    };
};

describe('contact form Turnstile controller', () => {
    it('renders without executing, executes once for concurrent token requests, and resets cleanly', async () => {
        const turnstile = createTurnstileMock();
        const controller = createTurnstileController({} as HTMLElement, 'test-site-key');

        controller.initialize();
        await flushPromises();

        assert.equal(turnstile.calls.render, 1);
        assert.equal(turnstile.calls.execute, 0);

        const firstRequest = controller.getTokenForSubmission();
        const duplicateRequest = controller.getTokenForSubmission();
        await flushPromises();

        assert.equal(turnstile.calls.execute, 1);
        turnstile.getCallbacks().callback('first-token');
        assert.deepEqual(await Promise.all([firstRequest, duplicateRequest]), [
            'first-token',
            'first-token',
        ]);

        controller.reset();
        assert.equal(turnstile.calls.reset, 1);

        const retryRequest = controller.getTokenForSubmission();
        await flushPromises();
        assert.equal(turnstile.calls.execute, 2);
        turnstile.getCallbacks().callback('retry-token');
        assert.equal(await retryRequest, 'retry-token');
    });

    it('returns no token after a challenge failure and creates one fresh widget on retry', async () => {
        const turnstile = createTurnstileMock();
        const controller = createTurnstileController({} as HTMLElement, 'test-site-key');

        controller.initialize();
        await flushPromises();

        const failedRequest = controller.getTokenForSubmission();
        await flushPromises();
        turnstile.getCallbacks()['timeout-callback']();

        assert.equal(await failedRequest, '');
        assert.equal(turnstile.calls.execute, 1);
        assert.equal(turnstile.calls.remove, 1);

        const retryRequest = controller.getTokenForSubmission();
        await flushPromises();
        assert.equal(turnstile.calls.render, 2);
        assert.equal(turnstile.calls.execute, 2);

        turnstile.getCallbacks().callback('retry-token');
        assert.equal(await retryRequest, 'retry-token');
    });
});
