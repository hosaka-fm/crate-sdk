// Quick start — the minimal human happy path. Type-checked in CI so it can't rot.
// In real code, import from '@hosaka-fm/crate' instead of '../src/index'.
import { Crate } from '../src/index';

async function main(): Promise<void> {
  // crate is key-first: every data endpoint needs a key (only crate.index() is keyless).
  const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

  // A name, slug, 64-hex cluster_id, or discogs:/mbid: locator all work.
  const artist = await crate.artist('Four Tet');
  console.log(`${artist.display} (resolved via ${artist.resolved_via})`);

  // Resolve any link / name / id to a canonical identity.
  const id = await crate.resolve('https://fourtet.bandcamp.com');
  console.log('cluster_id:', id.cluster_id, '· bandcamp:', id.locators.bandcamp);
}

void main();
