# ABC Schengen — hosaka's sole typeface (docs site)

ABC Schengen (Dinamo) is hosaka's only typeface (operator decision 2026-06-05). The docs site
inherits it from crate's web app — same families, same `@font-face` wiring (see
`site/src/styles/custom.css`):

```
ABCSchengenA-Variable.woff2       → family 'ABC Schengen'      (the grotesque cut) — sans + headings
ABCSchengenAMono-Variable.woff2   → family 'ABC Schengen Mono' (a real mono)        — code / tabular
```

Both are **variable** (`font-weight: 100 900`), served with `font-display: swap`.

## ⚠️ License — commercial, trial binaries are local-only

ABC Schengen is a **commercial typeface**. The binaries here are the **trial (evaluation-only)**
woff2, **gitignored** (`*.woff2` etc.) — they are **never committed or deployed to a public
launch**. A Dinamo **webfont license must be acquired before public launch**; drop the licensed
files here under the same names (no code change) — until then the stack falls back to a
Helvetica-class grotesque (`system-ui, Helvetica, Arial`).

Source of the trial files: `crate/apps/web/public/fonts/abc-schengen/` (same posture there).
