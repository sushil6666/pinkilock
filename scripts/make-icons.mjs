/**
 * Draws the placeholder app icon, Android adaptive icon, splash mark and notification icon.
 *
 *   node scripts/make-icons.mjs        (needs the playwright dev dependency and its Chromium)
 *
 * The mark is the app's own lock: two pinkies in their locked pose, the same geometry as
 * src/components/PinkyFinger.tsx, in the DESIGN_SYSTEM.md colours (pink and bone on royal blue,
 * hard edges, no gradients). These are placeholders until real artwork exists; the PNGs in
 * assets/ are committed, so nobody needs to run this to build.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const C = { bg: '#001C55', pink: '#FF2E93', pinkDeep: '#B3115F', text: '#F6F6F1', textDim: '#A9D8F7' };

// PinkyFinger.tsx, FINGER: stroke 36, curl 34, tip 46, offset 30. Drawn around (0, 0).
const S = 36, CURL = 34, TIP = 46, OFF = 30, REACH = 150;
function mark({ mono = false } = {}) {
  const theirs = mono ? '#FFFFFF' : C.pink;
  const mine = mono ? '#FFFFFF' : C.text;
  const stroke = `fill="none" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round"`;
  return `
    <path d="M ${-REACH} ${-OFF} H ${OFF - CURL} a ${CURL} ${CURL} 0 0 1 ${CURL} ${CURL} v ${TIP}" ${stroke} stroke="${theirs}"/>
    <path d="M ${REACH} ${OFF} H ${-OFF + CURL} a ${CURL} ${CURL} 0 0 1 ${-CURL} ${-CURL} v ${-TIP}" ${stroke} stroke="${mine}"/>
    <line x1="${OFF}" x2="${OFF}" y1="6" y2="${-OFF + CURL + TIP}" stroke="${theirs}" stroke-width="${S}" stroke-linecap="round"/>
    ${mono ? '' : `
    <line x1="${OFF}" x2="${OFF}" y1="30" y2="46" stroke="rgba(255,255,255,0.42)" stroke-width="16" stroke-linecap="round"/>
    <line x1="${-OFF}" x2="${-OFF}" y1="-30" y2="-46" stroke="rgba(255,46,147,0.38)" stroke-width="16" stroke-linecap="round"/>
    <line x1="-92" x2="-92" y1="${-OFF - 9}" y2="${-OFF + 9}" stroke="${C.pinkDeep}" stroke-width="3" stroke-linecap="round"/>
    <line x1="-104" x2="-104" y1="${-OFF - 9}" y2="${-OFF + 9}" stroke="${C.pinkDeep}" stroke-width="3" stroke-linecap="round"/>
    <line x1="92" x2="92" y1="${OFF - 9}" y2="${OFF + 9}" stroke="${C.textDim}" stroke-width="3" stroke-linecap="round"/>
    <line x1="104" x2="104" y1="${OFF - 9}" y2="${OFF + 9}" stroke="${C.textDim}" stroke-width="3" stroke-linecap="round"/>`}`;
}

/** size: canvas in px. scale: how big the mark is. bg: fill or null for transparent. */
const svg = ({ size, scale, bg, mono }) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
    <g transform="translate(${size / 2} ${size / 2}) scale(${scale})">${mark({ mono })}</g>
  </svg>`;

const FILES = [
  // iOS and the store listing: opaque, full bleed (the OS rounds the corners).
  { name: 'icon.png', size: 1024, scale: 2.5, bg: C.bg },
  // Android adaptive foreground: transparent, mark inside the central 66% safe zone.
  { name: 'adaptive-icon.png', size: 1024, scale: 1.75, bg: null },
  // Android 13 themed icon: one colour, the system tints it.
  { name: 'adaptive-icon-mono.png', size: 1024, scale: 1.75, bg: null, mono: true },
  // Splash: the mark alone; app.json puts it on royal blue.
  { name: 'splash-icon.png', size: 1024, scale: 2.6, bg: null },
  // Android status bar: white on transparent only (the OS draws the alpha channel).
  { name: 'notification-icon.png', size: 96, scale: 0.26, bg: null, mono: true },
  { name: 'favicon.png', size: 48, scale: 0.13, bg: C.bg },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const f of FILES) {
  const page = await browser.newPage({ viewport: { width: f.size, height: f.size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(f)}`);
  await page.screenshot({ path: path.join(OUT, f.name), omitBackground: !f.bg, clip: { x: 0, y: 0, width: f.size, height: f.size } });
  await page.close();
  console.log(`assets/${f.name}  ${f.size}x${f.size}`);
}
await browser.close();
