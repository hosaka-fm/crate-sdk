// Shared identifier classification for resolve() + artist() (SDD §3.1/§3.2,
// agent-ergonomics ADX-1/ADX-9). Single source of the HEX64/LOCATOR regexes.
import { CrateValidationError } from './errors';

/** A 64-char hex cluster_id (the canonical artist key). */
export const HEX64 = /^[0-9a-f]{64}$/i;
/** A `discogs:<id>` / `mbid:<uuid>` locator. */
export const LOCATOR = /^(discogs|mbid):(.+)$/i;
const URL_RE = /^https?:\/\//i;
const DIGITS = /^\d+$/;

/** The five mutually-exclusive resolve identifiers. */
export type ResolveQuery =
  | { url: string }
  | { q: string }
  | { cluster: string }
  | { discogs: string | number }
  | { mbid: string };

const RESOLVE_KEYS = ['url', 'q', 'cluster', 'discogs', 'mbid'] as const;

/**
 * Infer a {@link ResolveQuery} from a bare string (ADX-1): a URL → `{url}`; a
 * `discogs:`/`mbid:` locator → that id; a 64-hex string → `{cluster}`; anything
 * else → `{q}` (free-text name search).
 */
export function classifyResolveString(input: string): ResolveQuery {
  const s = input.trim();
  if (URL_RE.test(s)) return { url: s };
  const loc = LOCATOR.exec(s);
  if (loc) {
    const scheme = loc[1].toLowerCase();
    const rest = loc[2];
    return scheme === 'discogs' ? { discogs: rest } : { mbid: rest };
  }
  if (HEX64.test(s)) return { cluster: s };
  return { q: s };
}

/** Reduce a ResolveQuery to its single `{ key, value }`, enforcing exactly-one-of (treats `''` as absent). */
export function resolveQueryToParam(query: ResolveQuery): { key: string; value: string } {
  const present = RESOLVE_KEYS.filter((k) => {
    const v = (query as Record<string, unknown>)[k];
    return v !== undefined && v !== null && v !== '';
  });
  if (present.length !== 1) {
    throw new CrateValidationError(
      `crate.resolve() needs exactly one of ${RESOLVE_KEYS.join(' | ')}, got ${present.length}`,
      {
        code: 'exactly_one_of',
        param: 'query',
        hint: `pass exactly one identifier (${RESOLVE_KEYS.join(' | ')})`,
        next: 'crate.resolve({ q: "Four Tet" })',
      },
    );
  }
  const key = present[0]!;
  return { key, value: String((query as Record<string, unknown>)[key]) };
}

export type ArtistKeyKind =
  | { type: 'direct'; key: string } // 64-hex cluster_id OR slug/name — one hop to /artist/{key}
  | { type: 'locator'; scheme: 'discogs' | 'mbid'; rest: string }; // needs resolve() first

/**
 * Classify an `artist()` key (ADX-9). A 64-hex → direct; a `discogs:`/`mbid:`
 * locator OR a bare numeric (treated as a discogs id) → resolve-then-fetch;
 * anything else (slug or plain name) → direct one-hop (the endpoint name-resolves).
 */
/** Throw a teaching CrateValidationError for an empty/whitespace key (parity with resolve()). */
export function assertNonEmptyKey(input: string, method: 'artist' | 'bandcamp'): void {
  if (input.trim() === '') {
    throw new CrateValidationError(`crate.${method}(): key must not be empty`, {
      code: 'empty_key',
      param: method === 'bandcamp' ? 'artistKey' : 'key',
      hint: 'pass a cluster_id, slug, name, or discogs:/mbid: locator',
      next: method === 'bandcamp' ? "crate.bandcamp('<cluster_id>')" : "crate.artist('Four Tet')",
    });
  }
}

export function classifyArtistKey(input: string): ArtistKeyKind {
  assertNonEmptyKey(input, 'artist');
  const s = input.trim();
  if (HEX64.test(s)) return { type: 'direct', key: s };
  const loc = LOCATOR.exec(s);
  if (loc)
    return { type: 'locator', scheme: loc[1].toLowerCase() as 'discogs' | 'mbid', rest: loc[2] };
  if (DIGITS.test(s)) return { type: 'locator', scheme: 'discogs', rest: s };
  return { type: 'direct', key: s };
}
