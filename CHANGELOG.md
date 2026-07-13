# Changelog

All notable changes to `@hosaka-fm/crate` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Stable from `1.0.0`.** The typed surface is regenerated from `spec/openapi.json`, so type
> changes track the live crate API contract. Breaking API changes bump the major.

## [1.11.0] - 2026-07-13

### Changed

- Regenerated types against crate `/api/v2` **2.14.0** — registry tranche-3 adds
  `archive_api_v1.artist_mention_daily` (ridden per-source dated mention aggregate), bringing the
  generic surface registry to **31 surfaces**. Accessor API unchanged (`crate.surface(name, …)`).

## [1.10.0] - 2026-07-13

### Changed

- Regenerated types against `/api/v2` **2.13.0** — registry tranche-2 adds **24 seen surfaces**
  (30 total), the `pe-norm-v1-label` keyspace, and `numeric`/`uuid` field types. `SurfaceRows_*`
  response unions now cover every accepted surface.

## [1.9.0] - 2026-07-12

### Added

- **`crate.surfaces()`** → `GET /api/v2/surface` (the registry index) and
  **`crate.surface(name, { cluster, after, limit })`** → `GET /api/v2/surface/{name}` — one generic
  accessor for the whole cluster-keyed read layer, keyset-paginated via the opaque `after` cursor.

### Changed

- Regenerated against `/api/v2` **2.12.0** (registry go-live).

## [1.8.0] - 2026-07-07

### Changed

- Regenerated against `/api/v2` **2.11.0** — MB Phase-3 scarcity + credits + placements facets.

### Fixed

- Corrected the `VERSION` constant, which `1.7.0` had shipped as `1.6.0` (an unprotected red merge).
  The `contract.test.ts` `VERSION === package.json` gate (ADX-7) now guards this.

## [1.7.0] - 2026-07-07

### Changed

- Regenerated against `/api/v2` **2.9.0** — typed `connections.related[]` with `clusterId`, plus the
  geography facet.

## [1.6.0] - 2026-07-07

### Added

- **`crate.artistMaster()`** — the master grain, cluster-attached.

### Changed

- Regenerated against `/api/v2` **2.8.0**.

## [1.5.0] - 2026-07-07

### Added

- **`crate.artists()`** — the genre-browse discovery grid.

### Changed

- Regenerated against `/api/v2` **2.7.0**.

## [1.4.0] - 2026-07-07

### Changed

- Regenerated against `/api/v2` **2.6.0** — rights-readiness facet + keyless education-preview types.

## [1.3.0] - 2026-07-06

### Added

- **`crate.aura()`** — per-artist convergence aura.

### Changed

- Regenerated against `/api/v2` **2.4.1** (required-field tightening, artwork dimensions). Migration
  guide corrected.

## [1.2.0] - 2026-07-06

### Added

- **`crate.artistBandcampRelease()`** — the cluster-attached Bandcamp release grain.

### Changed

- Regenerated against `/api/v2` **2.3.0**.

## [1.1.0] - 2026-07-03

### Changed

- Regenerated against `/api/v2` **2.2.0** — `search` gains `artist_cluster_id`, `resolve` gains
  `candidates[]`, and `_links` are declared across dossiers.

## [1.0.0] - 2026-06-30

First stable release. Targets crate's **cluster-first `/api/v2`** (OpenAPI `2.0.0`). The catalogue
is now keyed on `cluster_id` — the artist is the root, and `master`/`bandcamp` are _dimensions_ of
the artist dossier rather than top-level resources. This is a breaking change from the `0.x` line
(which targeted `/api/v1`); see **Migrating from v1** in the README.

### Added

- **`crate.label(key, opts?)`** → `LabelDossierContract`. Labels are first-class in v2.
- **`?fields=` sparse fieldsets** on `artist()` and `dossier.artist()` via `{ fields: [...] }` —
  the response is default-rich (one round-trip); pass `fields` only to _trim_ it. An unknown field
  name returns `400 invalid_fields` (added to `CRATE_ERROR_CODES`).
- **RFC 8594 deprecation surfacing**: `Deprecation`/`Sunset` response headers emit a one-time
  `console.warn`. The transport follows `308` redirects preserving method + body (the two POST
  beacon endpoints survive a redirect).
- World-class documentation suite: README (cluster-first hero, recipes, migration table), a
  `docs/` guide set, runnable `examples/`, and agent-first entrypoints (`AGENTS.md`, `llms.txt`).
  The README "Client surface" table + the interactive explorer are generated from method TSDoc
  (`npm run docs:build`); the explorer's "Key concepts" come from the spec's `x-concepts` — all
  drift-guarded in CI.
- npm package metadata: `keywords`, `homepage`, `bugs`; `CHANGELOG.md` ships in the tarball.

### Changed

- **Base path is now `/api/v2`** (was `/api/v1`). `crate.index()` (keyless) reports `version: v2`.
- The artist dossier (`ArtistDossierContract`) is the cluster-first hub: it carries `discography`
  (a pointer index of masters: `discogs_master_id` + `representative_name` + `_links.master`),
  `bandcamp_emergence`, and `bandcamp_tastemaker` dimensions. `LabelDossierContract` is first-class.
- Attribution is **Hosaka FM**; publishing target is the public npm registry under `@hosaka-fm`.

### Removed

- **`crate.master()` / `crate.masters()`** — masters have no standalone v2 resource. The artist
  dossier's `discography` is a pointer index, not per-master detail; per-master enrichment,
  tracklists, and batch master lookups are genuine removals (their `_links.master` point back to
  the frozen v1 surface).
- **`crate.bandcamp.*`** (`release`, `releases`) and the `BandcampRelease*` types — Bandcamp is now
  the `bandcamp_emergence` / `bandcamp_tastemaker` dimensions of the artist dossier.
- **`crate.wayfind` / `crate.usage()`** — no v2 equivalent.
- **Pagination** (`crate.search().pages()`, `bulkAll`, the `pagination` export, async iterators) —
  removed with the bulk Bandcamp surface; `crate.search()` returns a single page.

## [0.3.0] - 2026-06-26

### Added

- `crate.bandcamp.release({ item | url })` → `BandcampRelease | null` (the honest gap, HTTP 200
  `present: false`, returns `null` — not an error) and `crate.bandcamp.releases({ clusterId })` →
  `BandcampReleaseSummary[]`.
- New exported types: `BandcampRelease`, `BandcampReleaseSummary`, `BandcampReleaseResponse`,
  `ArtworkItem`, and a `BandcampTrack` alias.

### Changed

- Regenerated types against the live spec: `resolve()` `locators` now spans eight platform arrays;
  dossiers carry link-only `artwork` (`ArtworkItem[]`). `bandcamp_item_id` / `cluster_id` are
  opaque strings — pass through, never numericize.

## [0.2.0] - 2026-06-26

### Changed

- **Key-first.** Every data endpoint now requires an `apiKey` (sent as `X-API-Key`); only
  `crate.index()` is keyless. Data methods throw `CrateValidationError('api_key_required')` before
  any network call. Regenerated against crate API spec `1.1.0`.

## [0.1.0] - 2026-06-26

### Added

- Initial release: typed client over crate's public API with typed methods, automatic retries
  (full-jitter backoff honouring `Retry-After`), async-iterator pagination, teaching errors as
  typed exceptions (`CrateError` + subclasses, `.kind`/`.code`/`.hint`/`.next`, JSON-safe), the
  `CRATE_RESOURCES` surface map and `CRATE_ERROR_REGISTRY` error dictionary, dual ESM + CJS, and
  zero runtime dependencies.

[unreleased]: https://github.com/hosaka-fm/crate-sdk/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/hosaka-fm/crate-sdk/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/hosaka-fm/crate-sdk/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/hosaka-fm/crate-sdk/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hosaka-fm/crate-sdk/releases/tag/v0.1.0
