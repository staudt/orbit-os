/** The fixed 16-color Orbit palette. Every pixel on screen is one of these. */
export const PALETTE_HEX = [
  '#1a0d1c', // 0  ink
  '#3d1636', // 1  dark plum
  '#5e1f48', // 2  plum
  '#8c2d5c', // 3  magenta
  '#c4304f', // 4  crimson
  '#e8572f', // 5  red-orange
  '#f58b27', // 6  orange
  '#fcc043', // 7  sunset yellow
  '#fde7a6', // 8  pale yellow
  '#fff5dd', // 9  cream
  '#e6d3b0', // 10 tan
  '#a8907a', // 11 warm grey
  '#6e5873', // 12 mauve grey
  '#47376b', // 13 mountain purple
  '#8473b3', // 14 lavender
  '#4f8a5b', // 15 foliage green
] as const;

export const C = {
  INK: 0,
  PLUM_DARK: 1,
  PLUM: 2,
  MAGENTA: 3,
  CRIMSON: 4,
  RED: 5,
  ORANGE: 6,
  YELLOW: 7,
  PALE: 8,
  CREAM: 9,
  TAN: 10,
  GREY: 11,
  MAUVE: 12,
  PURPLE: 13,
  LAVENDER: 14,
  GREEN: 15,
} as const;

export type Color = number;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PALETTE_RGB: [number, number, number][] = PALETTE_HEX.map(hexToRgb);

/** Palette as little-endian ABGR uint32 values, ready for a Uint32Array view over ImageData. */
export function paletteLUT(): Uint32Array {
  const lut = new Uint32Array(16);
  PALETTE_RGB.forEach(([r, g, b], i) => {
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  });
  return lut;
}

/** Nearest palette index for an RGB color (simple weighted distance). */
export function nearestColor(r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 16; i++) {
    const [pr, pg, pb] = PALETTE_RGB[i];
    const dr = r - pr, dg = g - pg, db = b - pb;
    const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * "Darker" mapping used for dithered shadows and inactive states:
 * each color maps to a darker neighbor in the same family.
 */
export const DARKER: number[] = [0, 0, 1, 2, 3, 4, 5, 6, 10, 10, 11, 12, 13, 1, 13, 13];
export const LIGHTER: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 10, 11, 14, 8, 10];

/** High-contrast partner of each color, used for Windows 3-style "inverted" drag frames. */
export const INVERT: number[] = [9, 8, 10, 7, 8, 9, 0, 1, 1, 0, 2, 0, 9, 8, 0, 9];
