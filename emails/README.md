# Email templates

Email assets used by the portfolio contact flow and for direct correspondence.

## Files

| File                                         | Purpose                                         |
| -------------------------------------------- | ----------------------------------------------- |
| `customer-message-dark.mjml`                 | Source for the visitor confirmation email       |
| `signature/signature.automated.html`         | Signature embedded in the confirmation template |
| `signature/signature.html`                   | Source for the standalone Spark signature       |
| [`signature/README.md`](signature/README.md) | Signature build and installation instructions   |

`emails/dist/` and `functions/generated/customer-message-dark.ts` are generated files. Edit the source templates instead.

## Build

```bash
npm run email:build
```

This command validates and compiles the MJML, publishes the signature images, and generates:

- `emails/dist/customer-message-dark.html` — production HTML with template variables;
- `emails/dist/customer-message-dark.preview.html` — browser preview with sample content;
- `emails/signature/signature.preview.html` — standalone signature with resolved asset URLs;
- `functions/generated/customer-message-dark.ts` — HTML imported by the contact function;
- `public/email/` — published signature images.

Email generation is intentionally separate from the production site build and tests.

## Variables

| Variable        | Purpose                        |
| --------------- | ------------------------------ |
| `{{firstName}}` | Recipient's first name         |
| `{{message}}`   | Submitted contact-form message |

The contact function replaces and escapes these values before sending. If the compiled HTML is used elsewhere, replace and escape the values in trusted server-side code.

## Sending

The contact endpoint sends the confirmation as HTML with a plain-text fallback only when `SEND_VISITOR_CONFIRMATION=true`. For every other value, it sends only the internal contact notification.

After editing a template:

```bash
npm run email:build
npm test
```

Open `emails/dist/customer-message-dark.preview.html` to review the result, then send test messages to the email clients you support.
