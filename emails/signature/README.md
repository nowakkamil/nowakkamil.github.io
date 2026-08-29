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
anything narrower the two stack. Which way round that default runs is the whole
design of this file, because **Gmail drops the `<style>` block** — its mobile app
was once rendering the text one character per line as a result. Anything the
phone layout needs therefore has to hold with no CSS at all.

So the inline styles describe the _stacked_ layout, and `@media (min-width: 789px)`
builds the pair back up. Each column is `width: 100%` with no inline cap, which
stacks; the media query restores the `max-width` that lets the two sit side by
side:

| Variant                    | Card    | Inner width | Monogram | Content |
| -------------------------- | ------- | ----------- | -------- | ------- |
| `signature.html`           | `760px` | `672px`     | `230px`  | `330px` |
| `signature.automated.html` | `680px` | `564px`     | `230px`  | `330px` |

The inner width is the card minus its `44px` gutters, and its borders where it
has them. In the automated variant the pair is deliberately a few pixels short of
it, so rounding cannot break the desktop layout by accident.

Two consequences worth keeping in mind when editing:

- the two column `<div>`s must stay whitespace-adjacent (hence `</div

> <div`),
> because one collapsed space between them is enough to tip the pair over;

- changing a gutter, a border or the body width changes the inner width, so the
  column `max-width` values have to move with it.

Outlook ignores `inline-block` and `max-width`, so it gets the columns through a
ghost table instead and always renders the desktop layout.

The point of running the default this way is that a client with no CSS can never
produce the one combination that looks broken: the two columns side by side under
a centred heading. Without the media query the layout always stacks, and stacked
is the state the centring is designed for.

## The stacked layout is inline, not a media query

Gmail drops the `<style>` block, so anything the phone layout needs has to
survive without it. The `@media` rules therefore only ever _refine_ the stacked
treatment — sizes, gutters, the smaller monogram. What decides the alignment is
inline:

| Element                         | Inline (stacked)               | `min-width: 789px` restores      |
| ------------------------------- | ------------------------------ | -------------------------------- |
| `-monogram-column`              | no cap, `padding-bottom: 32px` | `max-width`, `padding-bottom: 0` |
| `-content-column`               | no cap                         | `max-width`                      |
| `-columns` wrapper              | `text-align: center`           | `text-align: left`               |
| `-monogram-cell`                | `padding: 0`                   | `padding-left: 44px`             |
| `-name`, `-eyebrow`, `-tagline` | `text-align: center`           | `text-align: left`               |
| `-contact-table`                | shrink-to-fit, `margin: auto`  | `margin-left: 0`                 |

The wrapper's `text-align: center` is what keeps the monogram on the same axis as
the name. Both columns keep their `max-width` when stacked, so centring each of
them individually would put the `230px` monogram column and the `330px` text
column on different centres; centring the wrapper centres both as inline-blocks
against the frame instead. The contact table takes `text-align: left` back, since
it is a list rather than a heading.

Outlook reads neither media query, so an `<!--[if mso]>` style block next to the
main one hands it the same desktop values. The contact table is the exception it
does not need: Word has no support for `auto` margins on a table, so it ignores
the centring on its own.

Two things follow from this arrangement:

- adding a phone-only rule to the `<style>` block alone is not enough — if it
  affects alignment it has to be inline, with the desktop value in _both_ the
  `min-width: 789px` block and the `mso` block;
- the frame's `padding-left` no longer has to be tuned per breakpoint to keep the
  signature off the card's edge, because the gutter is produced by the centring
  rather than measured out.
