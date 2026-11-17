// Android turns every bundled image into a drawable named after its folder and file name, without
// the extension and with punctuation dropped: assets/loops/pinky-lock.gif and .png both become
// `assets_loops_pinkylock`, and the release build fails with "Duplicate resources". The web and
// the dev client do not mind, so only an EAS build would notice. This catches it in seconds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
const ROOT = join(__dirname, '..', '..');

function images(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return images(path);
    return IMAGE.has(extname(name).toLowerCase()) ? [path] : [];
  });
}

/** Scale suffixes (`@2x`) go to separate density folders, so only files at the same scale clash. */
const scale = (path: string) => /@(\d+(?:\.\d+)?)x\.[^.]+$/.exec(path)?.[1] ?? '1';

/** The drawable name Android gives an image: folders and file name joined by `_`, no extension. */
const drawable = (path: string) =>
  relative(ROOT, path).slice(0, -extname(path).length).replace(/@\d+(\.\d+)?x$/, '').toLowerCase()
    .split(/[\\/]/).map((part) => part.replace(/[^a-z0-9_]/g, '')).join('_');

test('no two images in assets/ become the same Android resource', () => {
  const groups = new Map<string, string[]>();
  for (const path of images(join(ROOT, 'assets'))) {
    const key = `${drawable(path)} (scale ${scale(path)})`;
    groups.set(key, [...(groups.get(key) ?? []), relative(ROOT, path)]);
  }
  const clashes = [...groups].filter(([, files]) => files.length > 1).map(([key, files]) => `${key}: ${files.join(', ')}`);
  assert.deepEqual(clashes, [], 'rename one of each pair (for example x.png to x-still.png)');
});
