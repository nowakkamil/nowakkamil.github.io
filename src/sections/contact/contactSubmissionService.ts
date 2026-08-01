import type { ContactMessage } from './contactModel';

export type ContactSubmissionResult =
    | { kind: 'success' }
    | { kind: 'validation-failure' }
    | { kind: 'rate-limited'; retryAfterSeconds?: number }
    | { kind: 'network-failure' }
    | { kind: 'server-failure' };

export interface ContactSubmissionService {
    submit(message: ContactMessage): Promise<ContactSubmissionResult>;
}
