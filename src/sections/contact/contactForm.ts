import type { ContactMessage } from './contactModel';
import type { ContactSubmissionResult } from './contactSubmissionService';
import { createHttpContactSubmissionService } from './httpContactSubmissionService';

const TURNSTILE_SCRIPT_URL =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_STARTUP_TIMEOUT_MS = 8_000;
const TURNSTILE_SUBMISSION_TIMEOUT_MS = 15_000;
const TURNSTILE_TOKEN_MAX_AGE_MS = 270_000;

interface TurnstileApi {
    render(
        container: HTMLElement,
        options: {
            sitekey: string;
            action: string;
            appearance: 'interaction-only';
            execution: 'execute';
            theme: 'dark';
            size: 'flexible';
            callback: (token: string) => void;
            'error-callback': () => void;
            'expired-callback': () => void;
            'timeout-callback': () => void;
        },
    ): string;
    execute(container: HTMLElement): void;
    isExpired(widgetId: string): boolean;
    remove(widgetId: string): void;
    reset(widgetId: string): void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

let turnstileApiPromise: Promise<TurnstileApi> | undefined;
let pendingTurnstileScript: HTMLScriptElement | undefined;
let cancelPendingTurnstileApiLoad: (() => void) | undefined;

const loadTurnstileApi = (): Promise<TurnstileApi> => {
    if (window.turnstile) {
        return Promise.resolve(window.turnstile);
    }

    if (!turnstileApiPromise) {
        const script = document.createElement('script');
        let cancelLoad = (): void => undefined;
        const apiPromise = new Promise<TurnstileApi>((resolve, reject) => {
            cancelLoad = () => reject(new Error('Turnstile API load cancelled'));
            script.src = TURNSTILE_SCRIPT_URL;
            script.async = true;
            script.defer = true;
            script.addEventListener('load', () => {
                if (window.turnstile) {
                    resolve(window.turnstile);
                } else {
                    reject(new Error('Turnstile API unavailable'));
                }
            });
            script.addEventListener('error', () => reject(new Error('Turnstile API unavailable')));
            document.head.append(script);
        });

        turnstileApiPromise = apiPromise;
        pendingTurnstileScript = script;
        cancelPendingTurnstileApiLoad = cancelLoad;

        void apiPromise.then(
            () => {
                if (turnstileApiPromise === apiPromise) {
                    pendingTurnstileScript = undefined;
                    cancelPendingTurnstileApiLoad = undefined;
                }
            },
            () => {
                script.remove();
                if (turnstileApiPromise === apiPromise) {
                    turnstileApiPromise = undefined;
                    pendingTurnstileScript = undefined;
                    cancelPendingTurnstileApiLoad = undefined;
                }
            },
        );
    }

    return turnstileApiPromise;
};

const cancelTurnstileApiLoad = (): void => {
    if (window.turnstile || !pendingTurnstileScript) {
        return;
    }

    pendingTurnstileScript.remove();
    cancelPendingTurnstileApiLoad?.();
};

const waitWithTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
): Promise<T> => {
    let timeoutId = 0;
    const timeout = new Promise<T>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        window.clearTimeout(timeoutId);
    }
};

const createTurnstileController = (container: HTMLElement) => {
    let token = '';
    let tokenIssuedAt = 0;
    let widget: { api: TurnstileApi; id: string } | undefined;
    let widgetInitialization: Promise<{ api: TurnstileApi; id: string } | undefined> | undefined;
    let activeChallenge: Promise<string> | undefined;
    let resolveActiveChallenge: ((responseToken: string) => void) | undefined;
    let widgetGeneration = 0;
    let needsReset = false;
    let suspended = false;
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
    const clearToken = (): void => {
        token = '';
        tokenIssuedAt = 0;
    };

    const settleActiveChallenge = (responseToken: string): void => {
        resolveActiveChallenge?.(responseToken);
        resolveActiveChallenge = undefined;
        activeChallenge = undefined;
    };

    const handleChallengeFailure = (generation: number): void => {
        if (generation !== widgetGeneration) {
            return;
        }

        clearToken();
        needsReset = true;
        settleActiveChallenge('');
    };

    const initializeWidget = (): Promise<{ api: TurnstileApi; id: string } | undefined> => {
        if (!sitekey || suspended) {
            return Promise.resolve(undefined);
        }
        if (widget) {
            return Promise.resolve(widget);
        }
        if (widgetInitialization) {
            return widgetInitialization;
        }

        const generation = ++widgetGeneration;
        widgetInitialization = loadTurnstileApi()
            .then((turnstile) => {
                if (suspended || generation !== widgetGeneration) {
                    return undefined;
                }

                const id = turnstile.render(container, {
                    sitekey,
                    action: 'contact',
                    appearance: 'interaction-only',
                    execution: 'execute',
                    theme: 'dark',
                    size: 'flexible',
                    callback: (responseToken) => {
                        if (generation !== widgetGeneration) {
                            return;
                        }

                        token = responseToken;
                        tokenIssuedAt = Date.now();
                        needsReset = false;
                        settleActiveChallenge(responseToken);
                    },
                    'error-callback': () => handleChallengeFailure(generation),
                    'expired-callback': () => handleChallengeFailure(generation),
                    'timeout-callback': () => handleChallengeFailure(generation),
                });
                widget = { api: turnstile, id };
                return widget;
            })
            .catch(() => undefined)
            .finally(() => {
                widgetInitialization = undefined;
            });

        return widgetInitialization;
    };

    const hasFreshToken = (): boolean => {
        if (!token || Date.now() - tokenIssuedAt >= TURNSTILE_TOKEN_MAX_AGE_MS) {
            return false;
        }

        try {
            return !widget?.api.isExpired(widget.id);
        } catch {
            return true;
        }
    };

    const requestToken = async (): Promise<string> => {
        if (hasFreshToken()) {
            return token;
        }
        if (token) {
            clearToken();
            needsReset = true;
        }
        if (activeChallenge) {
            return activeChallenge;
        }

        const initializedWidget = await initializeWidget();
        if (!initializedWidget) {
            return '';
        }
        if (hasFreshToken()) {
            return token;
        }
        if (activeChallenge) {
            return activeChallenge;
        }

        if (needsReset) {
            initializedWidget.api.reset(initializedWidget.id);
            needsReset = false;
        }

        const challenge = new Promise<string>((resolve) => {
            resolveActiveChallenge = resolve;
        });
        activeChallenge = challenge;

        try {
            initializedWidget.api.execute(container);
        } catch {
            handleChallengeFailure(widgetGeneration);
        }

        return challenge;
    };

    const suspend = (): void => {
        suspended = true;
        clearToken();
        settleActiveChallenge('');
        cancelTurnstileApiLoad();

        if (!widget) {
            return;
        }

        const currentWidget = widget;
        widget = undefined;
        widgetGeneration += 1;
        needsReset = false;
        currentWidget.api.remove(currentWidget.id);
    };

    return {
        prepareForStartup: async (): Promise<void> => {
            suspended = false;
            const responseToken = await waitWithTimeout(
                requestToken(),
                TURNSTILE_STARTUP_TIMEOUT_MS,
                '',
            );
            if (!responseToken) {
                suspend();
            }
        },
        getTokenForSubmission: async (): Promise<string> => {
            suspended = false;
            return waitWithTimeout(requestToken(), TURNSTILE_SUBMISSION_TIMEOUT_MS, '');
        },
        reset: (): void => {
            clearToken();
            settleActiveChallenge('');
            if (widget) {
                widget.api.reset(widget.id);
                needsReset = false;
            }
        },
    };
};

const contactFields = ['name', 'email', 'message'] as const satisfies ReadonlyArray<
    keyof ContactMessage
>;

type ContactField = (typeof contactFields)[number];
type ContactFormStatus =
    | 'idle'
    | 'validation-failure'
    | 'submitting'
    | 'success'
    | 'rate-limited'
    | 'network-failure'
    | 'server-failure';
type ContactFieldControl = HTMLInputElement | HTMLTextAreaElement;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateContactField = (field: ContactField, value: string): string | undefined => {
    const length = value.trim().length;

    if (field === 'name') {
        if (length < 2) {
            return 'Enter at least 2 characters.';
        }
        return length > 80 ? 'Use 80 characters or fewer.' : undefined;
    }

    if (field === 'email') {
        if (length === 0) {
            return 'Enter your email address.';
        }
        if (length > 254) {
            return 'Use 254 characters or fewer.';
        }
        return EMAIL_PATTERN.test(value.trim()) ? undefined : 'Enter a valid email address.';
    }

    if (length < 10) {
        return 'Enter at least 10 characters.';
    }
    return length > 4_000 ? 'Use 4,000 characters or fewer.' : undefined;
};

const contactFormMessages: Record<ContactFormStatus, string> = {
    idle: '',
    'validation-failure': 'Please review your details and try again.',
    submitting: 'Sending your message…',
    success: 'Your message has been sent. Thank you.',
    'rate-limited': 'Please wait a moment before trying to send another message.',
    'network-failure': 'The contact service is unavailable right now. Please try again later.',
    'server-failure': 'The contact service is unavailable right now. Please try again later.',
};

interface ContactFormState {
    values: ContactMessage;
    touched: Record<ContactField, boolean>;
    errors: Partial<Record<ContactField, string>>;
    status: ContactFormStatus;
}

export const initContactForm = async (): Promise<void> => {
    const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
    const statusRegion = form?.querySelector<HTMLElement>('[data-contact-form-status]');
    const nameControl = form?.elements.namedItem('name');
    const emailControl = form?.elements.namedItem('email');
    const messageControl = form?.elements.namedItem('message');
    const honeypotControl = form?.elements.namedItem('website');
    const turnstileContainer = form?.querySelector<HTMLElement>('[data-turnstile]');
    const nameError = form?.querySelector<HTMLElement>('[data-field-error="name"]');
    const emailError = form?.querySelector<HTMLElement>('[data-field-error="email"]');
    const messageError = form?.querySelector<HTMLElement>('[data-field-error="message"]');
    const submitButton = form?.querySelector<HTMLButtonElement>('[data-contact-submit]');
    const submitLabel = submitButton?.querySelector<HTMLElement>('[data-contact-submit-label]');
    const submitProgress = submitButton?.querySelector<HTMLElement>(
        '[data-contact-submit-progress]',
    );

    if (
        !form ||
        !statusRegion ||
        !(nameControl instanceof HTMLInputElement) ||
        !(emailControl instanceof HTMLInputElement) ||
        !(messageControl instanceof HTMLTextAreaElement) ||
        !(honeypotControl instanceof HTMLInputElement) ||
        !turnstileContainer ||
        !nameError ||
        !emailError ||
        !messageError ||
        !submitButton ||
        !submitLabel ||
        !submitProgress
    ) {
        return;
    }

    const controls: Record<ContactField, ContactFieldControl> = {
        name: nameControl,
        email: emailControl,
        message: messageControl,
    };
    const errorElements: Record<ContactField, HTMLElement> = {
        name: nameError,
        email: emailError,
        message: messageError,
    };
    const state: ContactFormState = {
        values: {
            name: nameControl.value,
            email: emailControl.value,
            message: messageControl.value,
        },
        touched: {
            name: false,
            email: false,
            message: false,
        },
        errors: {},
        status: 'idle',
    };
    const submissionService = createHttpContactSubmissionService(
        form.dataset.contactEndpoint || undefined,
    );
    const turnstile = createTurnstileController(turnstileContainer);

    const revealPrivacyNotice = (): void => {
        form.dataset.messageInteracted = 'true';
    };

    form.dataset.contactFormReady = 'true';
    if (messageControl.value.trim()) {
        revealPrivacyNotice();
    }
    messageControl.addEventListener('focus', revealPrivacyNotice, { once: true });

    const setSubmitting = (submitting: boolean): void => {
        submitButton.disabled = submitting;
        submitLabel.hidden = submitting;
        submitProgress.hidden = !submitting;

        if (submitting) {
            submitButton.setAttribute('aria-busy', 'true');
            form.setAttribute('aria-busy', 'true');
        } else {
            submitButton.removeAttribute('aria-busy');
            form.removeAttribute('aria-busy');
        }
    };

    const setFormStatus = (status: ContactFormStatus): void => {
        state.status = status;
        statusRegion.dataset.status = status;
        statusRegion.textContent = contactFormMessages[status];
        setSubmitting(status === 'submitting');
    };

    const validateField = (field: ContactField): string | undefined =>
        validateContactField(field, state.values[field]);

    const renderFieldError = (field: ContactField): void => {
        const message = state.touched[field] ? state.errors[field] : undefined;

        errorElements[field].textContent = message ?? '';
        errorElements[field].hidden = !message;
        if (message) {
            controls[field].setAttribute('aria-invalid', 'true');
        } else {
            controls[field].removeAttribute('aria-invalid');
        }
    };

    contactFields.forEach((field) => {
        controls[field].addEventListener('input', () => {
            state.values[field] = controls[field].value;

            if (state.status !== 'idle' && state.status !== 'submitting') {
                setFormStatus('idle');
            }

            if (state.touched[field] && state.errors[field] && !validateField(field)) {
                delete state.errors[field];
                renderFieldError(field);
            }
        });

        controls[field].addEventListener('blur', () => {
            state.touched[field] = true;

            const error = validateField(field);

            if (error) {
                state.errors[field] = error;
            } else {
                delete state.errors[field];
            }

            renderFieldError(field);
        });
    });

    const resetFormState = (): void => {
        form.reset();
        state.values = {
            name: '',
            email: '',
            message: '',
        };
        state.touched = {
            name: false,
            email: false,
            message: false,
        };
        state.errors = {};
        contactFields.forEach(renderFieldError);
    };

    const handleSubmissionResult = (result: ContactSubmissionResult): void => {
        if (result.kind === 'success') {
            resetFormState();
            setFormStatus('success');
            return;
        }

        setFormStatus(result.kind);
    };

    const validateForm = (): ContactMessage | null => {
        const formData = new FormData(form);
        state.values = {
            name: String(formData.get('name') ?? ''),
            email: String(formData.get('email') ?? ''),
            message: String(formData.get('message') ?? ''),
        };

        const errors: ContactFormState['errors'] = {};
        contactFields.forEach((field) => {
            const error = validateField(field);
            if (error) {
                errors[field] = error;
            }
        });

        if (Object.keys(errors).length === 0) {
            state.values = {
                name: state.values.name.trim(),
                email: state.values.email.trim(),
                message: state.values.message.trim(),
            };
            state.errors = {};
            contactFields.forEach(renderFieldError);
            return state.values;
        }

        state.errors = errors;
        setFormStatus('validation-failure');

        contactFields.forEach((field) => {
            if (state.errors[field]) {
                state.touched[field] = true;
            }

            renderFieldError(field);
        });

        const firstInvalidField = contactFields.find((field) => state.errors[field]);
        if (firstInvalidField) {
            controls[firstInvalidField].focus();
        }

        return null;
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (state.status === 'submitting') {
            return;
        }

        const message = validateForm();
        if (!message) {
            return;
        }

        setFormStatus('submitting');

        try {
            const turnstileToken = await turnstile.getTokenForSubmission();
            const result = await submissionService.submit(message, {
                turnstileToken,
                website: honeypotControl.value,
            });
            turnstile.reset();
            handleSubmissionResult(result);
        } catch {
            turnstile.reset();
            setFormStatus('server-failure');
        }
    });

    await turnstile.prepareForStartup();
};
