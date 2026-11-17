/**
 * Makes an Expo web export safe to upload to Cloudflare Pages.
 *
 *   node scripts/prepare-web-dist.mjs dist/web
 *
 * Expo puts the fonts and images that come from packages under `assets/node_modules/...`, and
 * Cloudflare Pages never uploads a folder called `node_modules`. On the first deploy that dropped
 * every font and icon, so the site fell back to the browser's serif type and empty boxes. This
 * moves that folder to `assets/vendor/`, rewrites the references in the built files, then checks
 * that every `/assets/...` file the bundle names is really there.
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/prepare-web-dist.mjs <build folder>');
const TEXT = /\.(html|js|css|json|map|webmanifest)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const from = path.join(root, 'assets', 'node_modules');
const to = path.join(root, 'assets', 'vendor');
if (existsSync(from)) {
  if (existsSync(to)) throw new Error(`${to} already exists`);
  renameSync(from, to);
}

let rewritten = 0;
const named = new Set();
for (const file of walk(root)) {
  if (!TEXT.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  const next = text.replaceAll('/assets/node_modules/', '/assets/vendor/');
  if (next !== text) { writeFileSync(file, next); rewritten++; }
  for (const [, ref] of next.matchAll(/"(\/assets\/[^"?#]+)"/g)) named.add(ref);
}

const problems = [];
for (const file of walk(root)) if (file.split(path.sep).includes('node_modules')) problems.push(`still under node_modules: ${file}`);
for (const ref of named) {
  // Images are named once with @2x/@3x variants beside them; the plain name is enough.
  if (!existsSync(path.join(root, decodeURIComponent(ref)))) problems.push(`named in the bundle but missing: ${ref}`);
}
if (problems.length) {
  console.error(`Not publishing: ${problems.length} problem(s) in ${root}`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`ok  ${rewritten} file(s) rewritten, ${named.size} asset reference(s) all present in ${root}`);
