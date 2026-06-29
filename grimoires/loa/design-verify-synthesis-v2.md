# crate-sdk v2 1.0 — design-verify synthesis (cycle-3)

Source: handoff `crate:grimoires/loa/roadmap/cycle-3-crate-sdk-v2-handoff.md` + a 4-lens
design-verify (demoted-route · surface-map · mechanics · adversarial). Decision: **(A) clean
v2-only**, with the brief's "re-home the data" premise corrected by the adversarial lens.

## Locked decisions

1. **Target `/api/v2` (2.0.0), v2-only.** Flip `API_PREFIX` in `src/http.ts` to a plain
   `'/api/v2'` constant — **no** `apiVersion` option (YAGNI: nothing must hit v1). Fix the stale
   `/api/v1` strings (http.ts buildUrl comment; client.ts constructor error copy + path fallback).
2. **Surface (0.3.0 → 1.0.0):**
   - **Kept (retargeted):** `index`, `resolve`, `artist`/`artistOrNull`, `search`, `facets`,
     `breakouts`, `tastemakers`(+`onesToWatch`), `dossier.{artist,label,festival,manifest}`,
     `searchEvents.{observed,refined}`.
   - **Added:** top-level `label(key)` + `labelOrNull` (cluster-first → `LabelDossierContract`);
     `fields?: string[]` on `artist`/`artistOrNull`/`dossier.artist` (opt-out trim).
   - **Removed:** `master`, `masters`, `dossier.master`, `bandcamp.*` (callable/bulk/bulkAll/
     index/release/releases), `wayfind`(+`interpret`), `usage`.
3. **Honest capability losses (document, do NOT claim re-homed):**
   - Per-master enrichment (`owner_count`/`dj_count`/`cube_quadrant`) and the rich master dossier
     — **gone from v2**. `artist().discography` is a *catalogue index* (`discogsMasterId`,
     `representativeName`, `isPrimary`, `billingPosition`, `_links.master`), not the signal layer.
     Its `_links.master` points at **frozen `/api/v1`** — surfaced verbatim with a caveat.
   - Bandcamp **per-release tracklist / economics / artwork + the bulk feed** — gone. Only
     artist-level `bandcamp_emergence` + `bandcamp_tastemaker` aggregate facets survive (on the
     artist dossier).
   - `wayfind` (NL) and `usage` (quota/tier) — removed, no v2 successor. `usage`: in-window
     `X-RateLimit-*` (already on `CrateAPIError.rateLimit`) is the partial substitute; monthly
     quota/tier is lost. **Flag upstream: request `/api/v2/usage` + a v2 master/release-detail successor.**
   - Escape hatch for all of the above: frozen `/api/v1` (a 0.3.x client), stated in the migration.
4. **`?fields=`:** `fields?: string[]` on `RequestOptions` → comma-joined `fields` query when
   non-empty; omitted ⇒ full dossier. No client-side facet allow-list (the server's teaching
   `400 invalid_fields` owns it). It flows through the existing `error-mapping` (carries
   `hint`/`next`/`details`); add `invalid_fields` to `CRATE_ERROR_CODES` + a regression test.
5. **Deprecation/308:** the SDK targets v2 so it won't normally see them, but degrade gracefully —
   `redirect:'manual'` + an explicit **single-hop** 308 re-issue preserving method+body (the two
   POST beacons), and a **once-guarded** `console.warn` on a `Sunset`/`Deprecation` header. Loop-cap 1.
6. **Drift guards:** re-point `generate-types.mjs` + `check-spec-staleness.mjs` at
   `/api/v2/openapi.json`; drop v1 watching (frozen ⇒ dead config). Re-point `docs:*` (TSDoc pipeline)
   + `extract-surface` stays method-driven.
7. **Version: `1.0.0`** (per the brief — the v2 major). Note: the adversarial lens argued `0.4.0`
   (pre-publish; capability gaps shouldn't lock as "stable"). Going 1.0.0 with the removals
   documented as deliberate cluster-first scope; reversible pre-publish if the owner prefers 0.4.0.

## Gate
typecheck · lint · test (update GOLDEN export snapshot + contract/surface/jsdoc) · build · attw ·
`docs:check` + `check:staleness` (now v2). Then an adversarial review+audit workflow. Build + tag
`v1.0.0` in-repo; **publish held** (no npm org yet).
