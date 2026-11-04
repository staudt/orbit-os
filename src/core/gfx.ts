/**
 * Indexed-color drawing. Every surface stores palette indices (0-15) in a Uint8Array,
 * so the 16-color limit is enforced by construction.
 */

export interface Rect { x: number; y: number; w: number; h: number }

export class Surface {
  w: number;
  h: number;
  px: Uint8Array;
  constructor(w: number, h: number, fill = 0) {
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    this.px = new Uint8Array(this.w * this.h);
    if (fill) this.px.fill(fill);
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.px[y * this.w + x];
  }
  clone(): Surface {
    const s = new Surface(this.w, this.h);
    s.px.set(this.px);
    return s;
  }
  /** Copy a sub-rectangle into a new surface. */
  crop(x: number, y: number, w: number, h: number): Surface {
    const s = new Surface(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const v = this.get(x + i, y + j);
        s.px[j * w + i] = v < 0 ? 0 : v;
      }
    }
    return s;
  }
}

/** 8x8 one-bit patterns, one byte per row, MSB = leftmost pixel. Aligned to absolute coords. */
export const PATTERNS = {
  solid: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  d75: [0xee, 0xbb, 0xee, 0xbb, 0xee, 0xbb, 0xee, 0xbb],
  d50: [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55],
  d25: [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22],
  d12: [0x80, 0x00, 0x08, 0x00, 0x80, 0x00, 0x08, 0x00],
  hlines: [0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00],
  vlines: [0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa],
  diag: [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01],
  diag2: [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
  grid: [0xff, 0x80, 0x80, 0x80, 0xff, 0x80, 0x80, 0x80],
  checker: [0xf0, 0xf0, 0xf0, 0xf0, 0x0f, 0x0f, 0x0f, 0x0f],
  bricks: [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08],
  dots: [0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00],
  weave: [0x88, 0x54, 0x22, 0x45, 0x88, 0x14, 0x22, 0x51],
  scales: [0x80, 0x80, 0x41, 0x3e, 0x08, 0x08, 0x14, 0xe3],
  zigzag: [0x81, 0x42, 0x24, 0x18, 0x81, 0x42, 0x24, 0x18],
} as const;
export type Pattern = readonly number[];
export type PatternName = keyof typeof PATTERNS;

export function patBit(p: Pattern, x: number, y: number): boolean {
  return ((p[y & 7] >> (7 - (x & 7))) & 1) === 1;
}

/** 4x4 Bayer matrix (values 0..15) for ordered dithering. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class Gfx {
  s: Surface;
  ox = 0;
  oy = 0;
  // clip in absolute surface coords, [x0,x1) x [y0,y1)
  cx0 = 0;
  cy0 = 0;
  cx1: number;
  cy1: number;
  private stack: number[][] = [];

  constructor(s: Surface) {
    this.s = s;
    this.cx1 = s.w;
    this.cy1 = s.h;
  }

  /** Save translate + clip, then translate and intersect the clip with (x,y,w,h) in local coords. */
  push(x: number, y: number, w: number, h: number, clip = true) {
    this.stack.push([this.ox, this.oy, this.cx0, this.cy0, this.cx1, this.cy1]);
    const ax = this.ox + x, ay = this.oy + y;
    if (clip) {
      this.cx0 = Math.max(this.cx0, ax);
      this.cy0 = Math.max(this.cy0, ay);
      this.cx1 = Math.min(this.cx1, ax + w);
      this.cy1 = Math.min(this.cy1, ay + h);
    }
    this.ox = ax;
    this.oy = ay;
  }
  pop() {
    const t = this.stack.pop();
    if (!t) return;
    [this.ox, this.oy, this.cx0, this.cy0, this.cx1, this.cy1] = t;
  }
  /** Intersect clip only (local coords), without translating. */
  clip(x: number, y: number, w: number, h: number) {
    this.push(x, y, w, h, true);
    this.ox -= x;
    this.oy -= y;
  }
  clipEmpty(): boolean {
    return this.cx0 >= this.cx1 || this.cy0 >= this.cy1;
  }

  pset(x: number, y: number, c: number) {
    x += this.ox; y += this.oy;
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return;
    this.s.px[y * this.s.w + x] = c;
  }
  get(x: number, y: number): number {
    return this.s.get(x + this.ox, y + this.oy);
  }

  hline(x0: number, x1: number, y: number, c: number) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    y += this.oy;
    if (y < this.cy0 || y >= this.cy1) return;
    let a = Math.max(x0 + this.ox, this.cx0);
    const b = Math.min(x1 + this.ox, this.cx1 - 1);
    if (a > b) return;
    const row = y * this.s.w;
    this.s.px.fill(c, row + a, row + b + 1);
    a = b; // noop for lint
  }
  vline(x: number, y0: number, y1: number, c: number) {
    if (y1 < y0) [y0, y1] = [y1, y0];
    x += this.ox;
    if (x < this.cx0 || x >= this.cx1) return;
    const a = Math.max(y0 + this.oy, this.cy0);
    const b = Math.min(y1 + this.oy, this.cy1 - 1);
    const w = this.s.w, px = this.s.px;
    for (let y = a; y <= b; y++) px[y * w + x] = c;
  }

  fillRect(x: number, y: number, w: number, h: number, c: number) {
    const x0 = Math.max(x + this.ox, this.cx0), x1 = Math.min(x + w + this.ox, this.cx1);
    const y0 = Math.max(y + this.oy, this.cy0), y1 = Math.min(y + h + this.oy, this.cy1);
    if (x0 >= x1 || y0 >= y1) return;
    const sw = this.s.w, px = this.s.px;
    for (let yy = y0; yy < y1; yy++) px.fill(c, yy * sw + x0, yy * sw + x1);
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    if (w <= 0 || h <= 0) return;
    this.hline(x, x + w - 1, y, c);
    this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c);
    this.vline(x + w - 1, y, y + h - 1, c);
  }

  /** Fill with an 8x8 pattern. bg < 0 leaves unset bits untouched. */
  fillPattern(x: number, y: number, w: number, h: number, p: Pattern, fg: number, bg = -1) {
    const x0 = Math.max(x + this.ox, this.cx0), x1 = Math.min(x + w + this.ox, this.cx1);
    const y0 = Math.max(y + this.oy, this.cy0), y1 = Math.min(y + h + this.oy, this.cy1);
    const sw = this.s.w, px = this.s.px;
    for (let yy = y0; yy < y1; yy++) {
      const bits = p[yy & 7];
      for (let xx = x0; xx < x1; xx++) {
        if ((bits >> (7 - (xx & 7))) & 1) px[yy * sw + xx] = fg;
        else if (bg >= 0) px[yy * sw + xx] = bg;
      }
    }
  }

  /** Remap colors in a region through `map`, only where the pattern bit is set. Used for dithered shadows. */
  remap(x: number, y: number, w: number, h: number, map: readonly number[], p: Pattern = PATTERNS.solid) {
    const x0 = Math.max(x + this.ox, this.cx0), x1 = Math.min(x + w + this.ox, this.cx1);
    const y0 = Math.max(y + this.oy, this.cy0), y1 = Math.min(y + h + this.oy, this.cy1);
    const sw = this.s.w, px = this.s.px;
    for (let yy = y0; yy < y1; yy++) {
      const bits = p[yy & 7];
      for (let xx = x0; xx < x1; xx++) {
        if ((bits >> (7 - (xx & 7))) & 1) {
          const i = yy * sw + xx;
          px[i] = map[px[i]];
        }
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    if (y0 === y1) return this.hline(x0, x1, y0, c);
    if (x0 === x1) return this.vline(x0, y0, y1, c);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.pset(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Visit every point of a Bresenham line (local coords). */
  static linePoints(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      fn(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Dashed rectangle outline ("marching ants"). Phase shifts the dash along the perimeter. */
  dashedRect(x: number, y: number, w: number, h: number, c1: number, c2: number, phase = 0, dash = 2) {
    if (w <= 0 || h <= 0) return;
    let i = phase;
    const put = (px: number, py: number) => {
      const on = Math.floor(i / dash) % 2 === 0;
      if (on) this.pset(px, py, c1);
      else if (c2 >= 0) this.pset(px, py, c2);
      i++;
    };
    for (let k = 0; k < w; k++) put(x + k, y);
    for (let k = 1; k < h; k++) put(x + w - 1, y + k);
    for (let k = w - 2; k >= 0; k--) put(x + k, y + h - 1);
    for (let k = h - 2; k > 0; k--) put(x, y + k);
  }

  /** Ellipse inscribed in the rect (x,y,w,h). */
  ellipse(x: number, y: number, w: number, h: number, c: number, fill = false) {
    if (w <= 0 || h <= 0) return;
    if (w <= 2 || h <= 2) { (fill ? this.fillRect : this.rect).call(this, x, y, w, h, c); return; }
    const rx = (w - 1) / 2, ry = (h - 1) / 2;
    const cx = x + rx, cy = y + ry;
    // For each row compute the horizontal half-width; draw spans or outline.
    const rows: [number, number][] = [];
    for (let j = 0; j < h; j++) {
      const yy = y + j;
      const dy = (yy - cy) / (ry + 0.5);
      const t = 1 - dy * dy;
      const half = t <= 0 ? 0 : (rx + 0.5) * Math.sqrt(t);
      const l = Math.round(cx - half + 0.0001);
      const r = Math.round(cx + half - 0.0001);
      rows.push([Math.max(x, Math.min(l, r)), Math.min(x + w - 1, Math.max(l, r))]);
    }
    for (let j = 0; j < h; j++) {
      const yy = y + j;
      const [l, r] = rows[j];
      if (fill || j === 0 || j === h - 1) { this.hline(l, r, yy, c); continue; }
      // Outline pixel = span endpoint, or a pixel not covered by the row above/below.
      const [ul, ur] = rows[j - 1];
      const [dl, dr] = rows[j + 1];
      const innerL = Math.max(ul, dl), innerR = Math.min(ur, dr);
      // left edge run
      const leftEnd = Math.max(l, innerL - 1);
      this.hline(l, Math.min(leftEnd, r), yy, c);
      const rightStart = Math.min(r, innerR + 1);
      this.hline(Math.max(rightStart, l), r, yy, c);
    }
  }

  /** Blit an indexed surface. `key` = transparent index (or -1 for none). `scale` = integer upscale. */
  blit(src: Surface, dx: number, dy: number, key = -1, scale = 1, sx = 0, sy = 0, sw = src.w, sh = src.h) {
    const s = scale | 0 || 1;
    const px = this.s.px, w = this.s.w;
    for (let j = 0; j < sh * s; j++) {
      const ty = dy + j + this.oy;
      if (ty < this.cy0 || ty >= this.cy1) continue;
      const srow = (sy + ((j / s) | 0)) * src.w + sx;
      for (let i = 0; i < sw * s; i++) {
        const tx = dx + i + this.ox;
        if (tx < this.cx0 || tx >= this.cx1) continue;
        const v = src.px[srow + ((i / s) | 0)];
        if (v === key) continue;
        px[ty * w + tx] = v;
      }
    }
  }

  /** Blit a 1-bit mask (rows of bytes as boolean array) in a single color. */
  mask(bits: Uint8Array, mw: number, mh: number, dx: number, dy: number, c: number, scale = 1) {
    for (let j = 0; j < mh; j++) {
      for (let i = 0; i < mw; i++) {
        if (!bits[j * mw + i]) continue;
        if (scale === 1) this.pset(dx + i, dy + j, c);
        else this.fillRect(dx + i * scale, dy + j * scale, scale, scale, c);
      }
    }
  }

  /** Scanline flood fill on the raw surface (respects clip). Fills with a pattern when given. */
  floodFill(x: number, y: number, c: number, pat: Pattern = PATTERNS.solid, bg = -1) {
    x += this.ox; y += this.oy;
    const { w, px } = this.s;
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return;
    const target = px[y * w + x];
    const solid = pat === PATTERNS.solid || bg === c;
    if (solid && target === c) return;
    const seen = new Uint8Array(px.length);
    const stack: number[] = [x, y];
    while (stack.length) {
      const yy = stack.pop()!, xx0 = stack.pop()!;
      let l = xx0;
      while (l - 1 >= this.cx0 && px[yy * w + l - 1] === target && !seen[yy * w + l - 1]) l--;
      let r = xx0;
      while (r + 1 < this.cx1 && px[yy * w + r + 1] === target && !seen[yy * w + r + 1]) r++;
      for (let i = l; i <= r; i++) seen[yy * w + i] = 1;
      for (const ny of [yy - 1, yy + 1]) {
        if (ny < this.cy0 || ny >= this.cy1) continue;
        let i = l;
        while (i <= r) {
          if (px[ny * w + i] === target && !seen[ny * w + i]) {
            stack.push(i, ny);
            while (i <= r && px[ny * w + i] === target && !seen[ny * w + i]) i++;
          } else i++;
        }
      }
    }
    for (let i = 0; i < px.length; i++) {
      if (!seen[i]) continue;
      const xx = i % w, yy = (i / w) | 0;
      if ((pat[yy & 7] >> (7 - (xx & 7))) & 1) px[i] = c;
      else if (bg >= 0) px[i] = bg;
    }
  }
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}
export function rectIntersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
