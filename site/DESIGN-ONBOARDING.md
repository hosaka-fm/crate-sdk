# Designer Onboarding — crate-sdk Docs Site

A practical guide to restyling **crate-sdk.hosaka.fm** without breaking the content pipeline. If you know CSS, you can confidently change the entire look of this site by editing **one file**. This doc tells you which file, what lives in it, and what you must *not* touch.

---

## 1. Overview

This is the public documentation site for `@hosaka-fm/crate`, a typed TypeScript client for the crate cluster-first music-catalogue API. Its audience is developers (TypeScript / Node.js) using the SDK, plus AI agents that read the machine-readable `llms.txt` surfaces.

| | |
|---|---|
| **Live at** | https://crate-sdk.hosaka.fm |
| **Intended feel** | Clean, technical, dark-first developer docs. A single grotesque typeface (ABC Schengen) throughout, with a warm brass accent (`#e0a23c`). |
| **Key framing** | This site is a **static shell**. It authors almost no content of its own — nearly every page is *generated* from sources of truth elsewhere in the repo (the API spec, SDK TSDoc, hand-written guides). The shell owns presentation only: navigation, search, theming, and the splash landing page. |

Because content is generated, most of your styling work happens in CSS tokens and a handful of config/landing files — never in the per-page `.md` files, which get overwritten.

---

## 2. Tech stack & theming model

| Layer | Technology |
|---|---|
| Static-site framework | [Astro](https://astro.build) v6 |
| Docs theme | [Starlight](https://starlight.astro.build) v0.40 |
| API reference pages | `starlight-openapi` plugin |
| Agent surfaces (`llms.txt`) | `starlight-llms-txt` plugin |
| Custom styling | One CSS file wired via Starlight's `customCss` |
| Search | Pagefind (built into Starlight, no config) |

### The mental model you need

Starlight exposes its **entire visual system as CSS custom properties** named `--sl-*` (colors, fonts, spacing, layout widths). You restyle the site by **overriding those tokens in one stylesheet** — you do not touch Astro components or Starlight internals.

```
site/src/styles/custom.css      ← the ONLY styling file
  ├── @font-face { ABC Schengen ... }
  └── :root { --sl-font: ...; --sl-color-accent: ...; ... }
        ↑ Starlight reads these tokens and applies them everywhere
```

That file is registered in `site/astro.config.mjs`:

```js
customCss: ['./src/styles/custom.css'],
```

**Light / dark mode** is switched by a `data-theme` attribute on the root element. Starlight is dark by default and offers a built-in toggle. Light-mode overrides use the `:root[data-theme='light']` selector (dark values live in plain `:root`).

---

## 3. Exact styling entry points

### Files you edit for look-and-feel

| File | What it controls |
|---|---|
| `site/src/styles/custom.css` | **All visual styling** — `@font-face` declarations, font tokens, the brass accent ramp, heading weight/tracking. This is your primary file. |
| `site/astro.config.mjs` | Site `title`, `description`, GitHub social link, sidebar structure, plugin wiring. |
| `site/src/content/docs/index.mdx` | The splash / landing page — hero tagline, CTA buttons, and the feature `<CardGrid>`. Hand-authored, safe to edit. |
| `site/src/content/docs/get-started/quickstart.md` | The quickstart page. Hand-authored (**not** generated), safe to edit. |

### Files that are GENERATED — never hand-edit

A prebuild script, `site/scripts/sync-content.mjs`, runs automatically before `npm run dev` and `npm run build` (via the `predev` / `prebuild` hooks in `package.json`). It **overwrites** the paths below on every run, and they are **git-ignored**. Any manual edit is silently lost.

| Generated path | Regenerated from | Edit this instead |
|---|---|---|
| `site/src/content/docs/guides/*.md` | `docs/*.md` (repo root) | the source markdown in `docs/` |
| `site/src/content/docs/sdk/*.md` | `meta/surface.json` (built from TSDoc) | the TSDoc in the SDK source |
| `site/src/content/docs/concepts/index.md` | `spec/openapi.json` → `x-concepts[]` | the spec |
| `site/src/content/docs/changelog.md` | `CHANGELOG.md` (repo root) | the changelog |
| `site/spec/openapi.json` | `spec/openapi.json` (repo root) | the source spec |
| `site/public/explorer/index.html` | `explorer/index.html` (repo root) | the source explorer |

> Rule of thumb: if a page shows API/SDK/guide/changelog *content*, it is generated. If it is chrome, layout, colour, type, the splash, or the quickstart — it is yours to edit.

---

## 4. Current design system

### Typography

The site uses **one typeface family, ABC Schengen (by Dinamo)**, in two cuts. Both are **variable fonts** spanning the full weight axis (`font-weight: 100 900`) from a single file each, served with `font-display: swap`.

| CSS family name | File | Role |
|---|---|---|
| `'ABC Schengen'` | `ABCSchengenA-Variable.woff2` | Body text, headings, UI (the grotesque cut) |
| `'ABC Schengen Mono'` | `ABCSchengenAMono-Variable.woff2` | Code blocks, tabular data |

The `@font-face` blocks and the token wiring both live in `site/src/styles/custom.css`:

```css
:root {
  --sl-font:      'ABC Schengen', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
  --sl-font-mono: 'ABC Schengen Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

Starlight applies `--sl-font` to both body and headings, so those two tokens cover the whole site. The fallback stack after each comma renders until the font loads (and permanently, if the licensed files are absent — see §9).

### Heading style

Set directly on the heading elements (not via a token), also in `custom.css`:

```css
h1, h2, h3, h4, h5, h6, .site-title {
  font-weight: 600;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
```

### Color system

Only the **accent ramp** is overridden; all other Starlight colors (background, text, borders, surfaces) are theme defaults. The accent drives links, active sidebar items, focus states, and highlights.

**Dark mode (default — plain `:root`)**

| Token | Value | Role |
|---|---|---|
| `--sl-color-accent-low` | `#3a2e12` | Subtle tinted accent background |
| `--sl-color-accent` | `#e0a23c` | Primary brass — links, highlights, active state |
| `--sl-color-accent-high` | `#f2d39a` | High-contrast accent text |

**Light mode (`:root[data-theme='light']`)**

| Token | Value | Role |
|---|---|---|
| `--sl-color-accent-low` | `#f7e7c5` | Subtle tinted accent background |
| `--sl-color-accent` | `#9a6a16` | Brass darkened for contrast on white |
| `--sl-color-accent-high` | `#4e370c` | High-contrast accent text |

### Spacing & layout

No spacing or layout tokens are currently overridden — Starlight defaults apply. To customise, add tokens such as `--sl-content-width`, `--sl-sidebar-width`, or `--sl-nav-height` to the `:root` block in `custom.css` (see [Starlight's CSS variable reference](https://starlight.astro.build/guides/css-and-tailwind/)).

---

## 5. Themeable surfaces & recipes

Each recipe is a concrete "edit this file, change this token/selector" action.

### Change the brand / accent color

Edit the six accent tokens in `site/src/styles/custom.css` (three for dark, three for light):

```css
:root {                       /* dark (default) */
  --sl-color-accent-low:  /* subtle tinted background */;
  --sl-color-accent:      /* main accent — links, active state */;
  --sl-color-accent-high: /* high-contrast accent text */;
}
:root[data-theme='light'] {   /* light */
  --sl-color-accent-low:  /* subtle tinted background */;
  --sl-color-accent:      /* darken for contrast on white */;
  --sl-color-accent-high: /* high-contrast accent text */;
}
```

Links, active sidebar items, and interactive highlights all derive from these.

### Change the body / mono font

In `custom.css`: add a new `@font-face` block for your font, then point `--sl-font` (and/or `--sl-font-mono`) at it. Keep the fallback stack after the comma so text renders before the font loads.

### Set an explicit background color

Not currently overridden. Add to `custom.css`:

```css
:root                       { --sl-color-bg: #0d0d0d; }  /* dark  */
:root[data-theme='light']   { --sl-color-bg: #fafafa; }  /* light */
```

### Change heading weight or tracking

Edit the `h1, h2, h3, … , .site-title` rule in `custom.css` (currently `font-weight: 600; letter-spacing: -0.01em`).

### Change the site title

Edit the `title` field inside `starlight({ … })` in `site/astro.config.mjs` (currently `'@hosaka-fm/crate'`). There is no logo image configured — the title text is the wordmark; style it via the `.site-title` selector.

### Restyle the splash hero

Edit `site/src/content/docs/index.mdx`. The frontmatter `hero.tagline` and `hero.actions` control the headline and CTA buttons; the `<CardGrid>` / `<Card>` block below controls the feature cards. Visual styling of hero and cards is still done through `--sl-*` tokens in `custom.css`.

---

## 6. Content / page inventory

| URL | Template | Source | Restyle per-page? |
|---|---|---|---|
| `/` | Splash | `site/src/content/docs/index.mdx` (hand-authored) | Yes — edit the file + tokens |
| `/get-started/quickstart/` | Doc | `site/src/content/docs/get-started/quickstart.md` (hand-authored) | Yes |
| `/concepts/` | Doc | Generated from spec `x-concepts[]` | Chrome only — content is generated |
| `/guides/*` | Doc | Generated from `docs/*.md` | Chrome only |
| `/sdk/*` | Doc (one per method) | Generated from `meta/surface.json` | Chrome only |
| `/api/*` | OpenAPI reference | `starlight-openapi` from the spec | Chrome only |
| `/explorer/` | Standalone SPA | Copied from `explorer/index.html` | Separate app — styled in its own source |
| `/changelog/` | Doc | Generated from `CHANGELOG.md` | Chrome only |
| `/llms.txt`, `/llms-full.txt`, `/llms-small.txt` | Text | `starlight-llms-txt` at build | Not styleable (plain text) |

"Chrome only" means: you can restyle the theme (type, color, spacing) globally via `custom.css`, but you cannot edit the words on these pages here — edit the upstream source.

### Current generated pages (illustrative)

- **Guides** (`/guides/*`): `ai-agents`, `authentication`, `configuration`, `errors`, `getting-started`, `recipes`.
- **SDK reference** (`/sdk/*`): `artist`, `artistornull`, `breakouts`, `dossier-artist`, `dossier-festival`, `dossier-label`, `dossier-manifest`, `facets`, `index`, `label`, `resolve`, `search`, `searchevents-observed`, `searchevents-refined`, `tastemakers-onestowatch`, `tastemakers-tastemakers`.

These lists change whenever the upstream sources change, since the pages are regenerated each build.

### Sidebar / navigation

Defined in `site/astro.config.mjs` under `sidebar: [...]`. Group order and labels are set there — currently: **Get started → Concepts → Guides & recipes → SDK reference → Interactive explorer → (API-reference groups) → Changelog**. Pages within each group are `autogenerate`d from their directory. The `Interactive explorer` entry is a plain link to `/explorer/`, and the API-reference groups are injected by `starlight-openapi`.

---

## 7. Preview locally

```sh
cd site
npm install      # first time only — resolves Astro + Starlight + plugins
npm run dev      # runs sync-content, then starts the Astro dev server
```

- The dev server hot-reloads `custom.css` edits instantly.
- Edits to `astro.config.mjs` require a **server restart**.
- `npm run dev` first runs the `predev` → `sync` step, so the generated pages exist before the server starts.

Preview the production build:

```sh
npm run build    # runs sync-content, outputs static site → site/dist/
npm run preview  # serves the built output locally
```

---

## 8. Deploy (brief, generic)

The site is a **fully static build** — no server-side rendering.

1. `npm run build` in `site/` produces static output (HTML, CSS, JS, font files) in `site/dist/`.
2. The built output is published to object storage behind a CDN.
3. The CDN serves it at `crate-sdk.hosaka.fm`.

DNS and hosting infrastructure are managed separately from the design work — nothing in your styling changes affects them.

---

## 9. Constraints & do-not-break

### Generated directories are overwritten every build

These paths are git-ignored and rewritten by `site/scripts/sync-content.mjs` on every `npm run dev` / `npm run build`. Manual edits are silently lost:

```
site/src/content/docs/guides/
site/src/content/docs/sdk/
site/src/content/docs/concepts/index.md
site/src/content/docs/changelog.md
site/spec/
site/public/explorer/
```

Edit the upstream sources (`docs/`, `meta/surface.json` via TSDoc, `spec/openapi.json`, `CHANGELOG.md`, `explorer/index.html`) instead.

### Font license — trial binaries are local-only

Per `site/public/fonts/abc-schengen/README.md`: ABC Schengen is a **commercial typeface**, and the `.woff2` files present locally are **trial (evaluation-only)** binaries. A local `.gitignore` in that folder ignores `*.woff2`, `*.woff`, `*.otf`, `*.ttf`, so the trial files are **never committed or deployed publicly**.

- **Do not commit or deploy the trial files.**
- A Dinamo **webfont license must be acquired before public launch**. Drop the licensed files under the **same filenames** — `ABCSchengenA-Variable.woff2` and `ABCSchengenAMono-Variable.woff2` — and no code change is needed.
- Until licensed files are present, the site renders the Helvetica-class fallback stack (`system-ui, Helvetica, Arial`).

### Brand rule — one canonical identity

The canonical brand is **Hosaka FM** / **hosaka.fm**. Never introduce any other brand string into content, CSS comments, `<title>`/metadata, or the splash page.

### Prefer tokens over component overrides

All visual changes should go through `--sl-*` custom properties in `custom.css`. Starlight *does* allow swapping components (via a `components:` map in `astro.config.mjs`), but overriding the wrong component can break navigation, Pagefind search, or accessibility. Only reach for a component override if a CSS token genuinely can't express the change, and test thoroughly against Starlight's documented override API.

### Keep the plugins wired

`starlightOpenAPI(...)` and `starlightLlmsTxt()` must stay in the `plugins:` array (and `...openAPISidebarGroups` in the sidebar). Removing them breaks the API reference section and the `llms.txt` agent surfaces respectively.

### Token namespace

Starlight's tokens are prefixed `--sl-`. Only the accent ramp and the two font tokens are currently overridden; everything else is a Starlight default you can add and override as needed.
