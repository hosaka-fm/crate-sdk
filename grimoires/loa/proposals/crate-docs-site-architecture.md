# crate docs site — architecture decision

> **Status:** final · **Date:** 2026-06-30 · **Owner:** SDK team (docs host) · **API team:** owns the spec
> **Thesis in one line:** the docs site is not a content platform to adopt — it is a thin static shell over the single-source generation pipeline crate already built and CI-guards.

---

## 1. TL;DR recommendation

Build the site on **Astro Starlight** — MIT-licensed, static HTML output, no runtime server, built-in client-side search (Pagefind). It **does not own content**: it consumes `spec/openapi.json` and `meta/surface.json` as *build inputs*, so the single-source iron rule is untouched and the SDK's zero-runtime-dependency guarantee never changes (the framework is a docs-build `devDependency` only — it never enters the shipped package).

- **API reference** renders from the vendored `spec/openapi.json` (the API team's source of truth) via the `starlight-openapi` plugin (supports OpenAPI 3.1; the spec is `3.1.0`).
- **SDK reference** keeps the existing TSDoc → `extract-surface.mjs` → `meta/surface.json` → `gen-docs.mjs` pipeline — do **not** regenerate it with TypeDoc.
- **Guides** — the six `docs/*.md` files migrate almost as-is (Starlight renders Markdown natively).
- **One new piece of glue:** `gen-xref.mjs`, an endpoint ↔ SDK-method map built from `surface.json`.
- **Agent surfaces** (`llms.txt`, `llms-full.txt`, `llms-small.txt`, raw `.md`, published manifests) fall out of plugins + exposing artifacts that already exist.
- **Widen the existing `docs:check` drift gate** to cover the whole site — and add a **spec free-text path-consistency assertion** (see §4, and the *Critique response* below — this is load-bearing).

**Honest fallback:** Mintlify, if the team would rather pay (~$250–300/mo) to never run a build. It is the strongest agent-first DX out of the box, but it means content in a vendor MDX format and a hosted dependency that cuts against the lean / low-lock-in value. Its free Hobby tier makes it a cheap evaluation spike, not a commitment.

| Decision | Choice | Note |
|---|---|---|
| Shell | Astro Starlight | static · MIT · self-host |
| API reference | spec → `starlight-openapi` | API team owns the spec |
| SDK reference | keep `surface.json` + explorer | do **not** swap in TypeDoc |
| New glue | endpoint ↔ method map | generated from `surface.json` |
| Agent layer | publish 3 manifests + `llms*.txt` | exposure, not construction |
| Drift gate | widen `docs:check` + **spec path-consistency check** | catches the `/api/v1` and `master` drift live |
| Defer | MCP server · AI chat · versioning | premature at v2.0.0, one SDK |

---

### Critique response (incorporated)

The adversarial review raised one substantive issue (the two "test" payloads carry no real content and are noted only for completeness):

> **CRITICAL / v1-drift:** *"`x-concepts.see` cites stale `/api/v1` in 10 of 15 entries; rendering them publishes broken cross-refs. Fix: add a version-consistency assertion to `docs:check` that fails on any `/api/v1` reference."*

**Verified and accepted — the count is exact.** Grounding against `spec/openapi.json`: all **16 operation paths are `/api/v2`**, the SDK targets `/api/v2` for all 16 methods, yet the spec's hand-written free-text still says `/api/v1` in **10 of 15** `x-concepts.see` fields *and* in `info.description`. Rendering those verbatim would publish broken cross-references on the Concepts pages. This is a launch blocker for the Concepts section.

**But I am widening the fix beyond the proposed one**, for two reasons:

1. **A bare `/api/v1` string match is too narrow — it misses a second, worse drift.** While verifying, I found the `grain` concept's `see` field points at `/dossier/master/{id}`, a path that **does not exist in v2** (v2 has artist / label / festival dossiers, no `master`). A version-number check would pass this clean while still shipping a dead link. The honest gate validates **every path-like token in spec free-text against the actual `paths` keys**, so it catches both the version drift *and* the dangling-path drift. (`docs:check` already does JCS staleness on the spec; this is the prose-fidelity sibling it was missing.)

2. **Ownership routing — the SDK team cannot silently rewrite the API team's spec.** Per the iron rule "ownership follows the source of truth," `info.description` and `x-concepts` are **API-team-owned content**. The gate's job is to *detect and route*, not to auto-edit someone else's source. So the assertion fails the SDK docs build **and** files the drift back to the API team as a spec-fix PR (mirroring the existing "regenerate against crate X.Y.Z" flow). The SDK docs site does not render unverified cross-refs in the meantime.

The concrete assertion is specified in §4 under *The spec path-consistency gate*.

---

## 2. Architecture overview

Three sources of truth flow through one generation pipeline into one static shell. The site is a renderer; it authors nothing it could derive.

Four layers:

- **Sources of truth** — artifacts each team owns and edits by hand.
- **Generation pipeline** — the existing `npm run docs:*` scripts, widened.
- **Shell** — Starlight composes everything into one nav, one search, one design system.
- **Published surfaces** — what humans and agents actually consume: HTML, raw `.md`, machine manifests.

```
SOURCES OF TRUTH  (edited by hand, by their owning team)
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────┐
│ spec/openapi.json            │ src/client.ts  TSDoc          │ docs/*.md  (6 guides)    │
│ + x-concepts (15)  ─ API team│ + CRATE_RESOURCES   ─ SDK team│ examples/*.ts  ─ SDK team│
│ byte-faithful, JCS-guarded   │ + CRATE_ERROR_REGISTRY        │ type-checked in CI       │
└───────────────┬──────────────┴───────────────┬──────────────┴────────────┬─────────────┘
                │                               │                           │
                ▼                               ▼                           │
       ┌─────────────────┐          ┌──────────────────────┐               │
       │ (spec verbatim) │          │ extract-surface.mjs  │               │
       │ + path-consist. │          │   bijection guard    │               │
       │   gate          │          └──────────┬───────────┘               │
       └────────┬────────┘                     ▼                           │
                │                       ┌─────────────────┐                │
                │                       │ meta/surface.json│ ◀ intermediate + published
                │                       │   (16 methods)  │                │
                │                       └──┬──────────┬───┘                │
                │              gen-docs.mjs│          │ NEW: gen-xref.mjs   │
                │                          ▼          ▼                    │
                │                  ┌────────────┐ ┌─────────────┐          │
                │                  │ explorer/  │ │ endpoint ↔  │          │
                │                  │ index.html │ │ method map  │          │
                │                  └─────┬──────┘ └──────┬──────┘          │
                ▼                        │               │                 ▼
 ══════════════════════════ GENERATION PIPELINE (npm run docs:build) ════════════════════
                │                        │               │                 │
                ▼                        ▼               ▼                 ▼
        ┌────────────────────────────────────────────────────────────────────────┐
        │             SHELL — Astro Starlight (static build)                       │
        │   one nav · one Pagefind search · one design system (brass/ink/paper)    │
        └────────────────────────────────────┬─────────────────────────────────────┘
                                              │  npm run build → static HTML
 ══════════════════════════ PUBLISHED SURFACES (what gets consumed) ═════════════════════
   /docs/api/*        /docs/sdk/*       /docs/guides/*    /llms.txt /llms-full.txt
   /docs/concepts/*   + every page also at <page>.md     /llms-small.txt
   /surface.json  /openapi.json
   HUMANS read the HTML · AGENTS fetch .md + the manifests · both, one source.
```

Two properties make this safe:

1. **The renderer's input is the owned artifact.** Pointing Starlight at `spec/openapi.json` does not transfer ownership of the API reference to whoever runs the build. Ownership stays with the source.
2. **The honesty guarantee survives.** The SDK reference is diffable against the runtime `CRATE_RESOURCES` the SDK actually ships — not just against a spec — so the docs cannot claim a capability the code lacks. `null` stays an honest gap.

---

## 3. Content model & information architecture

One URL space, five sections, and an IA that mirrors the ownership boundary — so the nav itself tells you who owns each page. The cluster-first data model is the spine of **Concepts**: `cluster_id` → `dossier` → `grain`, with the artist as root and `master` / `bandcamp` as dimensions.

| Section | URL | What lives here | Source · owner |
|---|---|---|---|
| **Get started** | `/docs/` | Overview, the thesis, where to go next | guide · SDK |
| | `/docs/quickstart` | 60-second onramp — keyless `crate.index()` first, then a keyed call | guide + `examples/` · SDK |
| | `/docs/authentication` | The three auth tiers (anon / key / beacon) | guide · SDK |
| | `/docs/configuration` | Retries, timeouts, deadlines, custom `fetch` | guide · SDK |
| **Concepts** | `/docs/concepts/<term>` | One page per `x-concepts` term — `cluster-id`, `dossier`, `grain`, … (15) | spec `x-concepts` · **API** |
| | `/docs/concepts/` | The cluster-first model map (artist · master · bandcamp) | generated · API |
| **Guides & recipes** | `/docs/guides/errors` | Teaching errors, `kind` / `code`, the HTTP map | guide · SDK |
| | `/docs/guides/ai-agents` | Forgiving inputs, branch-on-code, runtime discovery | guide · SDK |
| | `/docs/recipes/<task>` | One runnable, single-capability snippet per capability | guide + `examples/` · SDK |
| **SDK reference** | `/docs/sdk/<method>` | One page per method (16): signature, ELI5, params, returns, auth tier, retryable, `@example` | `surface.json` · SDK |
| | `/docs/explorer` | The existing interactive explorer — live cmd-K surface | explorer · SDK |
| **API reference** | `/docs/api/<endpoint>` | One page per path (16): request/response, schemas, try-it | `openapi.json` · **API** |
| | `/docs/api/` | Tag-grouped reference index rendered from the spec | `openapi.json` · API |
| **Meta** | `/changelog` | Rendered from `CHANGELOG.md` (post-merge automation) | generated · SDK |
| | `/docs/migration` | Stub at v2.0.0; grows per breaking change | guide · SDK |

**Nav taxonomy** (left sidebar, top to bottom, ordered by the journey not the org chart):

> **Get started → Concepts → Guides & recipes → SDK reference → API reference → Changelog.**

Concepts sits early and high because the cluster-first model is the one thing a newcomer must absorb before anything else makes sense. SDK reference precedes API reference because the SDK is the front door; raw HTTP is the escape hatch. Every page ends with a "Next" pointer (the existing guides already do this) so the IA anticipates the next question rather than dead-ending.

**Deliberately omitted (premature):** no **version switcher** (one spec version, 2.0.0 — UI for an empty set) and no **multi-language code tabs** (one TypeScript SDK; fabricating Python/Go tabs would violate the honest-capability rule). The only honest second "language" is a **TS-SDK / `curl` two-tab toggle** on API-reference pages, sourced from the spec. Keep the version stamped in `spec/meta.json` and read it into a badge — when v3 ships, the switcher is additive.

---

## 4. The generation pipeline & ownership seams

Ownership follows the source of truth, not the renderer. Because each generated surface's input is an artifact a specific team already owns, the cross-team boundary needs no governance committee — it falls out of the pipeline.

### Who owns what

| API team owns | SDK team owns (generated) | SDK team owns (hand-authored) |
|---|---|---|
| **Source:** `spec/openapi.json` + `x-concepts` | **Source:** TSDoc on `src/client.ts` + `CRATE_RESOURCES` | **Source:** `docs/*.md` + `examples/*.ts` |
| API reference — every `/api/v2` path, verbatim from the spec | SDK reference — 16 method pages from `meta/surface.json` | The six guides — getting-started, authentication, errors, ai-agents, recipes, configuration |
| Concepts pages — the 15 `x-concepts` entries | The explorer — already generated by `gen-docs.mjs` | Recipes — snippets sourced from type-checked `examples/` |
| | The README surface table — same source | |
| Edit the spec → site regenerates. A spec bump triggers a docs-rebuild PR. | Edit the TSDoc → `extract-surface.mjs` regenerates; bijection guard proves method ↔ resource both ways. | The only content typed by a human. Normal Markdown PRs. Reference is never hand-authored — the iron rule holds. |

### Exactly what is generated, and from where

| Output | Generated from | By | Status |
|---|---|---|---|
| API reference pages | `spec/openapi.json` | `starlight-openapi` (build-time) | new render |
| Concepts pages | spec `x-concepts` | small emitter (pattern exists in `gen-docs.mjs`) | extend |
| `meta/surface.json` | TSDoc + `CRATE_RESOURCES` | `extract-surface.mjs` | **exists** |
| SDK method pages | `meta/surface.json` | extend `gen-docs.mjs` to emit MDX | extend |
| `explorer/index.html` | `surface.json` + spec `x-concepts` | `gen-docs.mjs` → `template.html` | **exists** |
| README surface table | `surface.json` | `gen-docs.mjs` (between markers) | **exists** |
| endpoint ↔ method map | `surface.json` (`http` + `ep` per method) | **NEW** `gen-xref.mjs` | build this |
| `llms.txt` / `llms-full.txt` / `llms-small.txt` | README + guides + surface + manifests | `starlight-llms-txt` plugin | new |
| Guides (HTML) | `docs/*.md` | Starlight (Markdown render) | **exists** |
| Site search index | all rendered pages | Pagefind (Starlight built-in) | built-in |

### Reusing the existing assets

- **`surface.json`** — the 16-method machine index (call · http · ep · auth · ret · retry · idem · sig · desc · example). Today a build intermediate. **Reuse:** keep as the SDK-reference source *and* publish at `/surface.json` for agents; add a guard that the published copy equals the built one.
- **`explorer/index.html`** — dark-mode SPA with cmd-K, error taxonomy, config, types, agent guide. **Reuse:** embed at `/docs/explorer`; add `#fn-<name>` anchors so SDK pages deep-link in. Don't rebuild the try-it widget.
- **`x-concepts`** — 15 entries in the spec, already drift-guarded (build fails if empty). **Reuse:** render to `/docs/concepts/*`. Most OpenAPI sites have no conceptual layer at all — this is a differentiator. *(Gated on the path-consistency fix below.)*
- **`CRATE_RESOURCES` + `CRATE_ERROR_REGISTRY`** — runtime manifests shipped *inside* the SDK. **Reuse:** the honesty diff (SDK reference checked against these), source for `llms-full.txt`, and the basis of a future MCP server.
- **The drift gate (`docs:check`)** — regenerates and fails on a dirty git tree; JCS sha256 staleness on the spec. **Reuse:** widen its scope to the Starlight build so the whole site is one `npm run docs:build` from truth; document it publicly.

### The spec path-consistency gate (new — closes the critique)

A small assertion added to `docs:check`, runnable as plain Node with no new dependency:

1. Parse `spec/openapi.json`; collect the set of real operation paths from `paths` keys (today: 16, all `/api/v2/*`).
2. Scan every free-text spec field that the site renders — `info.description` and each `x-concepts[].see` / `.eli5` — for path-like tokens (`/api/v\d…` and bare `/dossier/…`, `/resolve`, etc.).
3. **Fail the build** if any token (a) names a version prefix other than the live one, or (b) names a path not present in `paths`.

This catches **both** confirmed drifts in the current spec: the `/api/v1` references in 10/15 `see` fields and `info.description`, **and** `grain`'s reference to `/dossier/master/{id}`, a path absent from v2. On failure it emits a routed report (which field, which token, expected vs found) destined for an API-team spec-fix PR — the SDK build never silently rewrites API-team source, and never renders an unverified cross-ref.

### Iron rules, restated against this design

1. **Generated, never hand-authored** — every reference page derives from spec or TSDoc; only the six guides are typed.
2. **Ownership follows the source** — the SDK team running the renderer does not become the owner of the API reference; the spec stays the API team's, and the path gate *routes* drift back rather than editing it.
3. **Honest capability** — SDK reference is diffable against runtime `CRATE_RESOURCES`; `null` stays an honest gap; no fabricated language tabs; no rendered cross-ref that fails the path gate.
4. **Zero runtime deps** — the framework touches the docs build only; the shipped SDK is unchanged.

---

## 5. Agent-first & human-with-agent feature set

Almost every item is "emit one more artifact from data crate already has," not new authoring. crate's standout strength — three machine-readable runtime manifests — is the headline agent feature, not plumbing. The work is to surface and cross-link, then tell agents: *read these, do not scrape prose.*

| Feature | What it is | Source / how | Priority |
|---|---|---|---|
| **llms.txt** | Curated, link-structured index for agents on a context budget | Already shipped at repo root; let `starlight-llms-txt` own it | launch |
| **llms-full.txt** | Whole corpus in one fetch — the entire SDK contract | README + guides + surface + serialized `CRATE_RESOURCES` & `ERROR_REGISTRY`; drift-guarded | launch |
| **llms-small.txt** | Filtered corpus for smaller context windows | Same plugin emits it for free | launch |
| **Raw `.md` per page** | Append `.md` to any page → chrome-free Markdown | Guides already *are* `.md`; expose source as a static route | launch |
| **Published manifests** | `surface.json`, `openapi.json` at stable URLs, linked from `llms.txt` | Expose existing artifacts + equality guard. The per-method auth/retry/idempotent index is rare | launch |
| **Copy page as Markdown** | Per-page button → clipboard; per-method copy in explorer | Client-side serialize of the page / `surface.json` record. Inline JS, zero deps | launch |
| **Stable heading anchors** | GitHub-compatible slugs; `#fn-<name>` per method | Pick a renderer that emits stable slugs; assert in `docs:check` | launch |
| **sitemap.xml + robots.txt** | Crawler / agent discovery; robots points at sitemap + `llms.txt` | Generated from the file list `docs:build` already walks | launch |
| **OpenGraph tags** | Link unfurls for human sharing | Per-page from front-matter/title; Starlight does this | launch |
| **Open in Claude / ChatGPT** | Static deep-link prefilling the chat with the page URL/markdown | A static `href` with the encoded page — near-zero cost | fast-follow |
| **"How our docs stay honest" page** | Public writeup of the drift gate (incl. the path-consistency check) | Document the existing CI guard; crate is ahead of most vendors here | fast-follow |
| **MCP docs server** | Tools: `list_methods`, `get_error`, `get_recipe`, `search_docs` | Thin wrapper over `surface.json` / `ERROR_REGISTRY` / `crate.index()` | later |
| **JSON-LD structured data** | schema.org `APIReference` per page | Lower value — the spec already *is* the typed machine description | optional |
| **Ask-AI / in-docs chatbot** | Hosted RAG assistant | Implies hosting + retrieval + eval/cost; no docs team | defer |

The deferral reasoning is explicit: `llms-full.txt` plus the three runtime manifests already give agents ~90% of an MCP server's value at near-zero cost. The MCP server is genuinely attractive because crate's audience *is* agent-builders — but it is a new deliverable with its own surface to maintain, so it sequences *after* the static site proves the content model and there is evidence agents want tool-access beyond a single fetch.

---

## 6. Tech-stack recommendation

Optimize for three things: preserve generation-from-single-source, get agent-first features cheaply, and minimize lock-in + operational burden on a team with no docs team. The finalists collapse to two.

### Recommended — Astro Starlight

- **MIT, static output, self-hosted** — lowest lock-in, matches the zero-dep / lean ethos. No runtime server to operate, a real concern with no ops team.
- **Wraps, doesn't replace** — consumes `surface.json` and `spec/openapi.json` as build inputs. The existing pipeline stays the generator; Starlight is the shell.
- **Covers the agent gaps via small open plugins** — `starlight-openapi` for API reference (OpenAPI 3.1, matches the spec), `starlight-llms-txt` for the three `llms*.txt` files, trivial copy-as-markdown, Pagefind (built in) for client-side search — no Algolia lock-in.
- **SDK guarantee untouched** — one `devDependency` tree on the docs build only; never enters the shipped package.

*Both recommended plugins are listed on the official Starlight plugins page (last updated April 2026) and actively maintained; pin exact versions at adoption.*

### Rejected alternatives

| Option | Why it loses | Revisit when |
|---|---|---|
| **Mintlify** *(fallback)* | Best agent-first DX out of the box, but ~$250–300/mo, content in a vendor MDX format, hosted dependency — cuts against lean / low-lock-in. Free Hobby tier makes it a cheap evaluation spike. | Team explicitly values zero build maintenance over self-host |
| **Fumadocs** | Strongest self-hosted OpenAPI story, but the team would own and maintain a full Next.js/React app (SSR, runtime, upgrades) for one SDK + one API. Operational weight unjustified now. | Docs grow into an app — auth, dashboards, multi-SDK |
| **Nextra** | No real OpenAPI rendering story — you'd bolt on a separate tool anyway, which Starlight does better with less work. | — |
| **Build-your-own** (Stripe/Markdoc style) | Textbook gold-plating. Stripe's bespoke stack exists because Stripe's surface and team justify it; one SDK + one API does not. Fails "simplest thing that works." | Never, at this scale |
| **TypeDoc-in-Starlight as the SDK reference** | Would *replace* the bespoke surface pipeline the repo already solved with vanilla Node + the `tsc` API + a CI drift gate. A regression. Keep TypeDoc as the exhaustive per-symbol fallback only. | — |

### Ownership & contribution flow

Three content zones, distinct owners (table in §4). All reference changes flow through their source: a PR edits TSDoc or the spec, the build regenerates, and CI fails if generated artifacts drift *or* if the spec's free-text cross-refs name a non-existent path. Guides are normal Markdown PRs. The docs build runs in the same CI as the SDK — no new infra, reuse the `npm run docs:*` scripts as steps. A spec bump from the API team triggers a docs-rebuild PR, exactly mirroring the existing "regenerate against crate X.Y.Z" commits in history.

---

## 7. Phased rollout

Sized to hosaka small-team reality: build the cheap, durable agent-first layer first; defer the operationally heavier AI features until traffic or agent-usage data justifies them.

### Phase 1 — Launch (the whole site, one build away from truth)

- Astro Starlight shell + the six guides migrated; one nav + one design system (adopt the explorer's brass/ink/paper tokens).
- API reference from `spec/openapi.json`; Concepts pages from `x-concepts`.
- **The spec path-consistency gate, landed first** — fix the `/api/v1` and `/dossier/master` drift via an API-team spec PR before the Concepts pages render, then keep the gate green. *(This unblocks the Concepts section, which is otherwise a launch blocker.)*
- SDK reference from `surface.json`; explorer embedded at `/docs/explorer` with deep-link anchors.
- The **60-second quickstart** — keyless `crate.index()` first (zero-credential success), sourced from `examples/quickstart.ts`.
- Pagefind search; `llms.txt` + `llms-full.txt` + `llms-small.txt`; raw `.md` per page; copy-as-markdown; published manifests; sitemap / robots / OG.
- The **endpoint ↔ method cross-link** (`gen-xref.mjs`, the one new piece of glue).
- `docs:check` widened to cover the Starlight build.

### Phase 2 — Fast-follow (once the content model is proven)

- "Open in Claude / ChatGPT" deep-links on every page.
- Public "how our docs stay honest" page documenting the drift gate (including the path-consistency check).
- **MCP docs server** — a thin wrapper over the manifests crate already ships; worth it because the audience is agent-builders, but a deliberate Phase-2 deliverable, not launch-blocking.

### Phase 3 — Later (gated on real demand)

- AI-native search / hosted in-docs chatbot — only if a site + demand exist (or free with Mintlify).
- Versioned docs + version switcher — only when a v2/v3 split actually ships.
- Multi-SDK nav — only if crate gains a second-language SDK.
- JSON-LD structured data — optional polish.

> **The one sentence to remember:** crate's loved-docs ethos already lives in the SDK's code — teaching errors with `hint`/`next`, honest `null`, a keyless self-describing `crate.index()`, branch-on-code. The site's job is mostly to **surface assets that already exist** and stitch them into one IA — not to author new content.

---

## What I would NOT do (yet)

- **No MCP docs server at launch.** `llms-full.txt` + the three runtime manifests give agents ~90% of its value for near-zero cost. Add it in Phase 2, after the content model is proven and there's evidence agents want tool-access beyond a single fetch.
- **No hosted AI chat / RAG assistant.** Implies hosting, retrieval, evals, and ongoing cost with no docs team to own it. Defer until traffic justifies it — or get it free if the team ever picks Mintlify.
- **No version switcher.** One spec version (2.0.0). It is UI for an empty set; stamp the version in a badge so the switcher is purely additive when v3 ships.
- **No multi-language code tabs.** One TypeScript SDK. Fabricating Python/Go tabs would violate the honest-capability rule. The only honest second surface is a TS-SDK / `curl` toggle from the spec.
- **No JSON-LD structured data at launch.** The spec already *is* the typed machine description; the marginal SEO value doesn't clear the bar yet.
- **No bespoke / build-your-own docs platform.** Gold-plating at this scale; Starlight's static shell is the simplest thing that works.
- **No Fumadocs / Next.js app.** Don't take on an SSR runtime to maintain for one SDK + one API.
- **No auto-editing of the API team's spec.** The path-consistency gate detects and routes drift back as a spec PR; the SDK docs build never silently rewrites another team's source of truth.

---

*Sources for current-practice verification:* [Astro Starlight plugins](https://starlight.astro.build/resources/plugins/) · [starlight-openapi](https://github.com/HiDeoo/starlight-openapi) · [starlight-llms-txt](https://github.com/delucis/starlight-llms-txt)
