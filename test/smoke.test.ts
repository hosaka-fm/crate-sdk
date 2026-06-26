import { describe, expect, it } from 'vitest';
import { Crate } from '../src/index';

// Opt-in live smoke (NFR4 / ADX-6): one anonymous call against the real public API,
// through the SDK's real retry path. Skipped unless CRATE_LIVE_SMOKE=1, never gates PR
// CI, and runs a single request so it respects the public rate limits.
const LIVE = process.env.CRATE_LIVE_SMOKE === '1';

describe.skipIf(!LIVE)('live smoke (anonymous, CRATE_LIVE_SMOKE=1)', () => {
  it('resolve("Four Tet") returns an IdentityResolution from the live API', async () => {
    const crate = new Crate(); // anonymous
    const r = await crate.resolve('Four Tet');
    expect(r).toHaveProperty('resolved_from'); // contract shape (cluster_id may be null — honest gap)
  }, 30000);
});
