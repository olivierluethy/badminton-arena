// Static stadium + court drawing: sky, floodlight glow, crowd, painted court,
// line markings, and the net (with a wobble offset from the effects layer).

import {
  CENTER_X,
  FLOOR_Y,
  LEFT_BASELINE,
  NET_TOP_Y,
  RIGHT_BASELINE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '@badminton/shared';
import { ENV, rgba } from './palette.js';

let skyGrad: CanvasGradient | null = null;
let floorGrad: CanvasGradient | null = null;

interface Fleck {
  x: number;
  y: number;
  r: number;
  warm: boolean;
}
let crowd: Fleck[] | null = null;

// Deterministic pseudo-random so the crowd is stable frame to frame.
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CROWD_TOP = 132;
const CROWD_BOTTOM = 322;

function buildCrowd(): Fleck[] {
  const rand = mulberry(1337);
  const flecks: Fleck[] = [];
  const rows = 9;
  for (let row = 0; row < rows; row++) {
    const y = CROWD_TOP + ((CROWD_BOTTOM - CROWD_TOP) * (row + 0.5)) / rows;
    const count = 64 + row * 4;
    for (let i = 0; i < count; i++) {
      const x = (rand() * (WORLD_WIDTH + 40)) - 20;
      flecks.push({
        x,
        y: y + (rand() - 0.5) * 10,
        r: 3.2 + rand() * 2.4,
        warm: rand() > 0.5,
      });
    }
  }
  return flecks;
}

export function drawCourtBackground(ctx: CanvasRenderingContext2D): void {
  if (!skyGrad) {
    skyGrad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    skyGrad.addColorStop(0, ENV.skyTop);
    skyGrad.addColorStop(1, ENV.skyBottom);
  }
  if (!floorGrad) {
    floorGrad = ctx.createLinearGradient(0, FLOOR_Y, 0, WORLD_HEIGHT);
    floorGrad.addColorStop(0, ENV.courtIn);
    floorGrad.addColorStop(1, ENV.courtShadow);
  }
  if (!crowd) crowd = buildCrowd();

  // Sky.
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Floodlight glow from the top corners.
  drawFloodlight(ctx, 210, -40);
  drawFloodlight(ctx, WORLD_WIDTH - 210, -40);

  // Crowd band.
  ctx.fillStyle = ENV.crowdDark;
  ctx.fillRect(0, CROWD_TOP - 16, WORLD_WIDTH, CROWD_BOTTOM - CROWD_TOP + 28);
  ctx.fillStyle = ENV.crowdLight;
  ctx.fillRect(0, (CROWD_TOP + CROWD_BOTTOM) / 2, WORLD_WIDTH, CROWD_BOTTOM - (CROWD_TOP + CROWD_BOTTOM) / 2 + 14);
  for (const f of crowd) {
    ctx.fillStyle = f.warm ? ENV.crowdFleckA : ENV.crowdFleckB;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Stadium rim shadow under the crowd.
  ctx.fillStyle = rgba(ENV.courtShadow, 0.55);
  ctx.fillRect(0, CROWD_BOTTOM + 12, WORLD_WIDTH, 46);

  drawCourtFloor(ctx);
}

function drawFloodlight(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 520);
  grad.addColorStop(0, rgba(ENV.floodlight, 0.28));
  grad.addColorStop(0.5, rgba(ENV.floodlight, 0.08));
  grad.addColorStop(1, rgba(ENV.floodlight, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

function drawCourtFloor(ctx: CanvasRenderingContext2D): void {
  // Green apron.
  ctx.fillStyle = ENV.courtOut;
  ctx.fillRect(0, FLOOR_Y, WORLD_WIDTH, WORLD_HEIGHT - FLOOR_Y);

  // Subtle apron stripe.
  ctx.fillStyle = rgba(ENV.courtOutAlt, 0.5);
  ctx.fillRect(0, FLOOR_Y, WORLD_WIDTH, 8);

  // Blue in-court between the baselines.
  ctx.fillStyle = floorGrad!;
  ctx.fillRect(LEFT_BASELINE, FLOOR_Y, RIGHT_BASELINE - LEFT_BASELINE, WORLD_HEIGHT - FLOOR_Y);

  // In-court sheen stripe.
  ctx.fillStyle = rgba(ENV.courtInAlt, 0.35);
  ctx.fillRect(LEFT_BASELINE, FLOOR_Y, RIGHT_BASELINE - LEFT_BASELINE, 6);

  // Line markings.
  ctx.strokeStyle = ENV.courtLine;
  ctx.lineWidth = 3;

  // Top edge of the floor, full court width.
  line(ctx, LEFT_BASELINE, FLOOR_Y, RIGHT_BASELINE, FLOOR_Y);

  // Baseline ticks (out-of-bounds limits).
  vtick(ctx, LEFT_BASELINE, FLOOR_Y, 60);
  vtick(ctx, RIGHT_BASELINE, FLOOR_Y, 60);

  // Centre line under the net.
  ctx.lineWidth = 2;
  vtick(ctx, CENTER_X, FLOOR_Y, 44);

  // Short service lines.
  vtick(ctx, CENTER_X - 150, FLOOR_Y, 34);
  vtick(ctx, CENTER_X + 150, FLOOR_Y, 34);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function vtick(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  line(ctx, x, y, x, y + h);
}

/** Draw the net at the net layer. `wobble` is a horizontal mesh displacement. */
export function drawNet(ctx: CanvasRenderingContext2D, wobble: number): void {
  const x = CENTER_X;
  const top = NET_TOP_Y;
  const bottom = FLOOR_Y;

  // Post.
  ctx.fillStyle = ENV.netPost;
  ctx.fillRect(x - 4, top - 6, 8, bottom - top + 6);

  // Mesh (diagonal-free grid) with wobble that decays toward the floor.
  ctx.strokeStyle = rgba(ENV.netMesh, 0.5);
  ctx.lineWidth = 1;
  const halfW = 22;
  for (let gy = top + 8; gy < bottom; gy += 9) {
    const t = (gy - top) / (bottom - top);
    const w = wobble * (1 - t);
    ctx.beginPath();
    ctx.moveTo(x - halfW + w, gy);
    ctx.lineTo(x + halfW + w, gy);
    ctx.stroke();
  }
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    for (let gy = top + 8; gy < bottom; gy += 9) {
      const t = (gy - top) / (bottom - top);
      const w = wobble * (1 - t);
      const vx = x + i * (halfW / 2) + w;
      if (gy === top + 8) ctx.moveTo(vx, gy);
      else ctx.lineTo(vx, gy);
    }
    ctx.stroke();
  }

  // White top band.
  ctx.fillStyle = ENV.netBand;
  ctx.fillRect(x - halfW - 3 + wobble, top - 2, halfW * 2 + 6, 10);
}
