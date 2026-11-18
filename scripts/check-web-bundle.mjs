/**
 * Fails if a built web app carries anything secret. Only the public anon key may be in it.
 *
 *   node scripts/check-web-bundle.mjs dist/web
 *
 * Looks at every text file for: a JWT whose role is not `anon` (a service role key is one),
 * a Supabase secret key (sb_secret_...), and a private key block. Used by the web deploy before
 * anything is published, and handy after a local export.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/check-web-bundle.mjs <build folder>');
const TEXT = /\.(html|js|css|json|txt|map|webmanifest)$/;
const problems = [];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (TEXT.test(name)) yield p;
  }
}

for (const file of files(root)) {
  const text = readFileSync(file, 'utf8');
  for (const [jwt] of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    let role = 'unreadable';
    try { role = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).role ?? 'none'; } catch { /* reported below as unreadable */ }
    if (role !== 'anon') problems.push(`${file}: a token with role "${role}"`);
  }
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) problems.push(`${file}: a Supabase secret key`);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) problems.push(`${file}: a private key`);
}

if (problems.length) {
  console.error(`Not publishing: ${problems.length} secret-looking thing(s) in ${root}`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`ok  nothing secret in ${root}`);
