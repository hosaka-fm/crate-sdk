# Prompt for the crate API team — make the spec self-teaching (docs-as-contract)

> Paste target: the crate API maintainers. Goal: push educational depth up to the
> OpenAPI spec + runtime so every client inherits it. From the @hosaka-fm/crate SDK team.

## Why this is different from Stripe / Vercel / Supabase

Those SDKs can write terse reference because their concepts — charges, deploys, rows —
already live in every developer's head. **crate's vocabulary is novel**: `cluster_id`,
dossiers, grains, the cube, honest gaps, tastemakers, breakouts, beacons. Developers *and
AI agents* can't lean on prior patterns, so our docs have to **teach the mental model**, not
just list fields — or people won't even know what's askable.

The highest-leverage place to do that is the **API/spec layer**. Anything you put in the
OpenAPI spec flows automatically into: the SDK's generated types + editor hovers + the
TypeDoc reference, the raw API docs, any third-party client, and our interactive explorer —
**one source, drift-guarded, write-once-teach-everywhere**. The SDK already inherits your
schema `description`s today; this ask is about depth and a few new surfaces.

## Ownership model (so we don't duplicate)

- **You (API/spec) own:** field/data semantics, endpoint purpose, domain concepts, example
  payloads, and the runtime self-teaching surface.
- **We (SDK) own:** the ergonomic layer that doesn't exist in the API — `artistOrNull`, the
  async-iterator `bulkAll`, the typed `CrateError` model, auto-retry, honest-gap-as-`null`.
  We document those in TSDoc; you don't need to.

## The asks

### 1. Deepen every schema field `description`
For each property in `components.schemas`, answer three things in plain language: **what it
is, why it matters, and the gotcha** (opaque id? nullable / honest gap? link-only?). The bar:

```jsonc
"cluster_id": {
  "type": "string", "nullable": true,
  "description": "crate's canonical artist identity (pe-norm-v1 hex). The same artist across Discogs, MusicBrainz and Bandcamp collapses to ONE cluster_id — key all artist data off it. `null` is an honest gap (we couldn't resolve a cluster), not an error. Opaque — pass through verbatim, never numericize.",
  "example": "9f2c1e7b8a3d4f60a1b2c3d4e5f60718"
}
```
High-value fields to nail first: `cluster_id`, `track_url` (the Bandcamp *page*, never a
stream), `present`/honest-gap booleans, `resolved_via` / `resolved_from`, `cube_quadrant`,
the dossier section `state` enum, `next_cursor` (opaque), and `bandcamp_item_id` (opaque string).

### 2. Add `example` / `examples` to schemas and request bodies
OpenAPI 3.1 supports `example` on schemas and `examples` on media types. A realistic example
payload per response schema lets every client show **"here's the shape you get back"** without
guessing — it's what powers worked-example output sketches in docs and the explorer.

### 3. Operation-level docs + stable `operationId`s
- Give every operation a stable **`operationId`** (e.g. `resolveIdentity`, `getArtistDossier`,
  `bulkBandcamp`). Today there are none, so codegen can't wire operation docs to methods and
  emits an empty `operations` type. operationIds fix both.
- Add a one-line **`summary`** and a richer **`description`** (the ELI5: what / why / when, any
  novel behavior, honest-gap semantics) to each operation.

### 4. A canonical "concepts" layer
Document the vocabulary once, authoritatively:
- Put a rich markdown **`info.description`** covering: identity resolution & `cluster_id`;
  dossiers & grains; **honest gaps** (HTTP 200 + `present:false`/`null` ≠ error); the cube /
  behavioral signals; tastemakers & breakouts; beacons (two-way telemetry).
- Optional but ideal for agents: a vendor extension **`x-concepts`** — a structured list of
  `{ term, eli5, see }` so clients can surface concepts programmatically.

### 5. Enrich the runtime self-teaching surface (agents read this live)
`GET /api/v1` already returns `cold_start` + `resources[].description` + `how_to_get_the_key`.
Lean into it — it's the one surface agents hit before they have docs:
- Expand `cold_start.steps` into a few task-oriented recipes (resolve → artist; search →
  refine; page the Bandcamp feed; build a dossier).
- Add `description` + a short **`eli5`** + an **`example`** to each `resources[]` entry.
- Consider exposing the **error catalogue** at runtime (code → when-thrown → fix) so agents can
  self-correct without external docs.

### 6. Make the error contract explicit in the spec
- Describe the `Error` schema fields (`error`, `message`, `hint`, `doc_url`, `param`, `next`,
  `details`, `retry_after_seconds`) — and document **`hint` = what's wrong, `next` = a
  copy-pasteable corrected call** (machine-actionable).
- Enumerate the error codes with when-thrown + remediation.
- Add typed **`_links`** and declare the **`X-RateLimit-*`** response headers in the spec.
  *(This also unblocks our deferred SDK work — bead C2.3 — letting us drop defensive reads and
  type `bandcamp.index()` to a real `BandcampManifest`.)*

### 7. Conventions that keep it honest + non-drifting
- **Bump `info.version` on every spec change** — our nightly drift check keys off it, and it
  currently lags (reads `1.2.0` while `/bandcamp/release` is already live).
- Treat descriptions as part of the contract: stable, additive.
- Document all opaque ids (`cluster_id`, `bandcamp_item_id`, cursors) as **strings — never
  numericize**.

## The payoff
You write each fact once, in the spec or the index endpoint. It then teaches in: the SDK's
generated types and IDE hovers, the TypeDoc API reference, the raw API docs, every other
client, our interactive explorer, and at runtime for agents — all from one drift-guarded
source. That's the multiplier that lets crate's novel surface actually get adopted.
