// Shuttlecock, its motion trail, and the ground shadows that make depth (and
// the landing point) readable.

import { FLOOR_Y, SHUTTLE_RADIUS } from '@badminton/shared';
import { SHUTTLE, UI, rgba } from './palette.js';

/** Soft elliptical shadow projected onto the floor. */
export function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  objY: number,
  baseWidth: number,
  maxAlpha: number,
): void {
  const height = Math.max(0, FLOOR_Y - objY);
  // Higher object → larger, fainter shadow.
  const spread = 1 + height / 320;
  const alpha = maxAlpha * Math.max(0.12, 1 - height / 520);
  ctx.fillStyle = rgba(UI.shadowGround, alpha);
  ctx.beginPath();
  ctx.ellipse(x, FLOOR_Y + 2, (baseWidth * spread) / 2, 6 * spread, 0, 0, Math.PI * 2);
  ctx.fill();
}

export interface TrailPoint {
  x: number;
  y: number;
}

/** Fading motion trail behind the shuttle. */
export function drawShuttleTrail(ctx: CanvasRenderingContext2D, trail: TrailPoint[]): void {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    const a = trail[i - 1];
    const b = trail[i];
    ctx.strokeStyle = rgba(SHUTTLE.trail, t * 0.5);
    ctx.lineWidth = 1 + t * 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/** Draw the shuttle, cork-first along its velocity. */
export function drawShuttle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
): void {
  const speed = Math.hypot(vx, vy);
  // Orientation: cork leads, skirt trails. Fall back to upright when near rest.
  const ang = speed > 12 ? Math.atan2(vy, vx) : Math.PI / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);

  const r = SHUTTLE_RADIUS;
  // Feather skirt (a light cone trailing the cork, pointing -x locally).
  ctx.fillStyle = SHUTTLE.feather;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 2.4, -r * 1.5);
  ctx.lineTo(-r * 3.0, 0);
  ctx.lineTo(-r * 2.4, r * 1.5);
  ctx.closePath();
  ctx.fill();

  // Skirt rib lines.
  ctx.strokeStyle = rgba('#C7D2E0', 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.9);
  ctx.lineTo(-r * 2.6, -r * 0.6);
  ctx.moveTo(-r * 0.6, r * 0.9);
  ctx.lineTo(-r * 2.6, r * 0.6);
  ctx.stroke();

  // Cork nose (leading).
  ctx.fillStyle = SHUTTLE.cork;
  ctx.beginPath();
  ctx.arc(r * 0.6, 0, r * 0.95, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
