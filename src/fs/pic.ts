import { Surface, BAYER4 } from '../core/gfx';
import { PALETTE_RGB, nearestColor } from '../core/palette';

/**
 * .PIC — Orbit picture format.
 * "OPIC" magic, version byte, width u16le, height u16le, then (count, color) byte pairs (RLE).
 */
export function encodePic(s: Surface): Uint8Array {
  const out: number[] = [0x4f, 0x50, 0x49, 0x43, 1, s.w & 255, s.w >> 8, s.h & 255, s.h >> 8];
  const px = s.px;
  for (let i = 0; i < px.length;) {
    const v = px[i] & 15;
    let n = 1;
    while (n < 255 && i + n < px.length && (px[i + n] & 15) === v) n++;
    out.push(n, v);
    i += n;
  }
  return new Uint8Array(out);
}

export function decodePic(b: Uint8Array): Surface {
  if (b.length < 9 || b[0] !== 0x4f || b[1] !== 0x50 || b[2] !== 0x49 || b[3] !== 0x43) throw new Error('Not an Orbit picture');
  const w = b[5] | (b[6] << 8), h = b[7] | (b[8] << 8);
  if (!w || !h || w > 4096 || h > 4096) throw new Error('Bad picture size');
  const s = new Surface(w, h);
  let o = 0;
  for (let i = 9; i + 1 < b.length && o < s.px.length; i += 2) {
    const n = b[i], v = b[i + 1] & 15;
    s.px.fill(v, o, Math.min(s.px.length, o + n));
    o += n;
  }
  return s;
}

export function isPic(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x4f && b[1] === 0x50 && b[2] === 0x49 && b[3] === 0x43;
}

/** Reduce RGBA pixels to the 16-color palette, optionally with ordered (Bayer) dithering. */
export function quantize(rgba: Uint8ClampedArray, w: number, h: number, dither: boolean, bg = 9): Surface {
  const s = new Surface(w, h);
  const cache = new Map<number, number>();
  const near = (r: number, g: number, b: number) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let v = cache.get(key);
    if (v === undefined) { v = nearestColor(r, g, b); cache.set(key, v); }
    return v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 128) { s.px[y * w + x] = bg; continue; }
      let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (dither) {
        const t = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 48;
        r = Math.max(0, Math.min(255, r + t));
        g = Math.max(0, Math.min(255, g + t));
        b = Math.max(0, Math.min(255, b + t));
      }
      s.px[y * w + x] = near(r, g, b);
    }
  }
  return s;
}

/** Render a surface to RGBA (for PNG export). */
export function toRGBA(s: Surface): Uint8ClampedArray {
  const out = new Uint8ClampedArray(s.w * s.h * 4);
  for (let i = 0; i < s.px.length; i++) {
    const [r, g, b] = PALETTE_RGB[s.px[i] & 15];
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Encode a surface as PNG bytes (browser only). */
export async function encodePng(s: Surface, scale = 1): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = s.w * scale;
  c.height = s.h * scale;
  const ctx = c.getContext('2d')!;
  const tmp = document.createElement('canvas');
  tmp.width = s.w;
  tmp.height = s.h;
  tmp.getContext('2d')!.putImageData(new ImageData(toRGBA(s) as unknown as Uint8ClampedArray<ArrayBuffer>, s.w, s.h), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decode any browser-supported image (PNG/JPG/GIF/BMP/WebP) into palette pixels, fitting within max size. */
export async function decodeImage(bytes: Uint8Array, dither: boolean, maxW = 640, maxH = 400): Promise<Surface> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  let w = bmp.width, h = bmp.height;
  const k = Math.min(1, maxW / w, maxH / h);
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = k < 1;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return quantize(ctx.getImageData(0, 0, w, h).data, w, h, dither);
}
