import type { ContactMessage } from './contactModel';

export type ContactSubmissionResult =
    | { kind: 'success' }
    | { kind: 'validation-failure' }
    | { kind: 'rate-limited'; retryAfterSeconds?: number }
    | { kind: 'network-failure' }
    | { kind: 'server-failure' };

export interface ContactSubmissionProtection {
    turnstileToken: string;
    website: string;
}

export interface ContactSubmissionService {
    submit(
        message: ContactMessage,
        protection: ContactSubmissionProtection,
    ): Promise<ContactSubmissionResult>;
}
