# Using @hosaka-fm/crate from an AI agent

AI agents are a first-class consumer. The SDK is built so an agent's first attempt works, and so it
can recover from any failure **using the returned error object alone** — no external docs, no
message parsing. (See also the machine-first [`AGENTS.md`](../AGENTS.md) and [`llms.txt`](../llms.txt).)

## Forgiving inputs

`resolve(...)` and `artist(...)` accept a bare string and infer the kind:

| You pass                       | Inferred as              |
| ------------------------------ | ------------------------ |
| `https://artist.bandcamp.com`  | `url`                    |
| `discogs:1234` / `mbid:<uuid>` | locator                  |
| a 64-hex string                | `cluster` (`cluster_id`) |
| anything else                  | free-text `q` (name)     |

Or pass an explicit one-of object: `crate.resolve({ url })`, `{ q }`, `{ cluster }`,
`{ discogs }`, `{ mbid }`. Supplying zero or several throws `CrateValidationError('exactly_one_of')`.

## Branch on code, never the message

```ts
import { Crate, isCrateError, isRateLimited } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

try {
  const artist = await crate.artist('Four Tet');
  for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 3 })) {
    handle(row);
  }
} catch (err) {
  if (!isCrateError(err)) throw err;
  switch (err.kind) {
    case 'validation':
      console.error(`${err.code}: ${err.hint} → ${err.next}`); // next is a corrected call you can run
      break;
    case 'api':
      if (isRateLimited(err)) await wait(err.retryAfter); // do NOT add your own retry loop
      break;
    default:
      log(JSON.stringify(err)); // JSON-safe — hand off to another agent losslessly
  }
}
```

- **`err.hint`** = what's wrong, in one line. **`err.next`** = a copy-pasteable corrected call.
- **`JSON.stringify(err)` is lossless** for logging and agent-to-agent handoff (a plain `Error`
  serializes to `{}`). It omits `.raw` and reduces `.cause` to `{name,message}`.
- **The SDK already retried `429/5xx`.** Don't wrap calls in your own retry loop — you'll multiply
  the backoff. On a `429`, `err.retryAfter` is the server-directed ceiling.

## `null` is an honest gap, not a failure

`artistOrNull(...)` and `bandcamp.release(...)` return `null` (HTTP 200, `present:false`) when data
is genuinely absent. Treat `null` as control flow, not an error to catch. Only `4xx`/`5xx` throw.

## Opaque identifiers

`cluster_id`, `bandcamp_item_id`, and pagination cursors are **strings**. Pass them through
verbatim — never numericize, truncate, or reformat them.

## Discover the surface at runtime

No need to memorize the API — read it from the SDK:

```ts
import { CRATE_RESOURCES, CRATE_ERROR_REGISTRY } from '@hosaka-fm/crate';

const root = await crate.index(); // keyless — live API root + a cold-start recipe
root.resources; // [{ name, url, auth, description, how_to_get_the_key }]

CRATE_RESOURCES; // static map: every method → { method, endpoint, auth, retryable, idempotent }
CRATE_ERROR_REGISTRY.api; // { retryable, clientSide, carries: [...], whenThrown }
```

## Ground truth

The canonical recipe lives in [`examples/agent.ts`](../examples/agent.ts) and the introspection
recipe in [`examples/discovery.ts`](../examples/discovery.ts) — both type-checked in CI, so they
can't drift from the real API.
