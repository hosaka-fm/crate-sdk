import { describe, expect, it } from 'vitest';
import { Crate } from '../src/index';

// Opt-in live smoke (NFR4 / ADX-6): one keyed call against the real public API,
// through the SDK's real retry path. Skipped unless CRATE_LIVE_SMOKE=1 AND
// CRATE_API_KEY are set (crate is key-first — data endpoints require a key).
// Never gates PR CI; a single request, so it respects the public rate limits.
const KEY = process.env.CRATE_API_KEY;
const LIVE = process.env.CRATE_LIVE_SMOKE === '1' && !!KEY;

describe.skipIf(!LIVE)('live smoke (keyed, CRATE_LIVE_SMOKE=1 + CRATE_API_KEY)', () => {
  it('resolve("Four Tet") returns an IdentityResolution from the live API', async () => {
    const crate = new Crate({ apiKey: KEY });
    const r = await crate.resolve('Four Tet');
    expect(r).toHaveProperty('resolved_from'); // contract shape (cluster_id may be null — honest gap)
  }, 30000);

  it('index() works keyless (the one public endpoint)', async () => {
    const r = await new Crate().index();
    expect(r).toHaveProperty('object');
  }, 30000);
});
