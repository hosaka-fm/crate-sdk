// Fetch the live crate /api/v2 OpenAPI spec and write it to the vendored spec/openapi.json.
// Pair with `npm run generate` (regenerates types + meta) — the scheduled revendor-spec workflow
// runs both, then opens a PR if anything changed. Local use: `npm run spec:vendor`.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(readFileSync(path.join(root, 'spec', 'meta.json'), 'utf8'));
const url = meta.spec_url || 'https://crate.0xhoneyjar.xyz/api/v2/openapi.json';

const res = await fetch(url);
if (!res.ok) {
  console.error(`vendor-spec: fetch ${url} → HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json();
writeFileSync(path.join(root, 'spec', 'openapi.json'), `${JSON.stringify(spec, null, 2)}\n`);
console.log(`vendor-spec: ${url} → spec/openapi.json (info.version ${spec.info.version})`);
