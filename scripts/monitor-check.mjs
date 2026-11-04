// Check the chosen pixel size for a viewport on a given monitor.
// Usage: node scripts/monitor-check.mjs <vw> <vh> <screenW> <screenH> <dpr> [touch] [out.png]
import { chromium } from '@playwright/test';
const [vw, vh, sw, sh, dpr, touch, out] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +vw, height: +vh }, screen: { width: +sw, height: +sh }, deviceScaleFactor: +dpr, hasTouch: touch === 'touch', isMobile: touch === 'touch' });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(() => { const L = orbit.display.layout; return { scale: L.scale, w: L.w, h: L.h, bar: orbit.wm.taskbar.barRect().w }; })));
if (process.env.LAUNCH) { await p.evaluate((id) => orbit.launch(id), process.env.LAUNCH); await p.waitForTimeout(600); }
if (out) await p.screenshot({ path: out });
await b.close();
