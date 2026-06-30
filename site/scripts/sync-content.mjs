// Generate the docs site's content from the SDK's single sources of truth — run as a prebuild
// (npm `prebuild`/`predev`). Outputs are git-ignored and regenerated every build; never hand-edit.
//   - Guides:        ../../docs/*.md      → src/content/docs/guides/<name>.md (add frontmatter, fix links)
//   - SDK reference:  ../../meta/surface.json → src/content/docs/sdk/<slug>.md (one page per method)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..'); // repo root
const DOCS = path.join(ROOT, 'docs');
const SURFACE = path.join(ROOT, 'meta', 'surface.json');
const OUT_GUIDES = path.join(here, '..', 'src', 'content', 'docs', 'guides');
const OUT_SDK = path.join(here, '..', 'src', 'content', 'docs', 'sdk');
const GH = 'https://github.com/hosaka-fm/crate-sdk';

const yaml = (s) => `"${String(s).replace(/"/g, "'").replace(/\s+/g, ' ').trim()}"`;
const firstSentence = (s) => {
  const m = String(s).match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : String(s)).trim();
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
  const descPara = (
    body.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith('#')) || ''
  ).replace(/\n/g, ' ');
  const description = plain(descPara).slice(0, 155);
  // Rewrite relative links to the site's routes / GitHub.
  body = body
    .replace(/\]\(\.\/([a-z0-9-]+)\.md(#[^)]*)?\)/g, (_m, n, a) => `](/guides/${n}/${a || ''})`)
    .replace(/\]\(\.\.\/examples\/([^)]+)\)/g, `](${GH}/blob/main/examples/$1)`)
    .replace(/\]\(\.\.\/README\.md([^)]*)\)/g, `](${GH}$1)`);
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

console.log(`sync-content: ${guideCount} guides + ${methods.length} SDK pages generated`);
