import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// ADX-5 gate: every PUBLIC method on the Crate class must carry JSDoc with an
// @example and a @throws tag (the .d.ts + hover docs are an agent's primary docs).
// Private (#) methods are PrivateIdentifier nodes and excluded automatically.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'client.ts');
const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

function publicMethods(): Array<{ name: string; tags: string[] }> {
  const out: Array<{ name: string; tags: string[] }> = [];
  sf.forEachChild((node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === 'Crate') {
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          const tags = ts.getJSDocTags(member).map((t) => t.tagName.text);
          out.push({ name: member.name.text, tags });
        }
      }
    }
  });
  return out;
}

describe('ADX-5: JSDoc coverage on public Crate methods', () => {
  const methods = publicMethods();

  it('discovers the public method surface', () => {
    expect(methods.map((m) => m.name).sort()).toEqual(
      [
        'artist',
        'artistBandcampRelease',
        'artistMaster',
        'artistOrNull',
        'artists',
        'breakouts',
        'facets',
        'index',
        'label',
        'resolve',
        'search',
      ].sort(),
    );
  });

  it.each(methods)('$name carries @example and @throws', ({ tags }) => {
    expect(tags).toContain('example');
    expect(tags).toContain('throws');
  });
});
