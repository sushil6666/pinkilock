import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const [dist, out, tag, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { const h = p.endsWith('/') ? p + 'index.html' : p + '.html'; p = fs.existsSync(h) ? h : path.join(dist, 'index.html'); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const O = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const btn = (page, name) => page.getByRole('button', { name }).last();
async function tall(page, vp) {
  const h = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('div')].map((d) => d.scrollHeight - d.clientHeight)));
  await page.setViewportSize({ width: vp.width, height: Math.min(vp.height + h, 12000) }); await page.waitForTimeout(600);
}
const sizes = (process.env.SIZES ?? '390,1440').split(',');
for (const size of sizes) {
  const vp = { width: Number(size), height: size === '390' ? 844 : 900 };
  const ctx = await browser.newContext({ viewport: vp, locale: 'en-US', timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('page error', e.message));
  await page.goto(O);
  await btn(page, 'Start').click();
  await btn(page, 'Pick by hand').click();
  await page.getByLabel('First name').fill('Asha');
  await page.getByLabel('Age').fill('24');
  await page.getByLabel('Your area').fill('Bandra');
  await page.getByRole('button', { name: 'Bandra West', exact: true }).click();
  await btn(page, 'Next').click();
  for (const idea of ['Boba run', 'Chai and a walk', 'Momo stop']) await page.getByText(idea, { exact: false }).first().click();
  await btn(page, 'Next').click();
  await page.getByLabel('Instagram handle').fill('@asha_x1');
  await btn(page, 'Next').click();
  for (const label of [/^I am 18 or older/, /^I agree to the terms/, /^Pinkilock may use my dating preferences/]) await page.getByRole('button', { name: label }).click();
  const box = await btn(page, 'Hold to swear').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up();
  await page.getByLabel('Me', { exact: true }).waitFor();
  await page.waitForTimeout(1500);
  const shot = async (name) => { if (only && !only.split(',').includes(name)) return; await page.waitForTimeout(1500); await tall(page, vp); await page.screenshot({ path: `${out}/${size}-${name}-${tag}.png` }); await page.setViewportSize(vp); };
  const nav = async (href) => { await page.evaluate((h) => { window.history.pushState({}, '', h); window.dispatchEvent(new PopStateEvent('popstate')); }, href); await page.waitForTimeout(1200); };
  // tabs
  await shot('discover');
  try { await page.getByRole('button', { name: /^Open .*profile|card/ }).first().click(); await shot('profile'); await page.goBack(); } catch (e) { console.log('profile', e.message.split('\n')[0]); }
  await page.getByRole('tab', { name: /^Asks/ }).or(page.getByRole('link', { name: /^Asks/ })).first().click(); await shot('asks');
  try { await page.locator('[role=button]').filter({ hasText: /./ }).nth(0); } catch {}
  await page.getByRole('tab', { name: /^Plans/ }).or(page.getByRole('link', { name: /^Plans/ })).first().click(); await shot('plans');
  await page.getByLabel('Me', { exact: true }).click(); await shot('me');
  for (const r of ['pink-gold', 'wallet', 'talk', 'talk/ai', 'talk/listeners', 'spicy', 'self-love', 'self-love/bounce-back', 'friends', 'couple', 'safety', 'account/requests', 'account/blocked']) {
    if (only && !only.split(',').includes(r.replace('/', '-'))) continue;
    await nav('/' + r); await shot(r.replace('/', '-'));
  }
  await ctx.close();
}
await browser.close(); server.close();
