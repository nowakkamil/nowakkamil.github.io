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

The build does not generate artwork. Glyphs in `src/assets/email/` are tinted to
the accent colour on the way out; `signature-wave.png` is published byte-for-byte.

## Signature wave

`src/assets/email/signature-wave.png` is the finished strip: already cropped to
the card's bottom band and carrying its own alpha, so it composites over the card
instead of pasting an opaque rectangle. The full-size render it was derived from
is not kept in this repo.

The strip cannot be re-derived from itself — it is cropped, downscaled and its
alpha is baked in. To change the artwork, start from a full-size render and apply
this recipe:

| Step         | Value                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| Crop         | `left 82, top 198, width 1356, height 823` — places the crest as the design does |
| Pad right to | `1574px` — so the strip spans the card's full inner width                        |
| Alpha        | `max(r, g, b)`, minus a black level of `10` (subtracted, not clipped)            |
| Colour       | un-premultiplied by `255 / max(r, g, b)`                                         |
| Resize width | `900px`, PNG without palette quantisation                                        |

Palette quantisation destroys the alpha, and the source's black is a pedestal
around `8` rather than `0` — both leave a visible haze if skipped.

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
