# AGENTS.md — @hosaka-fm/crate

Machine-first entrypoint for AI agents. This is a thin pointer to the SDK's own exported
constants and behaviors — the README and `docs/ai-agents.md` have the full guide.

## Happy path (key-first)

```ts
import { Crate, isCrateError } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY }); // required; only crate.index() is keyless
const artist = await crate.artist('Four Tet'); // name | slug | 64-hex cluster_id | discogs:/mbid: locator
```

## The contract

- **Forgiving inputs.** `resolve(...)` / `artist(...)` accept a bare string (URL → `url`,
  `discogs:`/`mbid:` → locator, 64-hex → `cluster`, else → free-text `q`) or an explicit object.
- **Branch on `err.kind` then `err.code` — never the message.** Client-side errors carry
  `err.hint` (what's wrong) and `err.next` (a copy-pasteable corrected call).
- **`JSON.stringify(err)` is lossless** for logs and agent-to-agent handoff (a plain `Error` →
  `{}`). It omits `.raw` and reduces `.cause` to `{name,message}`.
- **Do not double-retry.** The SDK already retries `429/5xx` with full-jitter backoff. On a `429`,
  read `err.retryAfter` / `err.rateLimit`; don't add your own retry loop.
- **`null` is an honest gap, not an error.** `artistOrNull(...)` and `bandcamp.release(...)` return
  `null` (HTTP 200, `present:false`) when data is genuinely absent. Only `4xx`/`5xx` throw.
- **Prefer `isCrate*` guards over `instanceof`** (they survive the ESM/CJS boundary).
- **Opaque ids.** `cluster_id`, `bandcamp_item_id`, and pagination cursors are strings — pass
  through verbatim, never numericize.

## Discover at runtime (no external docs)

```ts
import { CRATE_RESOURCES, CRATE_ERROR_REGISTRY } from '@hosaka-fm/crate';
await crate.index(); // live API root + cold-start recipe (keyless)
CRATE_RESOURCES; // static surface map: every method, endpoint, auth tier
CRATE_ERROR_REGISTRY; // error dictionary: per-kind retryable/clientSide/carries/whenThrown
```

Canonical runnable recipe: [`examples/agent.ts`](./examples/agent.ts) (type-checked in CI).
Full guide: [`docs/ai-agents.md`](./docs/ai-agents.md).
