import { Surface } from './gfx';
import type { CursorImage } from './display';
import { ICONS16, ICONS32, CURSORS } from './icons-data';
import { PROCEDURAL_ICONS } from './proc-icons';

/** Index used for transparent pixels in sprite surfaces (never written to the screen). */
export const T = 255;

const cache = new Map<string, Surface>();

export function parseArt(rows: string[]): Surface {
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const s = new Surface(w, h, T);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const v = parseInt(ch, 16);
      if (!Number.isNaN(v)) s.px[y * w + x] = v;
    }
  }
  return s;
}

/** Get an icon surface by name. Falls back to the generic file icon. */
export function icon(name: string, size: 16 | 32 = 16): Surface {
  const key = `${size}:${name}`;
  let s = cache.get(key);
  if (s) return s;
  const proc = PROCEDURAL_ICONS[name];
  if (proc) {
    s = proc(size);
    cache.set(key, s);
    return s;
  }
  const set = size === 32 ? ICONS32 : ICONS16;
  let rows = set[name];
  if (!rows && size === 32 && ICONS16[name]) {
    // upscale a 16px icon when no 32px version exists
    const small = icon(name, 16);
    s = new Surface(32, 32, T);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) s.px[y * 32 + x] = small.px[(y >> 1) * 16 + (x >> 1)];
    cache.set(key, s);
    return s;
  }
  rows = rows ?? set['file'] ?? ICONS16['file'];
  s = parseArt(rows);
  cache.set(key, s);
  return s;
}

export function hasIcon(name: string, size: 16 | 32 = 16): boolean {
  return !!PROCEDURAL_ICONS[name] || !!(size === 32 ? ICONS32 : ICONS16)[name];
}

const cursorCache = new Map<string, CursorImage>();
export type CursorName =
  | 'arrow' | 'ibeam' | 'hand' | 'crosshair' | 'move'
  | 'resize-ns' | 'resize-ew' | 'resize-nwse' | 'resize-nesw' | 'busy';

export function cursorImage(name: CursorName): CursorImage {
  let c = cursorCache.get(name);
  if (c) return c;
  const def = CURSORS[name] ?? CURSORS['arrow'];
  const s = parseArt(def.rows);
  const px = new Int8Array(s.w * s.h);
  for (let i = 0; i < px.length; i++) px[i] = s.px[i] === T ? -1 : s.px[i];
  c = { w: s.w, h: s.h, hx: def.hot[0], hy: def.hot[1], px };
  cursorCache.set(name, c);
  return c;
}
