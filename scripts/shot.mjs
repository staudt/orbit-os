// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [dpr] [actions-json]
import { chromium } from '@playwright/test';
const [url, out, w = '1280', h = '720', dpr = '1', actions = '[]'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForTimeout(1200);
for (const a of JSON.parse(actions)) {
  if (a.click) await page.mouse.click(a.click[0], a.click[1], { button: a.button ?? 'left', clickCount: a.count ?? 1 });
  if (a.move) await page.mouse.move(a.move[0], a.move[1], { steps: a.steps ?? 1 });
  if (a.down) await page.mouse.down();
  if (a.up) await page.mouse.up();
  if (a.key) await page.keyboard.press(a.key);
  if (a.type) await page.keyboard.type(a.type);
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.resize) await page.setViewportSize({ width: a.resize[0], height: a.resize[1] });
  if (a.eval) logs.push('eval: ' + JSON.stringify(await page.evaluate(a.eval)));
}
await page.waitForTimeout(400);
await page.screenshot({ path: out });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
