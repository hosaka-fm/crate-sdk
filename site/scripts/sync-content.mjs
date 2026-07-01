// Generate the docs site's content from the SDK's single sources of truth — run as a prebuild
// (npm `prebuild`/`predev`). Outputs are git-ignored and regenerated every build; never hand-edit.
//   - Guides:        ../../docs/*.md      → src/content/docs/guides/<name>.md (add frontmatter, fix links)
//   - SDK reference:  ../../meta/surface.json → src/content/docs/sdk/<slug>.md (one page per method)
//   - Changelog:      ../../CHANGELOG.md    → src/content/docs/changelog.md
//   - Explorer:       ../../explorer/index.html → public/explorer/index.html (standalone, at /explorer/)
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..'); // repo root
const DOCS = path.join(ROOT, 'docs');
const SURFACE = path.join(ROOT, 'meta', 'surface.json');
const SITE = path.join(here, '..');
const OUT_GUIDES = path.join(SITE, 'src', 'content', 'docs', 'guides');
const OUT_SDK = path.join(SITE, 'src', 'content', 'docs', 'sdk');
const GH = 'https://github.com/hosaka-fm/crate-sdk';

// YAML double-quoted scalar: escape backslash FIRST, then the double-quote, then collapse
// whitespace. (A bare `\` or `"` in the value otherwise emits invalid frontmatter and hard-fails
// the Astro build.)
const yaml = (s) =>
  `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ').trim()}"`;
const firstSentence = (s) => {
  const m = String(s).match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : String(s)).trim();
};
// Truncate on a word boundary (never mid-word) and add an ellipsis only when actually cut.
const truncate = (s, n) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 40 ? cut.slice(0, sp) : cut).replace(/[\s.,;:]+$/, '')}…`;
};
const plain = (s) =>
  s
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>]/g, '')
    .trim();

// ---- Guides: docs/*.md → guides/<name>.md ----
mkdirSync(OUT_GUIDES, { recursive: true });
let guideCount = 0;
for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
  const name = file.replace(/\.md$/, '');
  let body = readFileSync(path.join(DOCS, file), 'utf8');
  const h1 = body.match(/^#\s+(.+)$/m);
  const title = h1 ? h1[1].trim() : name;
  if (h1) body = body.replace(/^#\s+.+$/m, '').replace(/^\s+/, ''); // drop H1 (Starlight renders the title)
  // First *prose* paragraph (starts with a letter or "(") — skips headings, tables (|),
  // lists (-,*,digits), quotes (>), code fences, and admonitions (:::).
  const descPara = (body.split(/\n\s*\n/).find((p) => /^[A-Za-z(]/.test(p.trim())) || '').replace(
    /\n/g,
    ' ',
  );
  const description = truncate(plain(descPara), 155);
  // Rewrite relative links to the site's routes / GitHub. Order matters: specific rules first,
  // then a catch-all for any remaining ../<path> (e.g. ../AGENTS.md, ../llms.txt) → GitHub blob.
  body = body
    .replace(/\]\(\.\/([a-z0-9-]+)\.md(#[^)]*)?\)/g, (_m, n, a) => `](/guides/${n}/${a || ''})`)
    .replace(/\]\(\.\.\/examples\/([^)]+)\)/g, `](${GH}/blob/main/examples/$1)`)
    .replace(/\]\(\.\.\/README\.md([^)]*)\)/g, `](${GH}$1)`)
    .replace(/\]\(\.\.\/([^)]+)\)/g, `](${GH}/blob/main/$1)`);
  const fm = `---\ntitle: ${yaml(title)}\n${description ? `description: ${yaml(description)}\n` : ''}---\n\n`;
  writeFileSync(path.join(OUT_GUIDES, `${name}.md`), fm + body);
  guideCount++;
}

// ---- SDK reference: surface.json → sdk/<slug>.md ----
mkdirSync(OUT_SDK, { recursive: true });
const surface = JSON.parse(readFileSync(SURFACE, 'utf8'));
const methods = Array.isArray(surface) ? surface : Object.values(surface);
const slugOf = (m) => (m.ns && m.ns !== 'client' ? `${m.ns}-${m.fn}` : m.fn).toLowerCase();
for (const m of methods) {
  const yn = (b) => (b ? 'yes' : 'no');
  const throwsList = (m.throws || []).map(([code, when]) => `- \`${code}\` — ${when}`).join('\n');
  const md =
    `---\ntitle: ${yaml(m.call || m.fn)}\ndescription: ${yaml(firstSentence(m.desc || m.call))}\n---\n\n` +
    '```ts\n' +
    `${m.sig}\n` +
    '```\n\n' +
    `${m.desc || ''}\n\n` +
    `| | |\n|---|---|\n` +
    `| Endpoint | \`${m.http} ${m.ep}\` |\n` +
    `| Auth | ${m.auth} |\n` +
    `| Returns | \`${m.ret}\` |\n` +
    `| Retryable | ${yn(m.retry)} |\n` +
    `| Idempotent | ${yn(m.idem)} |\n\n` +
    (m.example ? `## Example\n\n\`\`\`ts\n${m.example}\n\`\`\`\n\n` : '') +
    (throwsList ? `## Throws\n\n${throwsList}\n` : '');
  writeFileSync(path.join(OUT_SDK, `${slugOf(m)}.md`), md);
}

// ---- Spec copy for the docs API reference (starlight-openapi renders site/spec/openapi.json) ----
const specRaw = readFileSync(path.join(ROOT, 'spec', 'openapi.json'), 'utf8');
const SITE_SPEC = path.join(SITE, 'spec');
mkdirSync(SITE_SPEC, { recursive: true });
writeFileSync(path.join(SITE_SPEC, 'openapi.json'), specRaw);

// ---- Concepts: spec x-concepts → concepts/index.md ----
const OUT_CONCEPTS = path.join(SITE, 'src', 'content', 'docs', 'concepts');
mkdirSync(OUT_CONCEPTS, { recursive: true });
const spec = JSON.parse(readFileSync(path.join(ROOT, 'spec', 'openapi.json'), 'utf8'));
const concepts = spec['x-concepts'] || [];
const conceptsBody = concepts
  .map((c) => `## ${c.term}\n\n${c.eli5}\n${c.see ? `\n**See:** ${c.see}\n` : ''}`)
  .join('\n');
writeFileSync(
  path.join(OUT_CONCEPTS, 'index.md'),
  `---\ntitle: "Concepts"\ndescription: "crate's core terms — the cluster-first model — from the spec's x-concepts."\n---\n\n` +
    'crate is **cluster-first**: `cluster_id` is the prime key, the artist is the root, and ' +
    '`master` / `bandcamp` are dimensions of the artist dossier. These are the terms that recur ' +
    `across the API and SDK.\n\n${conceptsBody}`,
);

// ---- Changelog: CHANGELOG.md → changelog.md ----
let changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
  .replace(/^#\s+.+$/m, '')
  .replace(/^\s+/, '');
writeFileSync(
  path.join(SITE, 'src', 'content', 'docs', 'changelog.md'),
  `---\ntitle: "Changelog"\ndescription: "Release history for @hosaka-fm/crate."\n---\n\n${changelog}`,
);

// ---- Explorer: copy the standalone generated SPA → public/explorer/ (served at /explorer/) ----
let explorerCopied = false;
const explorerSrc = path.join(ROOT, 'explorer', 'index.html');
if (existsSync(explorerSrc)) {
  const dir = path.join(SITE, 'public', 'explorer');
  mkdirSync(dir, { recursive: true });
  copyFileSync(explorerSrc, path.join(dir, 'index.html'));
  explorerCopied = true;
}

console.log(
  `sync-content: ${guideCount} guides + ${methods.length} SDK pages + ${concepts.length} concepts + changelog${explorerCopied ? ' + explorer' : ''} generated`,
);
