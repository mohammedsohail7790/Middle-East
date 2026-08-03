# Design — Call IQ Dashboard

Locked design system for the Call IQ app. Enterprise modern-minimal (Hallmark Workbench + custom navy palette).

## Genre

modern-minimal

## Macrostructure family

- **App pages (dashboard):** Workbench — persistent sidebar, top command bar, content canvas with stat grid + panels
- **Auth pages:** Split panel — brand left, form right

## Theme

- `--color-paper` oklch(99.2% 0.004 265)
- `--color-paper-2` oklch(97.2% 0.007 265) — main canvas
- `--color-ink` oklch(19.5% 0.038 265)
- `--color-ink-2` oklch(42% 0.028 265)
- `--color-rule` oklch(90.5% 0.012 265)
- `--color-accent` oklch(48% 0.12 265)
- `--color-sidebar` oklch(17.5% 0.042 265)

## Typography

- Display & body: Inter (next/font), weights 400–800
- Tracking: -0.025em on headings, -0.01em on labels

## Motion

motion-cut for app shell; opacity/transform only; `prefers-reduced-motion` respected.

## CTA voice

Declarative, specific. No invented metrics or fake social proof.
