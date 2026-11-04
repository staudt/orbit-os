/**
 * Render loop. The scene is only redrawn when invalidated (or while an animation runs);
 * cursor movement alone only repaints the cursor rectangle.
 */
export type Animator = (now: number) => boolean; // return false when finished

export class Scheduler {
  private dirty = true;
  private cursorDirty = false;
  private animators = new Set<Animator>();
  private rafId = 0;
  private renderFn: () => void;
  private presentCursorFn: () => void;
  private tickers = new Set<(now: number) => void>();

  constructor(render: () => void, presentCursor: () => void) {
    this.renderFn = render;
    this.presentCursorFn = presentCursor;
  }

  invalidate() {
    this.dirty = true;
    this.kick();
  }
  cursorMoved() {
    this.cursorDirty = true;
    this.kick();
  }
  /** Run fn every frame until it returns false. Each frame also redraws the scene. */
  animate(fn: Animator) {
    this.animators.add(fn);
    this.kick();
  }
  get animating() {
    return this.animators.size > 0;
  }
  /** Called every frame while anything is scheduled (used by blinking carets etc. via onTick). */
  onTick(fn: (now: number) => void) {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  private kick() {
    if (!this.rafId) this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number) {
    this.rafId = 0;
    for (const t of this.tickers) t(now);
    if (this.animators.size) {
      for (const a of [...this.animators]) {
        let keep = false;
        try { keep = a(now); } catch (e) { console.error(e); }
        if (!keep) this.animators.delete(a);
      }
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.cursorDirty = false;
      this.renderFn();
    } else if (this.cursorDirty) {
      this.cursorDirty = false;
      this.presentCursorFn();
    }
    if (this.animators.size || this.dirty) this.kick();
  }
}

/** Easing helpers. */
export const ease = {
  linear: (t: number) => t,
  out: (t: number) => 1 - (1 - t) * (1 - t),
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};
