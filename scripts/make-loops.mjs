/**
 * Draws the clay loops the app shows (assets/loops/*.gif) and a still of each for reduced motion
 * (assets/loops/*.png).
 *
 *   node scripts/make-loops.mjs            (needs the playwright and three dev dependencies, and ffmpeg)
 *
 * The scenes are in scripts/loops/scene.js. They are rendered in Chromium with three.js, one frame
 * at a time, at twice the output size, then scaled down and turned into a GIF by ffmpeg. Colours are
 * read from src/theme/tokens.ts, so a palette change is one rerun. The GIFs are committed, so nobody
 * needs to run this to build.
 *
 * The background is drawn in the page's blue and then keyed out, so the GIF's own colour table can
 * never shift it: the page shows through, and the soft edges were already drawn against that blue.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream, existsSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'loops');

// The colours, straight from the tokens file (it cannot be imported here: it pulls in Reanimated).
const tokens = Object.fromEntries(
  [...readFileSync(path.join(ROOT, 'src/theme/tokens.ts'), 'utf8').matchAll(/^\s+(\w+): '(#[0-9A-Fa-f]{6})',/gm)].map((m) => [m[1], m[2]]),
);
for (const k of ['bg', 'pink', 'pinkDeep', 'text', 'textDim', 'textMute', 'onPink']) if (!tokens[k]) throw new Error(`token ${k} not found in tokens.ts`);

/** name: file name. scene: export in scene.js. w, h: output size. frames, fps. still: the moment kept for reduced motion. */
const LOOPS = [
  { name: 'pinky-lock', scene: 'pinkyLoop', w: 440, h: 330, frames: 54, fps: 16, still: 0.66 },
  { name: 'padlock', scene: 'padlockLoop', w: 320, h: 280, frames: 48, fps: 18, still: 0.66 },
];
const only = process.argv[2];

const FILES = {
  '/scene.js': path.join(ROOT, 'scripts/loops/scene.js'),
  '/three.module.js': path.join(ROOT, 'node_modules/three/build/three.module.js'),
  '/three.core.js': path.join(ROOT, 'node_modules/three/build/three.core.js'),
};
const page = (w, h, scene) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:${tokens.bg}}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three.module.js","three/addons/":"/addons/"}}</script></head><body>
<script>window.TOKENS=${JSON.stringify(tokens)};</script>
<script type="module">import { ${scene} } from '/scene.js'; window.draw = ${scene}(${w}, ${h}); window.ready = true;</script>
</body></html>`;

let current = '';
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(current); return; }
  const file = url.startsWith('/addons/') ? path.join(ROOT, 'node_modules/three/examples/jsm', url.slice(8)) : FILES[url];
  if (!file || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/javascript' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const loop of LOOPS) {
  if (only && only !== loop.name) continue;
  const W = loop.w * 2, H = loop.h * 2;
  current = page(W, H, loop.scene);
  const tab = await browser.newPage({ viewport: { width: W, height: H } });
  tab.on('pageerror', (e) => console.error('page error', e.message));
  await tab.goto(origin + '/');
  await tab.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  const tmp = mkdtempSync(path.join(os.tmpdir(), `loop-${loop.name}-`));
  const grab = async (p, file) => {
    const data = await tab.evaluate((t) => { window.draw(t); return document.querySelector('canvas').toDataURL('image/png'); }, p);
    writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  };
  for (let i = 0; i < loop.frames; i++) await grab(i / loop.frames, path.join(tmp, `f${String(i).padStart(3, '0')}.png`));
  await grab(loop.still, path.join(tmp, 'still.png'));
  await tab.close();

  const gif = path.join(OUT, `${loop.name}.gif`);
  const png = path.join(OUT, `${loop.name}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(loop.fps), '-i', path.join(tmp, 'f%03d.png'),
    '-vf', `scale=${loop.w}:${loop.h}:flags=lanczos,colorkey=${tokens.bg.replace('#', '0x')}:0.02:0,split[a][b];[a]palettegen=max_colors=64:stats_mode=full:reserve_transparent=1[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle:alpha_threshold=128`,
    '-loop', '0', gif]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(tmp, 'still.png'), '-vf', `scale=${loop.w}:${loop.h}:flags=lanczos`, png]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`${loop.name}: ${Math.round(statSync(gif).size / 1024)} KB gif, ${Math.round(statSync(png).size / 1024)} KB still`);
}
await browser.close();
server.close();
