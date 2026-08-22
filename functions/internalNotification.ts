import type { ContactMessage } from '../src/sections/contact/contactModel.ts';

import { renderBreakableHtml } from './customerConfirmation.ts';

export const internalNotificationPreview: ContactMessage = {
    name: 'Alex Morgan',
    email: 'alex@example.com',
    message:
        'Hello,\n\nI am planning a new digital product and would like to discuss the experience, technical approach, and a realistic delivery timeline.',
};

export const renderInternalNotificationMessageHtml = (message: string): string =>
    renderBreakableHtml(message);

export const renderInternalNotificationText = ({ name, email, message }: ContactMessage): string =>
    `New inquiry from ${name}\n${email}\n\n${message}`;
