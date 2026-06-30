import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as pkg from '../src/index';
import { CRATE_RESOURCES } from '../src/resources';
import type {
  ArtistDossierContract,
  IdentityResolution,
  LabelDossierContract,
  RateLimited,
  SearchResponse,
} from '../src/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(path.join(root, 'spec', 'openapi.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('version', () => {
  it('VERSION matches package.json (ADX-7)', () => {
    expect(pkg.VERSION).toBe(manifest.version);
  });
});

describe('public API surface snapshot (ADX-10)', () => {
  // A committed golden — adding/removing/renaming a public runtime export is a reviewed diff.
  const GOLDEN = [
    'Crate',
    'VERSION',
    'CRATE_RESOURCES',
    'CRATE_ERROR_KINDS',
    'CRATE_ERROR_CODES',
    'CRATE_ERROR_REGISTRY',
    'CrateError',
    'CrateAPIError',
    'CrateNetworkError',
    'CrateTimeoutError',
    'CrateAbortError',
    'CrateValidationError',
    'CrateNotFoundError',
    'CrateParseError',
    'isCrateError',
    'isCrateAPIError',
    'isCrateNetworkError',
    'isCrateTimeoutError',
    'isCrateAbortError',
    'isCrateValidationError',
    'isCrateNotFoundError',
    'isCrateParseError',
    'isRateLimited',
    'isRetryable',
  ].sort();

  it('runtime exports match the golden (public API changed — bump + review if this fails)', () => {
    expect(Object.keys(pkg).sort()).toEqual(GOLDEN);
  });
});

describe('auth-tier contract (key-first: doc-level ApiKeyAuth default)', () => {
  it('the spec declares a doc-level ApiKeyAuth security default', () => {
    expect(spec.security).toEqual([{ ApiKeyAuth: [] }]);
  });

  it('every CRATE_RESOURCES auth tier matches the live effective security', () => {
    for (const [name, r] of Object.entries(CRATE_RESOURCES)) {
      const op = spec.paths?.[r.endpoint]?.[r.method.toLowerCase()];
      expect(op, `${name} → ${r.method} ${r.endpoint} missing in spec`).toBeDefined();
      // Effective security = per-op override, else the document-level default.
      const effective = op.security !== undefined ? op.security : spec.security;
      const secJson = JSON.stringify(effective);
      if (r.auth === 'anon') {
        expect(
          Array.isArray(effective) && effective.length === 0,
          `${name} should be anon (security:[]), got ${secJson}`,
        ).toBe(true);
      } else if (r.auth === 'key') {
        expect(secJson, name).toContain('ApiKeyAuth');
      } else {
        expect(secJson, name).toContain('BeaconBearerAuth');
      }
    }
  });

  it('only index + openapi are public (security: [])', () => {
    const publicPaths = Object.entries(
      spec.paths as Record<string, Record<string, { security?: unknown }>>,
    )
      .flatMap(([p, ops]) =>
        Object.entries(ops)
          .filter(([, op]) => Array.isArray(op.security) && op.security.length === 0)
          .map(([m]) => `${m.toUpperCase()} ${p}`),
      )
      .sort();
    expect(publicPaths).toEqual(['GET /api/v2', 'GET /api/v2/openapi.json']);
  });
});

describe('type-alias contract (checked by tsc --noEmit)', () => {
  it('re-exported aliases are non-any with the expected nullability', () => {
    expectTypeOf<IdentityResolution['cluster_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<IdentityResolution['slug']>().toEqualTypeOf<string | null>();
    expectTypeOf<ArtistDossierContract>().not.toBeAny();
    expectTypeOf<SearchResponse>().not.toBeAny();
    expectTypeOf<RateLimited['retry_after_seconds']>().toEqualTypeOf<number>();
    expectTypeOf<LabelDossierContract>().not.toBeAny();
    // @ts-expect-error — proves tsc is actually checking this file (engagement guard)
    const _wrong: number = 'not a number';
    void _wrong;
  });
});
