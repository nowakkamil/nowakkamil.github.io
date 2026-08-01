import type { ContactMessage } from './contactModel';
import type { ContactSubmissionResult, ContactSubmissionService } from './contactSubmissionService';

const DEFAULT_CONTACT_ENDPOINT = '/api/contact';

const getRetryAfterSeconds = (response: Response): number | undefined => {
    const retryAfter = response.headers.get('Retry-After');

    if (!retryAfter) {
        return undefined;
    }

    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.ceil(seconds);
    }

    const retryDate = Date.parse(retryAfter);
    if (Number.isNaN(retryDate)) {
        return undefined;
    }

    return Math.max(0, Math.ceil((retryDate - Date.now()) / 1_000));
};

const mapResponse = (response: Response): ContactSubmissionResult => {
    if (response.ok) {
        return { kind: 'success' };
    }

    if (response.status === 400 || response.status === 422) {
        return { kind: 'validation-failure' };
    }

    if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response);

        return {
            kind: 'rate-limited',
            ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
        };
    }

    return { kind: 'server-failure' };
};

export const createHttpContactSubmissionService = (
    endpoint = DEFAULT_CONTACT_ENDPOINT,
): ContactSubmissionService => ({
    async submit(message: ContactMessage): Promise<ContactSubmissionResult> {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });

            return mapResponse(response);
        } catch {
            return { kind: 'network-failure' };
        }
    },
});
