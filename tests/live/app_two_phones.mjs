/**
 * Two phones, one Supabase: the real screens (web build) in two separate browser sessions.
 *
 *   npm run test:app:local        builds the web app against `supabase start` and runs this
 *
 * tests/live/two_users.test.ts proves the backend; this proves that the screens on top of it
 * work when the other person is real: onboarding, Discover filling in when someone joins, the
 * ask, the lock gesture on both sides, check-in and the reveal; then Phase 3 through the screens:
 * B blocks A from A's profile, A loses B on reload, A downloads their data and deletes the account. The UI only offers start times
 * 45 minutes out or more, so the script moves the plan into its check-in window with E2E_DB_URL
 * (the one step no phone could do).
 *
 * It runs twice: first A on a phone-sized window and B on a desktop-sized one, then the other way
 * round, so every screen in the flow is used at both widths. On each screen it checks that nothing
 * scrolls sideways. APP_RUNS=1 runs only the first pass.
 *
 * Needs: WEB_DIR (an `expo export -p web` folder built with the Supabase keys), E2E_DB_URL, psql,
 * and playwright.
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB_DIR = process.env.WEB_DIR;
const DB = process.env.E2E_DB_URL;
if (!WEB_DIR || !DB) throw new Error('Set WEB_DIR and E2E_DB_URL (or use npm run test:app:local).');
const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const file = path.join(WEB_DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const hit = file.startsWith(WEB_DIR) && existsSync(file) && statSync(file).isFile() ? file : path.join(WEB_DIR, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(hit)] ?? 'application/octet-stream' });
  createReadStream(hit).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', q], { encoding: 'utf8' }).trim();
/** The two window sizes: a phone, and a laptop browser. */
const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const RUNS = [['phone', 'desktop'], ['desktop', 'phone']].slice(0, Number(process.env.APP_RUNS ?? 2));

let step = 0;
let pass = '';
const ok = (msg) => console.log(`ok  ${String(++step).padStart(2)}  ${pass}${msg}`);
const shot = async (who, name) => SHOTS && who.page.screenshot({ path: path.join(SHOTS, `${String(step).padStart(2, '0')}-${who.size}-${who.name}-${name}.png`) });
/** Nothing on the screen may push the page wider than the window. */
async function fits(who, where) {
  const [doc, win] = await who.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (doc > win) throw new Error(`${where} scrolls sideways at ${who.size} width (${doc} > ${win})`);
}
const btn = (page, name) => page.getByRole('button', { name }).last();
const hold = async (page, name) => {
  const box = await btn(page, name).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1400);
  await page.mouse.up();
};

async function onboard(browser, who) {
  const ctx = await browser.newContext({ viewport: SIZES[who.size], hasTouch: false, timezoneId: who.zone, locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${who.name}] page error: ${e.message}`));
  who.page = page;
  await page.goto(ORIGIN);
  await btn(page, 'Start').waitFor();
  await fits(who, 'the first screen');
  await btn(page, 'Start').click();
  // No location permission in this browser: the picker asks at once, is told no, and says so in a
  // popup (D090). Pick by hand closes it.
  await btn(page, 'Pick by hand').click();
  await page.getByLabel('First name').fill(who.name);
  await page.getByLabel('Age').fill('24');
  // The area is picked from the city's list (WP1): search, then pick.
  await page.getByLabel('Your area').fill('Bandra');
  await page.getByRole('button', { name: 'Bandra West', exact: true }).click();
  await btn(page, 'Next').click();
  for (const idea of ['Boba run', 'Chai and a walk', 'Momo stop']) await page.getByText(idea, { exact: false }).first().click();
  await btn(page, 'Next').click();
  await page.getByLabel('Instagram handle').fill(who.handle);
  await btn(page, 'Next').click();
  // The three agreements before swearing (WP8).
  for (const label of [/^I am 18 or older/, /^I agree to the terms/, /^Pinkilock may use my dating preferences/]) await page.getByRole('button', { name: label }).click();
  await hold(page, 'Hold to swear');
  await page.getByLabel('Me', { exact: true }).waitFor();
}

/** Drag the pinky across, the way a thumb would. */
async function slidePinky(page) {
  const stage = page.getByLabel('Slide your pinky in to lock this plan');
  await stage.waitFor();
  const box = await stage.boundingBox();
  const y = box.y + box.height / 2;
  // My pinky waits at the right edge and locks at the centre.
  await page.mouse.move(box.x + box.width - 40, y);
  await page.mouse.down();
  for (let x = box.x + box.width - 40; x >= box.x + 40; x -= 10) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
}

const browser = await chromium.launch();
let failed = false;
for (const [aSize, bSize] of RUNS) {
  pass = `[A ${aSize}, B ${bSize}]  `;
  const stamp = Date.now().toString(36).slice(-4);
  // Names are one word of letters (the server refuses anything else), so the stamp is spelled in letters.
  const letters = [...stamp].map((c) => 'abcdefghijklmnopqrstuvwxyzabcdefghij'[parseInt(c, 36)]).join('');
  // A's phone is on Mumbai time; B's is on London time, though B lives in Mumbai too (WP9).
  const A = { name: `Asha${letters}`, handle: `@asha_${stamp}`, size: aSize, zone: 'Asia/Kolkata' };
  const B = { name: `Bela${letters}`, handle: `@bela_${stamp}`, size: bSize, zone: 'Europe/London' };
  try {
    await flow(A, B);
  } catch (e) {
    failed = true;
    console.error(`FAILED after step ${step} (${pass.trim()}): ${e.message}`);
    for (const who of [A, B]) if (who.page) await shot(who, 'failure');
  } finally {
    for (const who of [A, B]) if (who.page) await who.page.context().close();
    sql(`delete from public.events where actor_id in (select id from public.profiles where name in ('${A.name}', '${B.name}')); delete from auth.users where is_anonymous and id in (select id from public.profiles where name in ('${A.name}', '${B.name}')); delete from public.blocks where blocker_id in (select id from public.profiles where name in ('${A.name}', '${B.name}'))`);
  }
  if (failed) break;
}
await browser.close();
server.close();
console.log(failed ? '\nAPP FLOW FAILED' : '\nAPP FLOW PASSED');
process.exit(failed ? 1 : 0);

async function flow(A, B) {
  await onboard(browser, A);
  ok(`${A.name} onboarded on the live backend`);
  await onboard(browser, B);
  ok(`${B.name} onboarded in a separate session`);

  // A was already open when B joined: B has to appear without a reload.
  const ids = sql(`select string_agg(id::text, ',' order by name) from public.profiles where name in ('${A.name}', '${B.name}')`).split(',');
  const [aId, bId] = ids;
  // No reload: A's Discover asks the server again when it is opened (and every minute). Switching
  // tabs and back is opening it.
  await A.page.getByLabel('Asks', { exact: false }).first().click();
  await A.page.getByLabel('Discover', { exact: false }).first().click();
  await A.page.getByText(`${B.name}, 24`).waitFor({ timeout: 15000 });
  ok('B appeared in A\'s Discover when A opened it again, with no reload');
  await shot(A, 'discover');
  await fits(A, 'Discover');
  await btn(A.page, 'Vibe check').click();
  await A.page.getByText('To what').waitFor();
  // First time slot offered.
  await A.page.getByRole('button', { name: /^\d{1,2}:\d{2}/ }).first().click();
  // Where: both live in Bandra, so the nearest suggested venues come first. Pick one.
  await A.page.getByRole('button', { name: /^Carter Road Promenade/ }).click();
  await shot(A, 'composer');
  await fits(A, 'the composer');
  await hold(A.page, `Hold to ask ${B.name}`);
  await A.page.getByText(`Waiting on ${B.name}.`).waitFor();
  ok('A sent the ask');
  sqlIs(`select place || ' / ' || venue_id from public.invites where from_id = '${aId}' and to_id = '${bId}'`, 'Carter Road Promenade, Bandra West / mum_carter_road', 'the ask carries the picked venue, written by the server');

  // B hears it live: the banner, with no reload.
  await btn(B.page, new RegExp(`${A.name} asked you`)).waitFor({ timeout: 15000 });
  await shot(B, 'banner');
  await btn(B.page, new RegExp(`${A.name} asked you`)).click();
  ok('B got the ask over Realtime (banner)');
  await btn(B.page, 'Lock it').click();
  await slidePinky(B.page);
  await B.page.getByText(/pinky is out|Waiting|seal/i).first().waitFor({ timeout: 10000 });
  await shot(B, 'half-locked');
  await fits(B, 'the lock');
  sqlIs(`select status from public.invites where from_id = '${aId}' and to_id = '${bId}'`, 'half_locked', "B's slide made it half_locked");

  await btn(A.page, 'Seal it').waitFor({ timeout: 15000 });
  ok("A's screen changed to Seal it without a reload");
  await btn(A.page, 'Seal it').click();
  await slidePinky(A.page);
  await btn(A.page, 'See the plan').waitFor({ timeout: 15000 });
  await shot(A, 'locked');
  sqlIs(`select status from public.invites where from_id = '${aId}' and to_id = '${bId}'`, 'locked', "A's slide locked it");
  await btn(B.page, 'See the plan').waitFor({ timeout: 15000 });
  ok('B watched the lock happen live');

  await btn(A.page, 'See the plan').click();
  await btn(B.page, 'See the plan').click();
  await A.page.getByLabel(/Contact locked/).waitFor();
  if (await A.page.getByText(B.handle).count()) throw new Error("B's handle is on A's screen before the promise is kept");
  ok('locked plan shows the contact as locked, and the handle is not on the page');
  // Time zones (WP9): the plan is at a place in Mumbai. A's clock is Mumbai's, so nothing extra; B's
  // phone is set to London, so B also sees the time in Mumbai, named, and it is the time A sees.
  if (await A.page.getByText(/ in Mumbai$/).count()) throw new Error('A, on Mumbai time, was shown a second clock');
  const mumbai = (await B.page.getByText(/ in Mumbai$/).first().textContent()) ?? '';
  const startsAt = Number(sql(`select extract(epoch from starts_at) * 1000 from public.invites where from_id = '${aId}' and to_id = '${bId}'`));
  const there = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(startsAt);
  if (!mumbai.startsWith(there)) throw new Error(`B's Mumbai time reads "${mumbai}", expected it to start with ${there}`);
  ok(`B, on London time, also sees the plan in Mumbai time: "${mumbai}"`);
  await fits(A, 'the plan');
  await fits(B, 'the plan');

  // The one thing a phone cannot do: jump to ten minutes before the start.
  sql(`update public.invites set starts_at = now() + interval '5 minutes' where from_id = '${aId}' and to_id = '${bId}'`);
  // Check-in swaps codes (WP4): each screen shows its own; each person types the other's.
  await btn(A.page, 'Check in').waitFor({ timeout: 15000 });
  await enterCode(A, B);
  await B.page.getByLabel(`${A.name}: checked in`).waitFor({ timeout: 15000 });
  ok("B saw A's check-in live");
  if (await B.page.getByText(A.handle).count()) throw new Error("A's handle is on B's screen after one check-in");
  await enterCode(B, A);
  await A.page.getByLabel(`Instagram: ${B.handle}`).waitFor({ timeout: 15000 });
  await B.page.getByLabel(`Instagram: ${A.handle}`).waitFor({ timeout: 15000 });
  await shot(A, 'reveal');
  await shot(B, 'reveal');
  ok('both checked in: kept, and each screen now shows the other handle');
  await fits(A, 'the reveal');

  // Phase 3: B blocks A from A's profile.
  await btn(B.page, `${A.name}'s profile`).click();
  await btn(B.page, 'Block or report').click();
  await btn(B.page, `Hold to block ${A.name}`).waitFor();
  await B.page.waitForTimeout(600); // the sheet slides up for 280 ms
  await shot(B, 'block-sheet');
  await hold(B.page, `Hold to block ${A.name}`);
  await B.page.getByLabel('Me', { exact: true }).waitFor();
  sqlIs(`select count(*) from public.blocks where blocker_id = '${bId}' and blocked_id = '${aId}'`, '1', 'B blocked A from the profile screen');
  // A is not told; a fresh start shows what RLS returns now.
  await A.page.goto(ORIGIN);
  await A.page.getByLabel('Me', { exact: true }).waitFor();
  await A.page.waitForTimeout(1500);
  if (await A.page.getByText(B.name).count()) throw new Error("B is still on A's screen after the block");
  await A.page.getByLabel('Plans', { exact: false }).first().click();
  await A.page.waitForTimeout(800);
  if (await A.page.getByText(B.name).count()) throw new Error("A still sees the plan with B after the block");
  ok('after the block, A sees neither B nor their plan');

  // A downloads their data, then deletes the account.
  await A.page.getByLabel('Me', { exact: true }).click();
  const [download] = await Promise.all([A.page.waitForEvent('download'), btn(A.page, 'Download my data').click()]);
  const exported = JSON.parse(await new Promise((resolve, reject) => {
    download.createReadStream().then((st) => { let t = ''; st.on('data', (c) => (t += c)); st.on('end', () => resolve(t)); st.on('error', reject); }, reject);
  }));
  if (exported.account?.id !== aId || exported.contact?.handle !== A.handle) throw new Error('the export is not A\'s data');
  if (JSON.stringify(exported).includes(B.handle)) throw new Error("the export contains B's handle");
  ok('A downloaded their data from Me');
  await fits(A, 'Me');
  await btn(A.page, 'Delete my account').click();
  await btn(A.page, 'Hold to delete everything').waitFor();
  await A.page.waitForTimeout(600);
  await shot(A, 'delete-sheet');
  await hold(A.page, 'Hold to delete everything');
  await btn(A.page, 'Start').waitFor({ timeout: 15000 });
  sqlIs(`select count(*) from public.profiles where id = '${aId}'`, '0', 'A deleted the account and is back at onboarding');
}

/** `who` types the code shown on `other`'s screen, as if read across the table, and checks in. */
async function enterCode(who, other) {
  const shownCode = other.page.getByLabel(/^Your check-in code: \d \d \d \d$/);
  await shownCode.waitFor({ timeout: 15000 });
  const code = (await shownCode.getAttribute('aria-label')).replace(/\D/g, '');
  await who.page.getByLabel(`${other.name}'s check-in code`).fill(code);
  await btn(who.page, 'Check in').click();
}

function sqlIs(q, want, msg) {
  const deadline = Date.now() + 10000;
  let got;
  do {
    got = sql(q);
    if (got === want) return ok(msg);
    execFileSync('sleep', ['0.3']);
  } while (Date.now() < deadline);
  throw new Error(`${msg}: wanted ${want}, got ${got}`);
}
