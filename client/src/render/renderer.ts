// Layered scene renderer. Interpolates between two authoritative sim states and
// draws: sky → crowd → court → shadows → net → players → shuttle → effects.
// The HUD, banners and menus are DOM overlays (see ui/), not canvas.

import { FLOOR_Y, PLAYER_HALF_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '@badminton/shared';
import type { GameState, PlayerState } from '@badminton/shared';
import { beginWorldTransform, type Viewport } from './viewport.js';
import { drawCourtBackground, drawNet } from './court.js';
import { FigureRenderer } from './figure.js';
import { drawGroundShadow, drawShuttle, drawShuttleTrail, type TrailPoint } from './shuttle.js';
import { Effects } from './effects.js';
import { ENV, kitFor } from './palette.js';

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

  constructor(
    private vp: Viewport,
    public effects: Effects,
  ) {}

  render(prev: GameState, cur: GameState, alpha: number, frameDt: number): void {
    const { ctx } = this.vp;

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

    // Juice.
    this.effects.draw(ctx);

    ctx.restore();
  }
}
