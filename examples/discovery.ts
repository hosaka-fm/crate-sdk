// Discovery — introspect the API surface and error dictionary without external docs.
// Type-checked in CI. In real code, import from '@hosaka-fm/crate'.
import { Crate, CRATE_RESOURCES, CRATE_ERROR_REGISTRY, type CrateResourceName } from '../src/index';

async function main(): Promise<void> {
  // index() is the one keyless endpoint — perfect for live discovery.
  const crate = new Crate();

  const root = await crate.index();
  console.log('cold start:', root.cold_start.problem);
  for (const r of root.resources) console.log(`  ${r.name} [${r.auth}] ${r.url}`);

  // Static surface map (no network) — every method, endpoint, and auth tier.
  for (const name of Object.keys(CRATE_RESOURCES) as CrateResourceName[]) {
    const res = CRATE_RESOURCES[name];
    console.log(`${name}: ${res.method} ${res.endpoint} (auth=${res.auth})`);
  }

  // Error dictionary (no network) — what each kind carries and whether it retries.
  console.log('api errors retryable?', CRATE_ERROR_REGISTRY.api.retryable);
}

void main();
