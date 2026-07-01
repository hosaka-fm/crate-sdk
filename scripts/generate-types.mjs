#!/usr/bin/env node
// Regenerate the committed types from the VENDORED spec via the EXACT-pinned
// openapi-typescript binary (the same binary the drift test uses), plus refresh
// spec/meta.json with sha256(JCS(spec)) for the Tier-2 staleness check.
//
//   node scripts/generate-types.mjs              # writes src/generated/crate-api.d.ts + spec/meta.json
//   node scripts/generate-types.mjs --out PATH   # write types elsewhere (drift test uses a temp file)
//   node scripts/generate-types.mjs --no-meta    # types only (used by the byte-equality drift test)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from './jcs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = path.join(root, 'spec', 'openapi.json');
const argv = process.argv.slice(2);
const outFlag = argv.indexOf('--out');
const out =
  outFlag !== -1
    ? path.resolve(argv[outFlag + 1])
    : path.join(root, 'src', 'generated', 'crate-api.d.ts');
const writeMeta = !argv.includes('--no-meta') && outFlag === -1;

const bin = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'openapi-typescript.cmd' : 'openapi-typescript',
);

execFileSync(bin, [spec, '--output', out], { stdio: ['ignore', 'ignore', 'inherit'] });
// Present the CANONICAL brand in generated types. The vendored spec is byte-faithful to upstream,
// which still carries the legacy `crate.0xhoneyjar.xyz` host in server/contact/doc-link fields; our
// generated types show the live `crate.hosaka.fm`. Deterministic (drift byte-equality still holds)
// and a no-op once upstream drops 0xhoneyjar. Vendored spec/openapi.json is untouched.
const generated = readFileSync(out, 'utf8');
const debranded = generated.replace(/0xhoneyjar\.xyz/g, 'hosaka.fm');
if (debranded !== generated) writeFileSync(out, debranded);
process.stderr.write(`generated ${path.relative(root, out)}\n`);

if (writeMeta) {
  const doc = JSON.parse(readFileSync(spec, 'utf8'));
  const meta = {
    spec_url: 'https://crate.hosaka.fm/api/v2/openapi.json',
    openapi: doc.openapi,
    info_version: doc.info?.version,
    spec_sha256_jcs: createHash('sha256').update(canonicalize(doc)).digest('hex'),
    generated_with: 'openapi-typescript@7.13.0',
  };
  writeFileSync(path.join(root, 'spec', 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  process.stderr.write(
    `wrote spec/meta.json (sha256(JCS)=${meta.spec_sha256_jcs.slice(0, 12)}…)\n`,
  );
}
