// Layered scene renderer. Interpolates between two authoritative sim states and
// draws: sky → crowd → court → shadows → net → players → shuttle → effects.
// The HUD, banners and menus are DOM overlays (see ui/), not canvas.

import {
  FLOOR_Y,
  LEFT_BASELINE,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  RIGHT_BASELINE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '@badminton/shared';
import type { GameState, PlayerState } from '@badminton/shared';
import { beginWorldTransform, type Viewport } from './viewport.js';
import { drawCourtBackground, drawNet } from './court.js';
import { FigureRenderer } from './figure.js';
import { drawGroundShadow, drawShuttle, drawShuttleTrail, type TrailPoint } from './shuttle.js';
import { Effects } from './effects.js';
import { ENV, UI, kitFor, rgba } from './palette.js';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate a player's feet position, snapping on large jumps (resets). */
function interpFeet(prev: PlayerState, cur: PlayerState, t: number): { x: number; y: number } {
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  if (dx * dx + dy * dy > 300 * 300) return { x: cur.x, y: cur.y };
  return { x: lerp(prev.x, cur.x, t), y: lerp(prev.y, cur.y, t) };
}

export class Renderer {
  private figures = new FigureRenderer();
  private trailBuf: TrailPoint[] = [];
  private clock = 0;

  constructor(
    private vp: Viewport,
    public effects: Effects,
  ) {}

  render(prev: GameState, cur: GameState, alpha: number, frameDt: number): void {
    const { ctx } = this.vp;
    this.clock += frameDt;

    // Clear to letterbox colour (full device rect).
    ctx.setTransform(this.vp.dpr, 0, 0, this.vp.dpr, 0, 0);
    ctx.fillStyle = ENV.letterbox;
    ctx.fillRect(0, 0, this.vp.cssWidth, this.vp.cssHeight);

    beginWorldTransform(this.vp);

    // Screen shake.
    ctx.translate(this.effects.shakeX, this.effects.shakeY);

    // Clip to the world rect so shake/letterbox stay clean.
    ctx.save();
    ctx.beginPath();
    ctx.rect(-20, -20, WORLD_WIDTH + 40, WORLD_HEIGHT + 40);
    ctx.clip();

    drawCourtBackground(ctx);

    // Shadows (players + shuttle) on the floor.
    const feet: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 2; i++) {
      const f = interpFeet(prev.players[i], cur.players[i], alpha);
      feet.push(f);
      drawGroundShadow(ctx, f.x, f.y, PLAYER_HALF_WIDTH * 3.2, 0.4);
    }
    const sx = lerp(prev.shuttle.x, cur.shuttle.x, alpha);
    const sy = lerp(prev.shuttle.y, cur.shuttle.y, alpha);
    if (!cur.shuttle.dead || cur.phase === 'serve') {
      drawGroundShadow(ctx, sx, Math.min(sy, FLOOR_Y), 20, 0.5);
    }

    // Net (behind players).
    drawNet(ctx, this.effects.netWobbleValue());

    // Players.
    for (let i = 0; i < 2; i++) {
      const player = cur.players[i];
      this.figures.draw(ctx, player, feet[i].x, feet[i].y, kitFor(player.id), frameDt);
    }

    // Shuttle trail + shuttle.
    this.effects.getTrail(this.trailBuf);
    drawShuttleTrail(ctx, this.trailBuf);
    const sd = cur.shuttle;
    if (!sd.dead || cur.phase === 'serve') {
      drawShuttle(ctx, sx, sy, sd.vx, sd.vy);
    }

    // Serve-ready indicator above the serving player.
    if (cur.phase === 'serve') {
      const server = cur.players[cur.match.server];
      const f = interpFeet(prev.players[cur.match.server], server, alpha);
      this.drawServeIndicator(ctx, f.x, f.y, server.id);
    }

    // Out-of-bounds marker where a rally ended long.
    if (
      (cur.phase === 'pointScored' || cur.phase === 'gameOver' || cur.phase === 'matchOver') &&
      cur.shuttle.dead &&
      (cur.shuttle.x < LEFT_BASELINE || cur.shuttle.x > RIGHT_BASELINE)
    ) {
      this.drawOutMarker(ctx, cur.shuttle.x);
    }

    // Juice.
    this.effects.draw(ctx);

    ctx.restore();
  }

  private drawServeIndicator(ctx: CanvasRenderingContext2D, x: number, feetY: number, id: number): void {
    const kit = kitFor(id);
    const bob = Math.sin(this.clock * 5) * 5;
    const y = feetY - PLAYER_HEIGHT - 26 + bob;
    ctx.save();
    ctx.fillStyle = kit.kit;
    ctx.shadowColor = kit.glow;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x + 11, y);
    ctx.lineTo(x, y + 13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawOutMarker(ctx: CanvasRenderingContext2D, x: number): void {
    const cx = Math.max(LEFT_BASELINE - 18, Math.min(RIGHT_BASELINE + 18, x));
    const y = FLOOR_Y - 10;
    const pulse = 0.6 + 0.4 * Math.sin(this.clock * 8);
    ctx.save();
    ctx.strokeStyle = rgba(UI.danger, pulse);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, y, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 8, y - 8);
    ctx.lineTo(cx + 8, y + 8);
    ctx.moveTo(cx + 8, y - 8);
    ctx.lineTo(cx - 8, y + 8);
    ctx.stroke();
    ctx.restore();
  }
}
