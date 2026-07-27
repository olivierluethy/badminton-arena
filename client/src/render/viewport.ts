// Canvas sizing: letterbox the virtual 1200×675 world into the viewport,
// honouring devicePixelRatio, and expose the transform used each frame.

import { WORLD_HEIGHT, WORLD_WIDTH } from '@badminton/shared';

export interface Viewport {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** CSS pixels of the canvas element. */
  cssWidth: number;
  cssHeight: number;
  /** World→screen scale (uniform), in CSS px per world unit. */
  scale: number;
  /** Letterbox offset in CSS px to centre the world rect. */
  offsetX: number;
  offsetY: number;
  dpr: number;
}

export function createViewport(canvas: HTMLCanvasElement): Viewport {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas context unavailable');
  const vp: Viewport = {
    canvas,
    ctx,
    cssWidth: 0,
    cssHeight: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
  };
  resizeViewport(vp);
  return vp;
}

export function resizeViewport(vp: Viewport): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = vp.canvas.clientWidth || window.innerWidth;
  const cssH = vp.canvas.clientHeight || window.innerHeight;

  vp.dpr = dpr;
  vp.cssWidth = cssW;
  vp.cssHeight = cssH;

  // Backing store in device pixels.
  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (vp.canvas.width !== bw || vp.canvas.height !== bh) {
    vp.canvas.width = bw;
    vp.canvas.height = bh;
  }

  // Uniform scale that fits the whole world (letterbox, never crop).
  const scale = Math.min(cssW / WORLD_WIDTH, cssH / WORLD_HEIGHT);
  vp.scale = scale;
  vp.offsetX = (cssW - WORLD_WIDTH * scale) * 0.5;
  vp.offsetY = (cssH - WORLD_HEIGHT * scale) * 0.5;
}

/** Reset + apply the world transform. Call once at the start of each frame. */
export function beginWorldTransform(vp: Viewport): void {
  const { ctx, dpr, scale, offsetX, offsetY } = vp;
  // device-pixel space → CSS space → world space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
}
