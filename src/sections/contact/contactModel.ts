import { z } from 'zod';

export const contactSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'Enter at least 2 characters.')
        .max(80, 'Use 80 characters or fewer.'),

    email: z
        .string()
        .trim()
        .min(1, 'Enter your email address.')
        .max(254, 'Use 254 characters or fewer.')
        .pipe(
            z.email({
                error: 'Enter a valid email address.',
            }),
        ),

    message: z
        .string()
        .trim()
        .min(10, 'Enter at least 10 characters.')
        .max(4_000, 'Use 4,000 characters or fewer.'),
});

export type ContactMessage = z.infer<typeof contactSchema>;
