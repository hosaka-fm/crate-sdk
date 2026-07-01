// Fetch the live crate /api/v2 OpenAPI spec and write it to the vendored spec/openapi.json.
// Pair with `npm run generate` (regenerates types + meta) — the scheduled revendor-spec workflow
// runs both, then opens a PR if anything changed. Local use: `npm run spec:vendor`.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(readFileSync(path.join(root, 'spec', 'meta.json'), 'utf8'));
const url = meta.spec_url || 'https://crate.hosaka.fm/api/v2/openapi.json';

const res = await fetch(url);
if (!res.ok) {
  console.error(`vendor-spec: fetch ${url} → HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json();
// Structural sanity before we vendor it — a malformed / non-OpenAPI body must not silently
// overwrite the vendored spec (the human still reviews the PR, but fail loud + early here).
if (
  !spec ||
  typeof spec !== 'object' ||
  typeof spec.openapi !== 'string' ||
  typeof spec.info?.version !== 'string' ||
  !spec.paths ||
  Object.keys(spec.paths).length === 0
) {
  console.error('vendor-spec: fetched document is not a valid OpenAPI spec — refusing to vendor');
  process.exit(1);
}
writeFileSync(path.join(root, 'spec', 'openapi.json'), `${JSON.stringify(spec, null, 2)}\n`);
console.log(`vendor-spec: ${url} → spec/openapi.json (info.version ${spec.info.version})`);
