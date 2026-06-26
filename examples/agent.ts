// "Using @hosaka/crate from an AI agent" — the canonical recipe (ADX-6).
// This file is type-checked by `npm run typecheck` (it is in tsconfig `include`),
// so the README snippet it mirrors cannot rot. In real code, import from
// '@hosaka/crate' instead of '../src/index'.
import {
  CRATE_ERROR_REGISTRY,
  Crate,
  type CrateErrorKind,
  isCrateError,
  isRateLimited,
} from '../src/index';

export async function agentRecipe(): Promise<void> {
  // 1. Zero-config: the public surface is anonymous today. Pass { apiKey } for
  //    key-gated methods (facets / master / masters / usage / wayfind.interpret).
  const crate = new Crate();

  // Forgiving inputs: a name, a slug, a 64-hex cluster_id, or a discogs:/mbid: locator.
  const artist = await crate.artist('Four Tet');
  console.log(artist.display);

  // 2. Error recovery WITHOUT parsing messages: branch on err.kind / err.code,
  //    read err.hint + err.next (the SDK tells you the fix), use the guards.
  try {
    await crate.resolve(''); // → CrateValidationError(exactly_one_of)
  } catch (err) {
    if (isCrateError(err)) {
      switch (err.kind) {
        case 'validation':
          console.error(`${err.code}: ${err.hint} → ${err.next}`);
          break;
        case 'api':
          // `case 'api'` narrows err to CrateAPIError (status/code/retryAfter available).
          console.error(`HTTP ${err.status} (${err.code})`);
          if (isRateLimited(err)) console.error(`server asked to retry after ${err.retryAfter}s`);
          break;
        default:
          console.error(err.code);
      }
      // JSON-safe: the full teaching payload survives logging / agent handoff.
      console.error(JSON.stringify(err));
    } else {
      throw err;
    }
  }

  // 3. Auto-paginate bandcamp rows (terminates on null next_cursor; maxPages caps cleanly).
  for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 3 })) {
    console.log(row);
  }

  // 4. Self-describe: crate.index() is the live root map; CRATE_ERROR_REGISTRY is the
  //    static error dictionary an agent can branch on without reading docs.
  const index = await crate.index();
  console.log(index.object);
  const kinds = Object.keys(CRATE_ERROR_REGISTRY) as CrateErrorKind[];
  console.log(kinds.join(', '));
}
