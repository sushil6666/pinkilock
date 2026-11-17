/**
 * Draws the placeholder app icon, Android adaptive icon, splash mark and notification icon.
 *
 *   node scripts/make-icons.mjs        (needs the playwright dev dependency and its Chromium)
 *
 * The mark is the app's own lock: two pinkies in their locked pose, the same geometry as
 * src/components/PinkyFinger.tsx, in the DESIGN_SYSTEM.md colours (pink and moonlight gold on the
 * night-sky indigo,
 * hard edges, no gradients). These are placeholders until real artwork exists; the PNGs in
 * assets/ are committed, so nobody needs to run this to build.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const C = { bg: '#241A63', pink: '#FF6FAE', pinkDeep: '#C2457E', gold: '#F5C95C', goldDeep: '#B8892A', text: '#FFF8E7', textDim: '#D3CBF5' };

// PinkyFinger.tsx, FINGER: stroke 36, curl 34, tip 46, offset 30. Drawn around (0, 0).
const S = 36, CURL = 34, TIP = 46, OFF = 30, REACH = 150;
function mark({ mono = false } = {}) {
  const theirs = mono ? '#FFFFFF' : C.pink;
  const mine = mono ? '#FFFFFF' : C.gold;
  const stroke = `fill="none" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round"`;
  return `
    <path d="M ${-REACH} ${-OFF} H ${OFF - CURL} a ${CURL} ${CURL} 0 0 1 ${CURL} ${CURL} v ${TIP}" ${stroke} stroke="${theirs}"/>
    <path d="M ${REACH} ${OFF} H ${-OFF + CURL} a ${CURL} ${CURL} 0 0 1 ${-CURL} ${-CURL} v ${-TIP}" ${stroke} stroke="${mine}"/>
    <line x1="${OFF}" x2="${OFF}" y1="6" y2="${-OFF + CURL + TIP}" stroke="${theirs}" stroke-width="${S}" stroke-linecap="round"/>
    ${mono ? '' : `
    <line x1="${OFF}" x2="${OFF}" y1="30" y2="46" stroke="rgba(255,255,255,0.42)" stroke-width="16" stroke-linecap="round"/>
    <line x1="${-OFF}" x2="${-OFF}" y1="-30" y2="-46" stroke="rgba(255,111,174,0.38)" stroke-width="16" stroke-linecap="round"/>
    <line x1="-92" x2="-92" y1="${-OFF - 9}" y2="${-OFF + 9}" stroke="${C.pinkDeep}" stroke-width="3" stroke-linecap="round"/>
    <line x1="-104" x2="-104" y1="${-OFF - 9}" y2="${-OFF + 9}" stroke="${C.pinkDeep}" stroke-width="3" stroke-linecap="round"/>
    <line x1="92" x2="92" y1="${OFF - 9}" y2="${OFF + 9}" stroke="${C.goldDeep}" stroke-width="3" stroke-linecap="round"/>
    <line x1="104" x2="104" y1="${OFF - 9}" y2="${OFF + 9}" stroke="${C.goldDeep}" stroke-width="3" stroke-linecap="round"/>`}`;
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
  // Splash: the mark alone; app.json puts it on the night-sky indigo.
  { name: 'splash-icon.png', size: 1024, scale: 2.6, bg: null },
  // Android status bar: white on transparent only (the OS draws the alpha channel).
  { name: 'notification-icon.png', size: 96, scale: 0.26, bg: null, mono: true },
  { name: 'favicon.png', size: 48, scale: 0.13, bg: C.bg },
];

// The website's own files (served as they are from public/): the home-screen icons the manifest
// names, Apple's touch icon, and the picture a shared link shows.
const WEB = path.join(OUT, '..', 'public');
const WEB_FILES = [
  { name: 'icon-192.png', size: 192, scale: 0.47, bg: C.bg },
  { name: 'icon-512.png', size: 512, scale: 1.25, bg: C.bg },
  { name: 'apple-touch-icon.png', size: 180, scale: 0.44, bg: C.bg },
];
const SHARE = { name: 'share.png', width: 1200, height: 630 };
const share = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${SHARE.width}" height="${SHARE.height}" viewBox="0 0 ${SHARE.width} ${SHARE.height}">
    <rect width="${SHARE.width}" height="${SHARE.height}" fill="${C.bg}"/>
    <g transform="translate(${SHARE.width / 2} 250) scale(1.5)">${mark()}</g>
    <text x="${SHARE.width / 2}" y="500" text-anchor="middle" fill="${C.text}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="76">pinkilock<tspan fill="${C.gold}">.</tspan></text>
    <text x="${SHARE.width / 2}" y="560" text-anchor="middle" fill="${C.textDim}" font-family="Arial, Helvetica, sans-serif" font-size="32">No ghosting. No endless swiping.</text>
  </svg>`;

mkdirSync(OUT, { recursive: true });
mkdirSync(WEB, { recursive: true });
const browser = await chromium.launch();
for (const f of FILES) {
  const page = await browser.newPage({ viewport: { width: f.size, height: f.size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(f)}`);
  await page.screenshot({ path: path.join(OUT, f.name), omitBackground: !f.bg, clip: { x: 0, y: 0, width: f.size, height: f.size } });
  await page.close();
  console.log(`assets/${f.name}  ${f.size}x${f.size}`);
}
for (const f of WEB_FILES) {
  const page = await browser.newPage({ viewport: { width: f.size, height: f.size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${svg(f)}`);
  await page.screenshot({ path: path.join(WEB, f.name), clip: { x: 0, y: 0, width: f.size, height: f.size } });
  await page.close();
  console.log(`public/${f.name}  ${f.size}x${f.size}`);
}
{
  const page = await browser.newPage({ viewport: { width: SHARE.width, height: SHARE.height }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${share}`);
  await page.screenshot({ path: path.join(WEB, SHARE.name), clip: { x: 0, y: 0, width: SHARE.width, height: SHARE.height } });
  await page.close();
  console.log(`public/${SHARE.name}  ${SHARE.width}x${SHARE.height}`);
}
await browser.close();
