import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

const logs = [];
function rec(type, msg) { logs.push(`[${type}] ${msg}`); }

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('console', m => rec('console', `${m.type()}: ${m.text()}`));
page.on('pageerror', e => rec('pageerror', e.message));
page.on('request', r => { if (r.url().includes('/api/auth')) rec('request', `${r.method()} ${r.url()}`); });
page.on('response', r => { if (r.url().includes('/api/auth')) rec('response', `${r.status()} ${r.url()}`); });

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  rec('info', `Loaded /login, title=${await page.title()}`);

  // Đợi Google iframe xuất hiện
  const frame = page.frameLocator('iframe[title*="Google"]');
  const googleBtn = frame.locator('#container, div[role="button"]').first();
  await googleBtn.waitFor({ timeout: 10000 });
  rec('info', 'Google button iframe found');

  // Click Google button -> mở popup
  const popupPromise = ctx.waitForEvent('popup', { timeout: 8000 });
  await googleBtn.click();
  rec('info', 'Clicked Google button');

  try {
    const popup = await popupPromise;
    rec('info', `Popup opened: ${popup.url().slice(0, 80)}`);
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    rec('info', `Popup final URL: ${popup.url().slice(0, 80)}`);
    // Đóng popup (không thể tự login tài khoản thật)
    await popup.close().catch(() => {});
    rec('info', 'Popup closed (manual login required)');
  } catch (e) {
    rec('warn', `No popup (có thể One Tap hiển thị inline): ${e.message}`);
  }

  // Check localStorage sau thử (sẽ rỗng vì chưa login được)
  const token = await page.evaluate(() => localStorage.getItem('token'));
  rec('info', `localStorage.token after attempt: ${token ? 'SET' : 'null'}`);

} catch (e) {
  rec('ERROR', e.message);
} finally {
  console.log('\n===== PLAYWRIGHT LOG =====');
  console.log(logs.join('\n'));
  console.log('===== END =====');
  await browser.close();
}
