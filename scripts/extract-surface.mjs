// Extract the client surface from the SDK's own TSDoc + CRATE_RESOURCES.
// Single source of truth: the doc-comments on src/client.ts (description + @example +
// @throws) merged with the runtime CRATE_RESOURCES map (method/endpoint/auth/…).
// Output: meta/surface.json — consumed by gen-docs.mjs to build the README table and
// the interactive explorer. Run after `npm run build` (needs dist for CRATE_RESOURCES).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import ts from 'typescript';
import { CRATE_RESOURCES } from '../dist/index.js';

const SRC = new URL('../src/client.ts', import.meta.url);
const code = readFileSync(SRC, 'utf8');
const sf = ts.createSourceFile('client.ts', code, ts.ScriptTarget.Latest, true);

const IFACE_ORDER = ['DossierApi', 'TastemakersApi', 'AuraApi', 'SearchEventsApi'];
const IFACE_NS = {
  DossierApi: 'dossier',
  TastemakersApi: 'tastemakers',
  AuraApi: 'aura',
  SearchEventsApi: 'searchEvents',
};
// method → CRATE_RESOURCES key, where the SDK method isn't a 1:1 resource.
const RES_FALLBACK = { artistOrNull: 'artist' };

function getJsDoc(node) {
  if (node.jsDoc && node.jsDoc.length) return node.jsDoc[node.jsDoc.length - 1];
  const all = ts.getJSDocCommentsAndTags(node) || [];
  const docs = all.filter((n) => n.kind === ts.SyntaxKind.JSDoc);
  return docs.length ? docs[docs.length - 1] : null;
}
const textOf = (c) => (ts.getTextOfJSDocComment(c) || '').trim();
const unfence = (s) =>
  s
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
// strip {@link Crate.foo} / {@link Type} → foo / Type for plain-text display
const delink = (s) => s.replace(/\{@link\s+([^}]+)\}/g, (_, x) => x.trim().replace(/^Crate\./, ''));
const collapse = (s) => delink(s.replace(/\s+/g, ' ').trim());

function parseThrow(tag) {
  const type = tag.typeExpression?.type ? tag.typeExpression.type.getText(sf) : '';
  const comment = textOf(tag.comment);
  const m = comment.match(/`([^`]+)`\s*([\s\S]*)/);
  if (m) return [m[1], collapse((m[2] || '').replace(/^[—-]\s*/, ''))];
  return [type || '', collapse(comment.replace(/^[—-]\s*/, ''))];
}

function docParts(node) {
  const jd = getJsDoc(node);
  if (!jd) return { desc: '', example: '', throws: [] };
  const desc = collapse(textOf(jd.comment));
  let example = '';
  const throws = [];
  for (const tag of jd.tags || []) {
    const name = tag.tagName.escapedText ?? tag.tagName.text;
    if (name === 'example' && !example) example = unfence(textOf(tag.comment));
    else if (name === 'throws') throws.push(parseThrow(tag));
  }
  return { desc, example, throws };
}

const paramNames = (node) =>
  node.parameters.map((p) => p.name.getText(sf)).filter((n) => n !== 'opts');
const sigText = (node, displayName) => {
  const params = node.parameters.map((p) => collapse(p.getText(sf))).join(', ');
  const ret = node.type ? collapse(node.type.getText(sf)) : 'void';
  return `${displayName}(${params}): ${ret}`;
};

// The method's OWN declared return type, Promise-unwrapped to match the resource style.
const declaredType = (node) => {
  if (!node.type) return '';
  const t = collapse(node.type.getText(sf));
  const m = t.match(/^Promise<([\s\S]+)>$/);
  return m ? m[1].trim() : t;
};

const methods = [];
const usedResKeys = new Set();
const missingResource = [];
function add({ ns, fn, node, isCall }) {
  const { desc, example, throws } = docParts(node);
  const pn = paramNames(node);
  const callPath = ns === 'client' ? `crate.${fn}` : isCall ? `crate.${ns}` : `crate.${ns}.${fn}`;
  const call = `${callPath}(${pn.join(', ')})`;
  const resKey = ns === 'client' ? fn : isCall ? ns : `${ns}.${fn}`;
  const usedKey = CRATE_RESOURCES[resKey]
    ? resKey
    : CRATE_RESOURCES[RES_FALLBACK[resKey]]
      ? RES_FALLBACK[resKey]
      : null;
  if (usedKey === null) {
    missingResource.push(call);
    return;
  }
  usedResKeys.add(usedKey);
  const r = CRATE_RESOURCES[usedKey];
  const ep = (r.endpoint || '').replace(/^\/api\/v1/, '') || '/api/v1';
  methods.push({
    ns,
    fn: isCall ? ns : fn,
    call,
    http: r.method,
    ep,
    auth: r.auth,
    // Declared type wins over the resource's (handles artistOrNull → "… | null",
    // bulkAll → "BulkIterable"); a fallback resource still supplies http/ep/auth/etc.
    ret: declaredType(node) || r.returns || 'void',
    retry: r.retryable,
    idem: r.idempotent,
    sig: sigText(node, isCall ? `crate.${ns}` : fn),
    desc,
    example,
    throws,
  });
}

for (const st of sf.statements) {
  if (ts.isClassDeclaration(st) && st.name?.text === 'Crate') {
    for (const m of st.members) {
      if (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name)) {
        add({ ns: 'client', fn: m.name.text, node: m, isCall: false });
      }
    }
  }
}
const ifaces = {};
for (const st of sf.statements) {
  if (ts.isInterfaceDeclaration(st) && IFACE_NS[st.name.text]) ifaces[st.name.text] = st;
}
for (const name of IFACE_ORDER) {
  const st = ifaces[name];
  if (!st) continue;
  const ns = IFACE_NS[name];
  for (const m of st.members) {
    if (ts.isCallSignatureDeclaration(m)) add({ ns, fn: null, node: m, isCall: true });
    else if (ts.isMethodSignature(m) && ts.isIdentifier(m.name))
      add({ ns, fn: m.name.text, node: m, isCall: false });
  }
}

// Bijection guards: every method maps to a resource, and every resource has a method.
if (missingResource.length) {
  console.error('No CRATE_RESOURCES entry for: ' + missingResource.join(', '));
  process.exit(1);
}
const uncovered = Object.keys(CRATE_RESOURCES).filter((k) => !usedResKeys.has(k));
if (uncovered.length) {
  console.error(
    'CRATE_RESOURCES keys with no documented method (add a method + TSDoc, or a RES_FALLBACK): ' +
      uncovered.join(', '),
  );
  process.exit(1);
}

const missing = methods.filter((m) => !m.desc || !m.example);
if (missing.length) {
  console.error('TSDoc gaps (every method needs a description + @example):');
  for (const m of missing)
    console.error(
      `  ${m.call} — ${!m.desc ? 'no description' : ''} ${!m.example ? 'no @example' : ''}`,
    );
  process.exit(1);
}

mkdirSync(new URL('../meta/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../meta/surface.json', import.meta.url),
  JSON.stringify(methods, null, 2) + '\n',
);
console.log(`extracted ${methods.length} methods → meta/surface.json`);
