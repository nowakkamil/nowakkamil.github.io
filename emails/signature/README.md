# Email signature

Standalone signature for Spark Desktop and a separate variant embedded in automated emails.

## Files

| File                       | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `signature.html`           | Source for the standalone signature                |
| `signature.preview.html`   | Generated fragment with production asset URLs      |
| `signature.automated.html` | Source embedded in the customer confirmation email |

## Build and preview

From the repository root, run:

```bash
npm run email:build
```

Open `signature.preview.html` in a browser to review the generated signature.

## Layout

The monogram sits beside the text only while the card is at its full width; at
anything narrower the two stack. That switch cannot depend on the `<style>`
block — Gmail drops it, and its mobile app was rendering the text one character
per line as a result — so it is carried by inline styles alone. Each column is
`width: 100%` capped by a `max-width`, which makes them wrap the moment the pair
no longer fits and keeps either one from ever exceeding the card:

| Variant                    | Card    | Inner width | Monogram | Content |
| -------------------------- | ------- | ----------- | -------- | ------- |
| `signature.html`           | `760px` | `670px`     | `230px`  | `438px` |
| `signature.automated.html` | `680px` | `564px`     | `230px`  | `330px` |

The inner width is the card minus its `44px` gutters, and its borders where it
has them. The column widths are deliberately a couple of pixels short of it, so
rounding cannot stack the desktop layout by accident.

Two consequences worth keeping in mind when editing:

- the two column `<div>`s must stay whitespace-adjacent (hence `</div\n><div`),
  because one collapsed space between them is enough to tip the pair over;
- changing a gutter, a border or the body width changes the inner width, so the
  column `max-width` values have to move with it.

Outlook ignores `inline-block` and `max-width`, so it gets the columns through a
ghost table instead and always renders the desktop layout. The `<style>` block
still runs where it survives, adding the centred, small-monogram phone treatment
below `600px`.
