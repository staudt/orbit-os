import { Gfx, PATTERNS } from '../core/gfx';
import { C, DARKER } from '../core/palette';

/** Semantic colors used across the UI. */
export const TH = {
  desk: C.PURPLE,
  winBg: C.CREAM,
  face: C.CREAM,
  faceDown: C.TAN,
  shadowIn: C.TAN,
  border: C.INK,
  text: C.INK,
  textDim: C.GREY,
  title: C.PLUM,
  titleInactive: C.MAUVE,
  titleText: C.CREAM,
  sel: C.ORANGE,
  selText: C.INK,
  selDim: C.TAN,
  field: C.CREAM,
  accent: C.CRIMSON,
  link: C.MAGENTA,
  menuBg: C.CREAM,
  bar: C.PLUM_DARK,
  barText: C.CREAM,
} as const;

/** Rectangle outline with the four corner pixels cut (soft 90s corners). */
export function softRect(g: Gfx, x: number, y: number, w: number, h: number, c: number) {
  g.hline(x + 1, x + w - 2, y, c);
  g.hline(x + 1, x + w - 2, y + h - 1, c);
  g.vline(x, y + 1, y + h - 2, c);
  g.vline(x + w - 1, y + 1, y + h - 2, c);
}

/** Filled soft box with outline. */
export function softBox(g: Gfx, x: number, y: number, w: number, h: number, fill: number, border: number = TH.border) {
  g.fillRect(x + 1, y + 1, w - 2, h - 2, fill);
  softRect(g, x, y, w, h, border);
}

/** Classic raised button face. */
export function buttonFace(g: Gfx, x: number, y: number, w: number, h: number, pressed: boolean, isDefault = false, enabled = true) {
  const face = pressed ? TH.faceDown : TH.face;
  g.fillRect(x + 1, y + 1, w - 2, h - 2, face);
  if (pressed) {
    g.hline(x + 1, x + w - 2, y + 1, C.GREY);
    g.vline(x + 1, y + 1, y + h - 2, C.GREY);
  } else {
    g.hline(x + 1, x + w - 2, y + h - 2, TH.shadowIn);
    g.vline(x + w - 2, y + 1, y + h - 2, TH.shadowIn);
  }
  softRect(g, x, y, w, h, enabled ? TH.border : C.GREY);
  if (isDefault && enabled) softRect(g, x - 1, y - 1, w + 2, h + 2, TH.border);
}

/** Sunken field (text boxes, lists). */
export function fieldFrame(g: Gfx, x: number, y: number, w: number, h: number, focused = false, bg: number = TH.field) {
  g.fillRect(x + 1, y + 1, w - 2, h - 2, bg);
  g.hline(x + 1, x + w - 2, y + 1, TH.shadowIn);
  g.vline(x + 1, y + 1, y + h - 2, TH.shadowIn);
  g.rect(x, y, w, h, focused ? C.PLUM : TH.border);
}

/** Dithered drop shadow: darkens whatever is beneath, using only palette colors. */
export function dropShadow(g: Gfx, x: number, y: number, w: number, h: number, d = 2) {
  g.remap(x + d, y + h, w, d, DARKER, PATTERNS.d50);
  g.remap(x + w, y + d, d, h - d, DARKER, PATTERNS.d50);
}

/** Horizontal sunset stripes (title bar decoration). */
export function sunsetStripes(g: Gfx, x: number, y: number, w: number, h: number) {
  if (w <= 0) return;
  const cols = [C.YELLOW, C.ORANGE, C.RED, C.CRIMSON];
  let cy = y;
  let i = 0;
  while (cy < y + h && i < cols.length) {
    g.hline(x, x + w - 1, cy, cols[i]);
    cy += 2;
    i++;
  }
}

export function separator(g: Gfx, x: number, y: number, w: number) {
  g.hline(x, x + w - 1, y, TH.shadowIn);
}

/** Blinking caret state shared by all text widgets. */
export const caret = {
  phase: 0,
  on(): boolean {
    return Math.floor((performance.now() - this.phase) / 530) % 2 === 0;
  },
  reset() {
    this.phase = performance.now();
  },
};
