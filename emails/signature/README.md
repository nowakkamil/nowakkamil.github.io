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
