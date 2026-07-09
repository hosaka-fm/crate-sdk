# crate docs site

A static **Astro Starlight** shell over the SDK's single-source generation pipeline. It owns no
content — it renders sources of truth that already live in this repo. **It is never shipped in the
npm package** (Astro/Starlight are docs-build `devDependencies` of this sub-project only; the
SDK's zero-runtime-dependency guarantee is untouched).

Full design: [`grimoires/loa/proposals/crate-docs-site-architecture.md`](../grimoires/loa/proposals/crate-docs-site-architecture.md).

> **Designers:** to restyle this site, start with [`DESIGN-ONBOARDING.md`](./DESIGN-ONBOARDING.md) —
> where the styling lives (`src/styles/custom.css`), the design tokens, fonts, and which files are
> safe to edit vs. regenerated.

## Commands

```sh
cd site
npm install      # one-time (resolves Astro + Starlight + plugins)
npm run dev      # local dev server
npm run build    # static site → site/dist/
npm run preview  # serve the built site
```

## Sources of truth (this site renders, never authors)

| Section                                         | Rendered from                                  | Owner                    |
| ----------------------------------------------- | ---------------------------------------------- | ------------------------ |
| API reference (`/api/*`)                        | `../spec/openapi.json` via `starlight-openapi` | **crate API team**       |
| Concepts (`/concepts/*`)                        | spec `x-concepts`                              | crate API team           |
| SDK reference (`/sdk/*`)                        | `../meta/surface.json` (from TSDoc)            | SDK team                 |
| Guides (`/guides/*`)                            | `../docs/*.md`                                 | SDK team (hand-authored) |
| Changelog                                       | `../CHANGELOG.md`                              | generated                |
| `llms.txt` / `llms-full.txt` / `llms-small.txt` | whole corpus, via `starlight-llms-txt`         | generated                |

## Wired now (scaffold)

- Astro Starlight shell, IA sidebar, splash page, dark mode + Pagefind search (built in).
- **API reference** rendered live from `../spec/openapi.json` (`starlight-openapi`).
- **Agent surfaces** — `starlight-llms-txt` emits the three `llms*.txt` files at build.
- A 60-second quickstart (keyless-first).

## Phase 1 TODO (generators — not yet wired)

These are documented in the architecture doc and left as the next step:

1. **Content sync** — copy `../docs/*.md` → `src/content/docs/guides/` at build (one source, git-ignored copies).
2. **SDK reference pages** — extend `../scripts/gen-docs.mjs` to emit `src/content/docs/sdk/<method>.md` from `meta/surface.json`.
3. **Concepts pages** — emit `src/content/docs/concepts/<term>.md` from spec `x-concepts` (gated on the spec path-consistency fix — `x-concepts[].see` still references `/api/v1`).
4. **Explorer embed** — surface `explorer/index.html` at `/explorer` with `#fn-<name>` deep links.
5. **Changelog render** — from `../CHANGELOG.md`.
6. **`gen-xref.mjs`** — endpoint ↔ SDK-method cross-link map from `surface.json`.
7. **Widen `docs:check`** to cover this build + add the spec **path-consistency gate**.

Reference content is **never hand-authored** — the placeholder `index.md` pages in each generated
section will be replaced by generated output.
