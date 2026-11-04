// Touch-input check on an emulated phone. Usage: node scripts/touch.mjs <out-prefix>
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '/tmp/touch';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
const ev = (js) => page.evaluate(js);
const toCss = async (lx, ly) => ev(`(() => { const r = document.getElementById('screen').getBoundingClientRect(); const L = orbit.display.layout; return [r.left + (${lx} + 0.5) * r.width / L.w, r.top + (${ly} + 0.5) * r.height / L.h]; })()`);
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

// 1) single tap on the Clock desktop icon opens it
const clock = await ev(`(() => { const i = orbit.wm.desktop.icons.find(i => i.label === 'Clock'); return [i.x + 32, i.y + 16]; })()`);
let [x, y] = await toCss(...clock);
await touch('touchStart', x, y); await page.waitForTimeout(80); await touch('touchEnd', x, y);
await page.waitForTimeout(600);
console.log('1 tap icon ->', await ev('orbit.wm.windows.map(w => w.title)'));
await ev('orbit.wm.close(orbit.wm.active, true)');
await page.waitForTimeout(300);

// 2) launcher is full-screen on a phone
await ev("orbit.launch('launcher')");
await page.waitForTimeout(500);
console.log('2 launcher frame', await ev('(() => { const w = orbit.wm.windows.find(w => w.popup); const D = orbit.wm.deskRect(); return [w.x, w.y, w.w, w.h, "desk", D.w, D.h]; })()'));
await page.screenshot({ path: `${out}-launcher.png` });
await ev('orbit.wm.closePopups()');
await page.waitForTimeout(300);

// 3) long-press the desktop background, slide onto "Clean Up Icons", lift
[x, y] = await toCss(300, 300);
await touch('touchStart', x, y);
await page.waitForTimeout(800);
const item = await ev(`(() => { const L = orbit.wm.menus; return L.isOpen; })()`);
console.log('3 menu open after long press:', item);
await page.screenshot({ path: `${out}-menu.png` });
// slide onto the first item ("New Folder"), ~8 logical px below the finger
const [, ty] = await toCss(300, 300 + 8);
for (let k = 1; k <= 4; k++) await touch('touchMove', x + 10, y + ((ty - y) * k) / 4);
await page.waitForTimeout(150);
await touch('touchEnd', x, y);
await page.waitForTimeout(400);
console.log('3 menu after release:', await ev('orbit.wm.menus.isOpen'), await ev('orbit.wm.windows.map(w => w.title)'));
await ev('orbit.wm.windows.forEach(w => orbit.wm.close(w, true))');
await page.waitForTimeout(300);

// 4) tap a folder in Files opens it
await ev("orbit.launch('files')");
await page.waitForTimeout(600);
const row = await ev(`(() => { const w = orbit.wm.active; const L = w.body.children.find(c => c.constructor.name === 'ListView'); const [rx, ry] = L.rootPos(); return [w.x + 1 + rx + 40, w.y + 16 + ry + 13 + 8]; })()`);
[x, y] = await toCss(...row);
await touch('touchStart', x, y); await page.waitForTimeout(80); await touch('touchEnd', x, y);
await page.waitForTimeout(400);
console.log('4 files after tap:', await ev('orbit.wm.active.title'));
await page.screenshot({ path: `${out}-files.png` });
await browser.close();
