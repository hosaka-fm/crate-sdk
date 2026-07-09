# crate API explorer

A single-file, self-contained interactive explorer for the `@hosaka-fm/crate` client surface —
no external assets, CSP-safe, publishable as a standalone page.

The published page is **`index.html`**, which is **generated** from `template.html` by
`scripts/gen-docs.mjs` (run via `npm run docs:gen` or `npm run docs:build` from the repo root).
Edit **`template.html`**, never `index.html` — hand edits to the generated file are overwritten and
fail the docs drift check.

> **Designers:** to restyle the explorer, start with [`DESIGN-ONBOARDING.md`](./DESIGN-ONBOARDING.md)
> — the inline design tokens, the (non-tokenized) colors to watch when re-paletting, and how to
> regenerate.
