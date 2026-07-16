import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const rec = (t, m) => console.log(`[${t}] ${m}`);

const browser = await chromium.launch({ headless: false, args: ['--window-size=1280,900'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('console', m => rec('console', `${m.type()}: ${m.text()}`));
page.on('pageerror', e => rec('pageerror', e.message));
page.on('request', r => { if (r.url().includes('/api/auth')) rec('REQ', `${r.method()} ${r.url()}`); });
page.on('response', r => { if (r.url().includes('/api/auth')) rec('RES', `${r.status()} ${r.url()}`); });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
rec('info', `Opened /login — title: ${await page.title()}`);
rec('info', '>>> CLICK "Sign in with Google" button in this window <<<');

try {
  const popup = await ctx.waitForEvent('popup', { timeout: 600000 }); // 10 phút
  rec('info', `Google popup opened: ${popup.url().slice(0, 70)}`);
  await popup.waitForEvent('close', { timeout: 600000 }).catch(() => {});
  rec('info', 'Popup closed (login done or cancelled)');
} catch (e) {
  rec('warn', `popup wait: ${e.message}`);
}

await page.waitForTimeout(2000);
const token = await page.evaluate(() => localStorage.getItem('token'));
const url = page.url();
rec('RESULT', `URL=${url}`);
rec('RESULT', `localStorage.token=${token ? 'SET ✓ login thành công' : 'null ✗ chưa login'}`);

// KHÔNG auto-close — giữ browser mở đến khi user báo tắt
rec('info', 'Browser đang mở. Chờ bạn báo tắt...');
// Giữ process sống
setInterval(() => {}, 1000000);
