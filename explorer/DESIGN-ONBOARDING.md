# Restyling the Interactive API Explorer

A hands-on guide for designers. It tells you exactly which file to edit, what every design token controls, and how to preview and ship a restyle without breaking the build. You do not need to know TypeScript or the SDK internals — just CSS.

---

## 1. Overview

The **Interactive API Explorer** is a single, self-contained HTML page that documents the `@hosaka-fm/crate` TypeScript SDK. Developers use it to browse every SDK method, error kind, config option, auth tier, and exported type — with filterable lists, copy-paste code examples, a live retry-backoff visualiser, and a `/`-to-focus search bar.

| Attribute | Detail |
|---|---|
| **Purpose** | A reference explorer / interactive documentation surface for the SDK's public API |
| **Primary audience** | TypeScript / JavaScript developers integrating with the crate music-catalogue API |
| **Live URL** | `https://crate-sdk.hosaka.fm/explorer/` (served from the docs site) |
| **Intended feel** | Dark, focused developer tool — warm brass accent on deep blue-slate, monospace-dominant, no decorative chrome. Reads like terminal documentation. |

---

## 2. Tech stack & theming model

The explorer is **one fully self-contained HTML file**. There is no framework, no CSS build step (no Sass/PostCSS/Tailwind), and no external assets at runtime:

- No CDN scripts, no external stylesheets, no web fonts — every font is a **system-font stack**.
- All CSS lives in a single `<style>` block at the top of the file.
- All JavaScript is inline at the bottom.
- The page is **CSP-safe** and opens directly from disk.

**Mental model:** styling is driven entirely by **CSS custom properties** declared once in `:root { … }`. Every colour, both font stacks, and the default border-radius are tokens there. Components reference the tokens throughout, so a full palette or type change is usually a single edit to the `:root` block. What you write is what ships.

---

## 3. Exact styling entry points

### The file you edit

```
explorer/template.html
```

This is the **only file a designer touches**. It holds the inline `<style>` block (tokens + all component styles), the static HTML skeleton, and the JavaScript that renders data.

### The file you must NOT hand-edit

```
explorer/index.html      ← GENERATED — do not edit
```

`explorer/index.html` is rebuilt every time the docs build runs. It is `template.html` with three data placeholders (`__METHODS__`, `__EDU__`, `__CONCEPTS__`) replaced by JSON. **Hand edits are silently overwritten**, and a CI drift check will fail if the committed output no longer matches what the template would generate.

| File | Status | What it controls |
|---|---|---|
| `explorer/template.html` | **Edit this** | All CSS, layout, static copy, and the hand-curated Errors/Config/Types/Auth/Agent content |
| `explorer/index.html` | Generated — do not edit | Built output; regenerated and drift-checked in CI |
| `meta/surface.json` | Generated (from the SDK's TSDoc) | Method data injected into the template at build time |
| `spec/openapi.json` | Source of truth (SDK team) | Supplies the "Key concepts" cards via its `x-concepts` field |
| `scripts/gen-docs.mjs` | Build script — do not edit for styling | Reads the template + data, writes `index.html` |

---

## 4. Current design system

### Typography

Fonts are **system stacks only** — nothing is downloaded, so the page stays offline-capable and CSP-safe.

| Token | Value | Used for |
|---|---|---|
| `--sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif` | Body text, paragraphs, descriptions |
| `--mono` | `ui-monospace, "SF Mono", "JetBrains Mono", "Roboto Mono", Menlo, Consolas, monospace` | Headings, code, method names, badges, nav, most UI |

The design is deliberately monospace-dominant: `h1, h2, h3, h4` are all `var(--mono)` at `font-weight: 600`. Body copy is `15px / 1.55`. There is no variable-font or custom-weight setup — weights come from whatever system faces resolve.

### Color system

Every colour is a CSS custom property in `:root` (in `explorer/template.html`, lines 5–27).

**Backgrounds / surfaces**

| Token | Value | Role |
|---|---|---|
| `--ink` | `#0e1217` | Page background (deepest) |
| `--ink-2` | `#11161d` | Inputs, code-block backgrounds |
| `--panel` | `#161d26` | Card / panel background |
| `--panel-2` | `#1b232e` | Selected / hover panel |
| `--raise` | `#202a36` | Elevated surface (active chip, toast) |

**Borders**

| Token | Value | Role |
|---|---|---|
| `--line` | `#28313c` | Default border / divider |
| `--line-2` | `#34404e` | Secondary / hover border |

**Text**

| Token | Value | Role |
|---|---|---|
| `--text` | `#e8e3d7` | Primary text (warm near-white) |
| `--muted` | `#98a2b0` | Secondary / descriptive text |
| `--faint` | `#677081` | Tertiary labels, placeholders |

**Brand / accent**

| Token | Value | Role |
|---|---|---|
| `--brass` | `#e0a23c` | Primary accent — links, headings `<b>`, selected states, method names, stat values |
| `--brass-2` | `#f0bd62` | Hover state; function-name highlight in code |
| `--brass-dim` | `#7d5d22` | Low-contrast brass borders on badges/cards |

**Semantic / data colours**

| Token | Value | Role |
|---|---|---|
| `--anon` | `#7c8696` | Anonymous auth-tier badge, "client-side" badge |
| `--beacon` | `#a78bda` | Beacon-JWT tier badge; keyword syntax highlight |
| `--teal` | `#54bda0` | Type names, string highlight, "yes/idempotent" badges |
| `--coral` | `#e0705a` | `throws` highlights, "no/terminal" badges |
| `--get` | `#6f9bd1` | GET verb badge, numeric syntax highlight |
| `--post` | `#e0a23c` | POST verb badge (shares brass) |

**Radius**

| Token | Value |
|---|---|
| `--r` | `8px` — default card/input radius |

> **Not tokenised (watch out):** the two `body` background radial gradients and the `::selection` colour hard-code `rgba(224, 162, 60, …)` and `rgba(167, 139, 218, …)`. Individual badge border tints (e.g. `#3a434f`, `#4a3f63`, `#2f5249`) are also literal hex, not tokens. If you re-palette, update these by hand — see Recipe 1.

### Spacing

There is no spacing scale; values are literal in each rule. Key reference points:

- Topbar padding: `12px 20px`
- Sidebar (nav) width: `216px`
- Main content padding: `28px 32px 80px` desktop, `22px 18px 70px` at ≤880px
- Card padding: roughly `15–22px 17–24px`
- Default radius: `--r` (`8px`); cards that opt into a softer corner use `10px`–`12px` inline

### Light / dark mode

The explorer is **dark-only**. There is no `prefers-color-scheme` branch and no theme toggle. The one media feature respected is `prefers-reduced-motion` (it disables the panel fade-in).

---

## 5. Themeable surfaces & recipes

All edits below are in `explorer/template.html`.

### Recipe 1 — Rebrand the accent colour

Change the three brass tokens in `:root`:

```css
--brass:     #e0a23c;   /* accent: links, selected nav, stat values, headings <b> */
--brass-2:   #f0bd62;   /* hover + code function-name highlight */
--brass-dim: #7d5d22;   /* badge/card borders, glow */
```

Then update the three hard-coded RGBA copies of the accent (not tokenised):

```css
/* body background glow */
body { background-image:
  radial-gradient(circle at 18% -10%, rgba(224, 162, 60, 0.06), transparent 45%), … }

/* text selection */
::selection { background: rgba(224, 162, 60, 0.28); }
```

Search the `<style>` block for `224, 162, 60` to find every occurrence (also appears in `.b-key`, `.b-post`, `.eli5`, and the `vb-POST` badge fills).

### Recipe 2 — Adjust background depth / surfaces

```css
--ink:     #0e1217;   /* page */
--ink-2:   #11161d;   /* code blocks, inputs */
--panel:   #161d26;   /* cards */
--panel-2: #1b232e;   /* active/hover cards */
--raise:   #202a36;   /* toast, active chips */
--line:    #28313c;   /* borders */
--line-2:  #34404e;   /* hover borders */
```

### Recipe 3 — Change fonts

Swap either stack in `:root`:

```css
--mono: ui-monospace, "SF Mono", …;   /* headings, code, nav, badges */
--sans: -apple-system, …;             /* body prose */
```

> The page is intentionally offline / CSP-safe. Do **not** add `@import`, `<link>`, or a remote `@font-face` URL — it breaks that guarantee. If a custom face is essential, embed it inline as a base64 `@font-face` data URI.

### Recipe 4 — Restyle the sticky topbar

```css
.topbar {
  background: rgba(14, 18, 23, 0.86);   /* opacity of the frosted bar */
  backdrop-filter: blur(10px);          /* frost amount */
  border-bottom: 1px solid var(--line);
}
```

The wordmark accent is `.brand .mark b { color: var(--brass); }`. The version pill is `.brand .ver` — note its text (`v0.3.0`) is **static markup**, not generated; edit it directly in the `<header class="topbar">` block if you want it to show a different string.

### Recipe 5 — Restyle the hero / landing card

```css
.hero {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: linear-gradient(160deg, var(--panel), var(--ink-2));
}
.hero h1 b { color: var(--brass); }    /* the highlighted phrase in the headline */
```

The faint vertical pinstripe overlay is `.hero::after` (a `repeating-linear-gradient`). Delete that rule to remove it.

### Recipe 6 — Headings, links, section labels

```css
h1, h2, h3, h4 { font-family: var(--mono); font-weight: 600; }
a         { color: var(--brass); }
a:hover   { color: var(--brass-2); }
.eyebrow  { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em;
            text-transform: uppercase; color: var(--faint); }   /* small caps labels */
```

---

## 6. Content / page inventory

The explorer is a single page. Navigation is client-side panel switching (no reloads). The left nav lists seven sections:

| Section | Panel `id` | Content source |
|---|---|---|
| Overview | `p-overview` | Static template markup + generated **concept cards** + live stat counts |
| Methods | `p-methods` | **Generated** — from `__METHODS__` (i.e. `meta/surface.json`) |
| Errors | `p-errors` | Hand-authored — the `ERRORS`, `GUARDS`, `STATUS` arrays in the template's `<script>` |
| Config | `p-config` | Hand-authored — the `OPTIONS` array + the interactive retry visualiser |
| Auth tiers | `p-auth` | Hand-authored — the `TIERS` array |
| Types | `p-types` | Hand-authored — the `TYPES` array |
| Agent guide | `p-agent` | Hand-authored static HTML + one static code block |

**Generated vs static — what you can and cannot restyle per-page:**

| Part | Comes from | Changed by |
|---|---|---|
| Method list, detail, worked examples | `meta/surface.json` (from the SDK's TSDoc) | Regenerated by the docs build |
| "Key concepts" cards | `spec/openapi.json` → `x-concepts` | Regenerated by the docs build |
| Overview stat counts | Computed at runtime from the loaded data | Automatic |
| Errors, Config, Types, Auth, Agent guide | Hard-coded arrays in `template.html` | Edit the template directly |

**You can restyle every section** — styling lives entirely in the `<style>` block, which the build never rewrites. You can also freely edit the *content* of the hand-authored sections in the template. The one thing you cannot change here is method documentation text: it originates in the SDK source's TSDoc and only updates when the build regenerates.

---

## 7. Preview locally

Run from the **repo root**. After editing `explorer/template.html`, regenerate the built page, then open it:

```bash
npm run docs:gen        # rebuild explorer/index.html from the template + data
```

Then open `explorer/index.html` in a browser (double-click it, or `xdg-open explorer/index.html` on Linux / `open explorer/index.html` on macOS). No local server is needed — the page is self-contained.

For the full pipeline (build the SDK, re-extract the method surface from TSDoc, then generate) use:

```bash
npm run docs:build      # build → docs:surface → docs:gen → format README
```

To preview inside the actual docs site (the `site/` Astro project copies the explorer to `site/public/explorer/`):

```bash
cd site
npm install             # first time only
npm run dev             # serves the explorer at http://localhost:4321/explorer/
```

---

## 8. Deploy (generic)

1. Edit `explorer/template.html`.
2. From the repo root, run `npm run docs:gen` (or `npm run docs:build`) to regenerate `explorer/index.html`.
3. Commit **both** the template and the regenerated `index.html` and push to `main`.

On push, CI builds the docs site and publishes it to the CDN-backed static host serving `https://crate-sdk.hosaka.fm/explorer/`. The site's prebuild step copies `explorer/index.html` into the site's `public/explorer/` directory automatically — there are no manual uploads.

---

## 9. Constraints & do-not-break

| Rule | Why it matters |
|---|---|
| **Never hand-edit `explorer/index.html`.** | It is regenerated from the template; edits are silently overwritten and CI's drift check fails. |
| **Keep the `__METHODS__`, `__EDU__`, `__CONCEPTS__` placeholders in the template.** | `scripts/gen-docs.mjs` asserts all three are present and **exits with an error** if any is missing. Don't rename, wrap, or delete them. |
| **After editing the template, run `npm run docs:gen` and commit the updated `index.html`.** | `npm run docs:check` (CI) fails if the committed output doesn't match a fresh generation of `README.md`, `meta/`, and `explorer/`. |
| **No external assets.** | The page must stay CSP-safe and offline-capable. Do not add external `<link>` stylesheets, `@import url(…)` fonts, `<script src>` from CDNs, or `fetch`/`XHR`. Inline everything (data URIs for images/fonts). |
| **No web fonts / font-license caveat.** | The explorer uses only system-font stacks by design — this keeps it license-clean and offline. Do not introduce a licensed/trial font file here. |
| **Preserve `prefers-reduced-motion` handling.** | The panel fade-in already has a `@media (prefers-reduced-motion: reduce)` override. If you add animations, add a matching reduced-motion off-switch. |
| **Test both breakpoints.** | The single breakpoint is `@media (max-width: 880px)`: the sidebar becomes a horizontal tab strip, the two-column explorer collapses to one column, and the sticky detail panel goes static. Check any layout change above and below 880px. |
| **Brand rule.** | The canonical brand is **Hosaka FM** / `hosaka.fm`. Never introduce any other brand string into the template, the generated output, or any file. |
