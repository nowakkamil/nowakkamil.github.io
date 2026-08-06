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

export const getFirstName = (name: string): string => name.trim().split(/\s+/, 1)[0] ?? '';

export const renderCustomerConfirmationBodyHtml = (message: string): string => {
    const quotedMessage = escapeHtml(message).replace(/\r\n?|\n/g, '<br />');

    return (
        '<p style="margin: 0 0 16px 0;">Your message has been received. Here is a copy for your records:</p>' +
        `<blockquote style="margin: 0 0 20px 0; padding: 10px 14px; border-left: 2px solid #159bb0; background-color: #050c14; color: #dfe6ed; line-height: 1.65;">${quotedMessage}</blockquote>` +
        '<p style="margin: 0;">I’ll review it and reply as soon as possible.</p>'
    );
};

export const renderCustomerConfirmationText = (message: string): string =>
    `Your message has been received. Here is a copy for your records:\n\n${message}\n\nI’ll review it and reply as soon as possible.`;
