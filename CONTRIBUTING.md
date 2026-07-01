# Contributing to @hosaka-fm/crate

Thanks for helping improve the official crate TypeScript client. This SDK is a **consumer of
crate's public API** — it adds typing, retries, pagination, and teaching errors over the public
contract. It never reaches into crate internals.

## Setup

```sh
git clone https://github.com/hosaka-fm/crate-sdk.git
cd crate-sdk
npm ci   # zero runtime deps; devDependencies only
```

Requires **Node 18+**.

## The gate (run before every PR)

These are the exact checks CI runs — match them locally:

```sh
npm run typecheck      # tsc --noEmit (includes examples/)
npm run lint           # prettier --check .   (npm run format to fix)
npm test               # vitest: unit + contract + dual-package + drift
npm run build          # tsup → dual ESM + CJS in dist/
npm run check:exports  # @arethetypeswrong/cli — dual-package type safety
```

A live smoke test runs only when you opt in with a key (never commit one):

```sh
CRATE_LIVE_SMOKE=1 CRATE_API_KEY=ck_… npm test
```

## Types are generated — don't hand-edit them

The public types come from crate's OpenAPI spec. **Never edit `src/generated/` by hand.** To
adopt API changes:

```sh
npm run generate   # regenerates src/generated/crate-api.d.ts + spec/meta.json from spec/openapi.json
```

A drift test fails the build if the committed generated types fall out of sync with the spec. A
scheduled job also flags when the live spec moves ahead of the vendored copy.

## Keep the runtime mirrors honest

`CRATE_RESOURCES` (the surface map) and `CRATE_ERROR_REGISTRY` (the error dictionary) are part of
the public, agent-facing contract. If you add or change a method or error kind, update the mirror
**and** its drift/contract test. The `examples/` are type-checked in CI so the README's snippets
can't rot — update them alongside any surface change.

## Commits & PRs

- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
  `chore:`, …) — they drive the changelog and version bumps.
- Keep changes surgical and matched to the existing style.
- Update `CHANGELOG.md` under `## [Unreleased]`.
- Fill in the PR template checklist (gate green, types regenerated if the spec changed, examples
  still type-check).

## Reporting issues

Use the [issue templates](https://github.com/hosaka-fm/crate-sdk/issues/new/choose). For problems
with the crate **API/service** (keys, billing, rate limits, data), see
[crate support](https://crate.hosaka.fm/docs) — this repo is for the **client library**.
Security reports go through [`SECURITY.md`](./SECURITY.md), not public issues.
