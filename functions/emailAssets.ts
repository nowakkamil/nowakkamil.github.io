import { EMAIL_THEME_ASSET_BASE64 } from './generated/email-theme-assets.ts';

export type EmailAttachment = Readonly<{
    filename: string;
    content: string;
    contentId: string;
}>;

export const EMAIL_CID = {
    monogram: 'kn-monogram',
    globe: 'signature-globe',
    email: 'signature-email',
    linkedIn: 'signature-linkedin',
    location: 'signature-location',
    wave: 'signature-wave',
} as const;

export const EMAIL_ASSETS = {
    monogram: {
        filename: 'kn-monogram.png',
        contentId: EMAIL_CID.monogram,
        content: EMAIL_THEME_ASSET_BASE64.monogram,
    },
    globe: {
        filename: 'globe.png',
        contentId: EMAIL_CID.globe,
        content: EMAIL_THEME_ASSET_BASE64.globe,
    },
    email: {
        filename: 'email.png',
        contentId: EMAIL_CID.email,
        content: EMAIL_THEME_ASSET_BASE64.email,
    },
    linkedIn: {
        filename: 'linkedin.png',
        contentId: EMAIL_CID.linkedIn,
        content: EMAIL_THEME_ASSET_BASE64.linkedIn,
    },
    location: {
        filename: 'location.png',
        contentId: EMAIL_CID.location,
        content: EMAIL_THEME_ASSET_BASE64.location,
    },
    wave: {
        filename: 'signature-wave.png',
        contentId: EMAIL_CID.wave,
        content: EMAIL_THEME_ASSET_BASE64.wave,
    },
} as const satisfies Record<string, EmailAttachment>;

export const EMAIL_ATTACHMENTS: readonly EmailAttachment[] = Object.values(EMAIL_ASSETS);
