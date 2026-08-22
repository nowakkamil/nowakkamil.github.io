export const customerConfirmationPreview = {
    name: 'John',
    message:
        'I would like to discuss a new digital product for our team. We need help refining the experience and building a fast, reliable first release.',
} as const;

export const escapeHtml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const LONG_TOKEN_MIN_LENGTH = 48;
const LONG_TOKEN_CHUNK_LENGTH = 32;

const renderBreakableToken = (token: string): string => {
    const characters = Array.from(token);
    if (characters.length < LONG_TOKEN_MIN_LENGTH) {
        return escapeHtml(token);
    }

    const chunks: string[] = [];
    for (let index = 0; index < characters.length; index += LONG_TOKEN_CHUNK_LENGTH) {
        chunks.push(escapeHtml(characters.slice(index, index + LONG_TOKEN_CHUNK_LENGTH).join('')));
    }

    return chunks.join('&#8203;');
};

export const renderBreakableHtml = (value: string): string =>
    value
        .replace(/\r\n?/g, '\n')
        .split(/(\n|[^\S\n]+)/)
        .map((part) => {
            if (part === '\n') {
                return '<br />';
            }

            return /^\s+$/.test(part) ? escapeHtml(part) : renderBreakableToken(part);
        })
        .join('');
export const getFirstName = (name: string): string => name.trim().split(/\s+/, 1)[0] ?? '';

export const renderCustomerConfirmationBodyHtml = (message: string): string => {
    const quotedMessage = renderBreakableHtml(message);

    return (
        '<p style="margin: 0 0 16px 0;">Your message has been received. Here is a copy for your records:</p>' +
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; max-width: 100%; margin: 0 0 24px 0; border: 1px solid #173a61; border-left: 3px solid #53a4ff; border-radius: 5px; background-color: #020a18; table-layout: fixed;"><tr><td width="44" valign="top" style="width: 44px; padding: 14px 0 14px 18px; color: #53a4ff; font-size: 30px; font-weight: 700; line-height: 30px;">&ldquo;</td><td style="padding: 17px 8px; color: #f2f6fb; font-size: 16px; line-height: 27px; overflow-wrap: anywhere; word-break: break-word; word-wrap: break-word;">${quotedMessage}</td><td width="42" valign="bottom" align="right" style="width: 42px; padding: 14px 18px 14px 0; color: #53a4ff; font-size: 30px; font-weight: 700; line-height: 30px;">&rdquo;</td></tr></table>` +
        '<p style="margin: 0;">I’ll review it and reply as soon as possible.</p>'
    );
};

export const renderCustomerConfirmationText = (message: string): string =>
    `Your message has been received. Here is a copy for your records:\n\n${message}\n\nI’ll review it and reply as soon as possible.`;
