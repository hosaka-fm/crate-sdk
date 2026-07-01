// Cancellation & deadlines — AbortSignal vs the whole-call timeout budget.
// Type-checked in CI. In real code, import from '@hosaka-fm/crate'.
import { Crate, isCrateAbortError, isCrateTimeoutError } from '../src/index';

async function main(): Promise<void> {
  const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

  // Caller abort → CrateAbortError (never retried).
  const ac = new AbortController();
  const inflight = crate.search({ q: 'jungle' }, { signal: ac.signal });
  ac.abort();
  try {
    await inflight;
  } catch (err) {
    if (isCrateAbortError(err)) console.log('aborted by caller');
    else throw err;
  }

  // A tight deadline → CrateTimeoutError (retried within the budget, then surfaced).
  try {
    await crate.search({ q: 'ambient' }, { timeout: 1, totalDeadlineMs: 50 });
  } catch (err) {
    if (isCrateTimeoutError(err)) console.log(`timed out after ${err.timeoutMs}ms`);
    else throw err;
  }
}

void main();
