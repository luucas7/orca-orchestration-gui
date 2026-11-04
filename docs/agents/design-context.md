# Design Context

How agents should consume UI and design system conventions in this repository.

## Canonical Sources

- **Product truth**: [`PRODUCT.md`](../../PRODUCT.md)
- **UI & tokens guide**: [`docs/STYLEGUIDE.md`](../STYLEGUIDE.md)
- **Component primitives**: `src/renderer/src/components/ui/`
- **Canonical CSS & theme tokens**: `src/renderer/src/assets/main.css`

## Principles

- **Monochrome and quiet**: Chrome recedes; color is reserved for state (selection ring, destructive, git status).
- **Tokens before hex**: Always reach for CSS variables from `main.css` rather than hardcoded hex values.
- **Primitives before custom**: Use shadcn primitives in `src/renderer/src/components/ui/` before building custom UI wrappers.
