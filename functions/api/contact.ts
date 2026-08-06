import { z } from 'zod';

import { contactSchema, type ContactMessage } from '../../src/sections/contact/contactModel.ts';
import {
    escapeHtml,
    getFirstName,
    renderCustomerConfirmationBodyHtml,
    renderCustomerConfirmationText,
} from '../customerConfirmation.ts';
import { customerMessageDarkHtml } from '../generated/customer-message-dark.ts';

import { EMAIL_ATTACHMENTS, EMAIL_CID, type EmailAttachment } from '../emailAssets.ts';

const MAX_BODY_BYTES = 16_384;
const TURNSTILE_TOKEN_MAX_LENGTH = 2_048;
const TURNSTILE_TIMEOUT_MS = 5_000;
const RESEND_TIMEOUT_MS = 10_000;
const TURNSTILE_SITEVERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const contactRequestSchema = contactSchema.extend({
    turnstileToken: z.string().trim().min(1).max(TURNSTILE_TOKEN_MAX_LENGTH),
    website: z.string().default(''),
});

type ContactRequest = z.infer<typeof contactRequestSchema>;

interface Env {
    RESEND_API_KEY?: string;
    CONTACT_SENDER?: string;
    CONTACT_RECIPIENT?: string;
    SEND_VISITOR_CONFIRMATION?: string;
    TURNSTILE_SECRET_KEY?: string;
}

interface ContactFunctionContext {
    request: Request;
    env: Env;
}

interface ResendEmail {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html?: string;
    reply_to?: string;
    attachments?: EmailAttachment[];
}

const renderCustomerConfirmationHtml = ({ name, message }: ContactMessage): string =>
    customerMessageDarkHtml
        .replace(/{{\s*firstName\s*}}/g, escapeHtml(getFirstName(name)))
        .replace(/{{\s*message\s*}}/g, renderCustomerConfirmationBodyHtml(message))
        .replaceAll('{{assetMonogram}}', `cid:${EMAIL_CID.monogram}`)
        .replaceAll('{{assetGlobe}}', `cid:${EMAIL_CID.globe}`)
        .replaceAll('{{assetEmail}}', `cid:${EMAIL_CID.email}`)
        .replaceAll('{{assetLinkedIn}}', `cid:${EMAIL_CID.linkedIn}`)
        .replaceAll('{{assetLocation}}', `cid:${EMAIL_CID.location}`);

interface ContactServerConfig {
    apiKey: string;
    sender: string;
    recipient: string;
    sendVisitorConfirmation: boolean;
    turnstileSecretKey: string;
}

const emptyResponse = (status: number): Response =>
    new Response(null, { status, headers: NO_STORE_HEADERS });

const errorResponse = (status: number): Response => emptyResponse(status);
const successResponse = (): Response => emptyResponse(204);

const readServerConfig = (env: Env): ContactServerConfig | undefined => {
    const apiKey = env.RESEND_API_KEY?.trim();
    const sender = env.CONTACT_SENDER?.trim();
    const turnstileSecretKey = env.TURNSTILE_SECRET_KEY?.trim();
    const recipientResult = contactSchema.shape.email.safeParse(env.CONTACT_RECIPIENT);
    const senderEmail = sender?.match(/<([^<>]+)>$/)?.[1] ?? sender;

    if (
        !apiKey ||
        !sender ||
        !turnstileSecretKey ||
        /[\r\n]/.test(sender) ||
        !contactSchema.shape.email.safeParse(senderEmail).success ||
        !recipientResult.success
    ) {
        return undefined;
    }

    return {
        apiKey,
        sender,
        recipient: recipientResult.data,
        sendVisitorConfirmation: env.SEND_VISITOR_CONFIRMATION === 'true',
        turnstileSecretKey,
    };
};

const readJsonBody = async (request: Request): Promise<unknown | Response> => {
    const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
        return errorResponse(415);
    }

    const contentLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return errorResponse(413);
    }

    let body: string;
    try {
        body = await request.text();
    } catch {
        return errorResponse(400);
    }

    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
        return errorResponse(413);
    }

    let parsedBody: unknown;
    try {
        parsedBody = JSON.parse(body);
    } catch {
        return errorResponse(400);
    }

    return parsedBody;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const hasFilledHoneypot = (value: unknown): boolean =>
    isRecord(value) && typeof value.website === 'string' && value.website.trim().length > 0;

const readContactRequest = (value: unknown): ContactRequest | Response => {
    const result = contactRequestSchema.safeParse(value);
    return result.success ? result.data : errorResponse(400);
};

const createEmailBatch = (
    message: ContactMessage,
    sender: string,
    recipient: string,
    sendVisitorConfirmation: boolean,
): ResendEmail[] => {
    const emails: ResendEmail[] = [
        {
            from: sender,
            to: [recipient],
            reply_to: message.email,
            subject: `New portfolio contact message from ${message.name} — ${message.email}`,
            text: `Name: ${message.name}\nEmail: ${message.email}\n\nMessage:\n${message.message}`,
        },
    ];

    if (sendVisitorConfirmation) {
        emails.push({
            from: sender,
            to: [message.email],
            reply_to: recipient,
            subject: 'nowakkamil.com — Your message has been received',
            text: renderCustomerConfirmationText(message.message),
            html: renderCustomerConfirmationHtml(message),
            attachments: [...EMAIL_ATTACHMENTS],
        });
    }

    return emails;
};

const hasAcceptedCompleteBatch = (value: unknown, expectedCount: number): boolean => {
    if (!isRecord(value) || !Array.isArray(value.data) || value.data.length !== expectedCount) {
        return false;
    }

    return value.data.every(
        (item) => isRecord(item) && typeof item.id === 'string' && item.id.length > 0,
    );
};

type TurnstileVerificationResult = 'passed' | 'rejected' | 'unavailable';

const verifyTurnstile = async (
    token: string,
    secretKey: string,
    remoteIp: string | undefined,
): Promise<TurnstileVerificationResult> => {
    let response: Response;
    try {
        response = await fetch(TURNSTILE_SITEVERIFY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: secretKey,
                response: token,
                ...(remoteIp && { remoteip: remoteIp }),
            }),
            signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
        });
    } catch {
        return 'unavailable';
    }

    if (!response.ok) {
        return 'unavailable';
    }

    let result: unknown;
    try {
        result = await response.json();
    } catch {
        return 'unavailable';
    }

    if (!isRecord(result) || typeof result.success !== 'boolean') {
        return 'unavailable';
    }

    return result.success ? 'passed' : 'rejected';
};

export const onRequestPost = async ({
    request,
    env,
}: ContactFunctionContext): Promise<Response> => {
    const body = await readJsonBody(request);
    if (body instanceof Response) {
        return body;
    }

    if (hasFilledHoneypot(body)) {
        return successResponse();
    }

    const contactRequest = readContactRequest(body);
    if (contactRequest instanceof Response) {
        return contactRequest;
    }

    const config = readServerConfig(env);
    if (!config) {
        return errorResponse(500);
    }

    const remoteIp = request.headers.get('CF-Connecting-IP')?.trim() || undefined;
    const turnstileResult = await verifyTurnstile(
        contactRequest.turnstileToken,
        config.turnstileSecretKey,
        remoteIp,
    );
    if (turnstileResult === 'rejected') {
        return errorResponse(400);
    }
    if (turnstileResult === 'unavailable') {
        return errorResponse(502);
    }

    const message: ContactMessage = contactRequest;
    const sendVisitorConfirmation = config.sendVisitorConfirmation && turnstileResult === 'passed';

    const emailBatch = createEmailBatch(
        message,
        config.sender,
        config.recipient,
        sendVisitorConfirmation,
    );
    let resendResponse: Response;
    try {
        resendResponse = await fetch(RESEND_BATCH_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailBatch),
            signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        });
    } catch {
        return errorResponse(502);
    }

    if (!resendResponse.ok) {
        return errorResponse(502);
    }

    let resendResult: unknown;
    try {
        resendResult = await resendResponse.json();
    } catch {
        return errorResponse(502);
    }

    if (!hasAcceptedCompleteBatch(resendResult, emailBatch.length)) {
        return errorResponse(502);
    }

    return successResponse();
};
