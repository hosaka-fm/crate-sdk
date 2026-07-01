// Error handling — the canonical try/catch that branches on err.kind.
// Type-checked in CI. In real code, import from '@hosaka-fm/crate'.
import { Crate, isCrateError, isRateLimited, type AnyCrateError } from '../src/index';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

  try {
    await crate.artist('Four Tet');
  } catch (err) {
    if (!isCrateError(err)) throw err; // not ours — rethrow
    const e: AnyCrateError = err;
    switch (e.kind) {
      case 'validation':
      case 'not_found':
        // Client-side: hint says what's wrong, next is a copy-pasteable corrected call.
        console.error(`${e.code}: ${e.hint} → ${e.next}`);
        break;
      case 'api':
        // CrateAPIError — log the status, then back off again only if rate-limited.
        // (isRateLimited narrows in an `if`; using it in an `else` would make e `never`.)
        console.error(`HTTP ${e.status} (${e.code}) req=${e.requestId}`);
        if (isRateLimited(e)) await sleep((e.retryAfter ?? 1) * 1000); // SDK already backed off
        break;
      default:
        // JSON-safe teaching payload — safe to log or hand off to another agent.
        console.error(JSON.stringify(e));
    }
  }
}

void main();
