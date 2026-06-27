# Changelog

All notable changes to `@hosaka-fm/crate` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Pre-`1.0`:** minor versions may include breaking changes. The typed surface is regenerated
> from `spec/openapi.json`, so type changes track the live crate API contract.

## [Unreleased]

### Added

- World-class documentation suite: rewritten README (hero, badges, recipes, compatibility,
  versioning), a `docs/` guide set (getting-started, authentication, pagination, errors,
  ai-agents, recipes, configuration), runnable `examples/` (quickstart, pagination,
  error-handling, cancellation, discovery), and agent-first entrypoints (`AGENTS.md`, `llms.txt`).
- npm package metadata: `keywords`, `homepage`, `bugs`; `CHANGELOG.md` now ships in the tarball.
- New exported types `BandcampLabel` and `BandcampReleaseEconomics`; `BandcampRelease` /
  `BandcampReleaseSummary` now carry `label`, and `BandcampRelease` carries `economics`
  (pricing / download terms) — from crate spec 1.4.0.
- The README "Client surface" table and the interactive explorer are generated from the method
  TSDoc (`npm run docs:build`); the explorer's "Key concepts" are generated from the spec's
  `x-concepts` vendor extension (15 entries) — all drift-guarded in CI.

### Changed

- Attribution is now **Hosaka FM** (was "The Honey Jar"); `LICENSE` copyright and `package.json`
  `author` updated accordingly.
- Publishing target is the **public npm registry** under the `@hosaka-fm` scope (was GitHub
  Packages). Install is a plain `npm install @hosaka-fm/crate`.
- Regenerated types against the crate spec **1.6.0** (the full docs-as-contract arc): 24
  operationIds, a fully-specified `Error` schema, and declared `X-RateLimit-*` headers (1.4.0);
  deep field descriptions + examples that now flow into editor hovers / TypeDoc (1.5.0); and
  `ApiRootIndex` gained `recipes[]` + `errors[]` — the runtime self-teaching index (1.6.0).
  `CRATE_ERROR_CODES` lists crate's documented machine codes (e.g. `invalid_query`,
  `master_not_found`); `.code` is taken from the response `error` field (switch on it, never HTTP
  status). Verified purely additive — no removed/renamed/retyped fields.

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

[unreleased]: https://github.com/hosaka-fm/crate-sdk/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/hosaka-fm/crate-sdk/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/hosaka-fm/crate-sdk/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hosaka-fm/crate-sdk/releases/tag/v0.1.0
