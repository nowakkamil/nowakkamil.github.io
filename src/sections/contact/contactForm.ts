import { contactSchema, type ContactMessage } from './contactModel';
import type { ContactSubmissionResult } from './contactSubmissionService';
import { createHttpContactSubmissionService } from './httpContactSubmissionService';

const TURNSTILE_SCRIPT_URL =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
    render(
        container: HTMLElement,
        options: {
            sitekey: string;
            action: string;
            appearance: 'interaction-only';
            theme: 'dark';
            size: 'flexible';
            callback: (token: string) => void;
            'error-callback': () => void;
            'expired-callback': () => void;
            'timeout-callback': () => void;
        },
    ): string;
    reset(widgetId: string): void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

let turnstileApiPromise: Promise<TurnstileApi> | undefined;

const loadTurnstileApi = (): Promise<TurnstileApi> => {
    if (window.turnstile) {
        return Promise.resolve(window.turnstile);
    }

    turnstileApiPromise ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
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

    return turnstileApiPromise;
};

const createTurnstileController = (container: HTMLElement) => {
    let token = '';
    let widgetId: string | undefined;
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
    const clearToken = (): void => {
        token = '';
    };

    if (sitekey) {
        void loadTurnstileApi()
            .then((turnstile) => {
                widgetId = turnstile.render(container, {
                    sitekey,
                    action: 'contact',
                    appearance: 'interaction-only',
                    theme: 'dark',
                    size: 'flexible',
                    callback: (responseToken) => {
                        token = responseToken;
                    },
                    'error-callback': clearToken,
                    'expired-callback': clearToken,
                    'timeout-callback': clearToken,
                });
            })
            .catch(clearToken);
    }

    return {
        getToken: (): string => token,
        reset: (): void => {
            clearToken();
            if (widgetId && window.turnstile) {
                window.turnstile.reset(widgetId);
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

export const initContactForm = (): void => {
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

    const validateField = (field: ContactField): string | undefined => {
        const result = contactSchema.shape[field].safeParse(state.values[field]);

        return result.success ? undefined : result.error.issues[0]?.message;
    };

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

        const result = contactSchema.safeParse(state.values);

        if (result.success) {
            state.values = result.data;
            state.errors = {};
            contactFields.forEach(renderFieldError);
            return result.data;
        }

        const errors: ContactFormState['errors'] = {};

        result.error.issues.forEach((issue) => {
            const field = issue.path[0];

            if ((field === 'name' || field === 'email' || field === 'message') && !errors[field]) {
                errors[field] = issue.message;
            }
        });

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
            const result = await submissionService.submit(message, {
                turnstileToken: turnstile.getToken(),
                website: honeypotControl.value,
            });
            turnstile.reset();
            handleSubmissionResult(result);
        } catch {
            turnstile.reset();
            setFormStatus('server-failure');
        }
    });
};
