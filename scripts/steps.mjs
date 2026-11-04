// Debug helper: launch an app and type commands one by one, with a timeout per step.
// Usage: node scripts/steps.mjs <appId> <out.png> "command 1" "command 2" ...
import { chromium } from '@playwright/test';

const [app, out, ...cmds] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1200);
const step = async (label, fn) => {
  const t = Date.now();
  const r = await Promise.race([fn().then(() => 'ok'), new Promise((res) => setTimeout(() => res('TIMEOUT'), 5000))]);
  console.log(label.padEnd(40), r, `${Date.now() - t}ms`);
  if (r === 'TIMEOUT') { await browser.close(); process.exit(1); }
};
await step(`launch ${app}`, () => page.evaluate((id) => { window.orbit.launch(id); }, app));
await page.waitForTimeout(400);
for (const cmd of cmds) {
  await step(`type ${cmd}`, async () => {
    if (cmd.startsWith('key:')) await page.keyboard.press(cmd.slice(4));
    else { await page.keyboard.type(cmd); await page.keyboard.press('Enter'); }
    await page.waitForTimeout(250);
    await page.evaluate(() => 1);
  });
}
await page.screenshot({ path: out });
await browser.close();
