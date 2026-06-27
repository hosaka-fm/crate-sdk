// Generate the human/agent doc surfaces from meta/surface.json (itself extracted from
// the SDK's TSDoc). Outputs:
//   - explorer/index.html  (the interactive explorer; data injected into the template)
//   - README.md            (the "Client surface" table, between GENERATED markers)
// Run via `npm run docs:gen` (after extract-surface.mjs). A CI drift check (`docs:check`)
// fails the build if these outputs fall out of sync with the source TSDoc.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const surface = JSON.parse(readFileSync(new URL('meta/surface.json', root), 'utf8'));

// --- explorer/index.html ---
const METHODS = surface.map((m) => ({
  ns: m.ns,
  call: m.call,
  fn: m.fn,
  http: m.http,
  ep: m.ep,
  auth: m.auth,
  ret: m.ret,
  retry: m.retry,
  idem: m.idem,
  sig: m.sig,
  desc: m.desc,
  ex: m.example,
  throws: m.throws,
}));
const EDU = Object.fromEntries(surface.map((m) => [m.call, { eli5: m.desc, worked: m.example }]));
// Escape '<' so no string can smuggle "</script>" out of the inline data block.
const enc = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const tpl = readFileSync(new URL('explorer/template.html', root), 'utf8');
const html = tpl.replace('__METHODS__', () => enc(METHODS)).replace('__EDU__', () => enc(EDU));
if (html.includes('__METHODS__') || html.includes('__EDU__')) {
  console.error('gen-docs: explorer template placeholders were not filled');
  process.exit(1);
}
writeFileSync(new URL('explorer/index.html', root), html);

// --- README "Client surface" table ---
const escCell = (s) => String(s).replace(/\|/g, '\\|');
const authCell = (a) => (a === 'key' ? '**key**' : a);
const rows = surface
  .map(
    (m) =>
      `| \`${escCell(m.call)}\` | \`${m.http} ${m.ep}\` | ${authCell(m.auth)} | \`${escCell(m.ret)}\` |`,
  )
  .join('\n');
const table = ['| Call | Endpoint | Auth | Returns |', '| --- | --- | --- | --- |', rows].join(
  '\n',
);

const B = '<!-- BEGIN GENERATED:surface (npm run docs:gen) -->';
const E = '<!-- END GENERATED:surface -->';
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = new RegExp(escRe(B) + '[\\s\\S]*?' + escRe(E));
const readmeUrl = new URL('README.md', root);
let readme = readFileSync(readmeUrl, 'utf8');
if (!re.test(readme)) {
  console.error(`gen-docs: README markers not found — expected:\n${B}\n${E}`);
  process.exit(1);
}
readme = readme.replace(re, `${B}\n\n${table}\n\n${E}`);
writeFileSync(readmeUrl, readme);

console.log(`gen-docs: explorer/index.html + README surface table (${surface.length} methods)`);
