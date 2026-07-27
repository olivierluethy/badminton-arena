// AI opponent. The bot drives the SAME per-tick input bitmask a human produces —
// it never sets velocities or reads hidden state. It predicts the shuttle's
// landing point by forward-integrating the shared physics, applies a
// difficulty-scaled error, and moves/jumps/smashes toward it. A seeded RNG keeps
// it a pure function of its own state (no global Math.random).

import {
  CENTER_X,
  DT,
  FLOOR_Y,
  NET_TOP_Y,
  RACKET_CENTER_Y_OFFSET,
  SHUTTLE_GRAVITY,
  DRAG_K,
  SHUTTLE_MAX_SPEED,
} from './constants.js';
import { sideBounds } from './physics.js';
import type { GameState, InputState, PlayerId, ShuttleState, Side } from './types.js';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface DiffParams {
  reactionDelay: number; // seconds before reacting to a new shot
  errorMag: number; // ± landing-point error in world units
  smashProb: number; // chance to smash a reachable high shuttle
  aggression: number; // jump/anticipation eagerness [0..1]
}

const DIFFS: Record<Difficulty, DiffParams> = {
  easy: { reactionDelay: 0.26, errorMag: 120, smashProb: 0.25, aggression: 0.35 },
  normal: { reactionDelay: 0.14, errorMag: 55, smashProb: 0.55, aggression: 0.62 },
  hard: { reactionDelay: 0.06, errorMag: 15, smashProb: 0.82, aggression: 0.9 },
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Reusable scratch shuttle for landing prediction (no per-call allocation).
const scratch: ShuttleState = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  dead: false,
  lastHitBy: null,
  sinceHit: 0,
  netted: false,
};

/** Forward-integrate a copy of the shuttle to its floor-landing x. */
function predictLandingX(s: ShuttleState): number {
  scratch.x = s.x;
  scratch.y = s.y;
  scratch.vx = s.vx;
  scratch.vy = s.vy;
  // Integrate up to ~3.5 s.
  for (let i = 0; i < 210; i++) {
    const speed = Math.hypot(scratch.vx, scratch.vy);
    const dragMag = DRAG_K * speed;
    scratch.vx += -dragMag * scratch.vx * DT;
    scratch.vy += (SHUTTLE_GRAVITY - dragMag * scratch.vy) * DT;
    const ns = Math.hypot(scratch.vx, scratch.vy);
    if (ns > SHUTTLE_MAX_SPEED) {
      const k = SHUTTLE_MAX_SPEED / ns;
      scratch.vx *= k;
      scratch.vy *= k;
    }
    scratch.x += scratch.vx * DT;
    scratch.y += scratch.vy * DT;
    if (scratch.y >= FLOOR_Y) break;
  }
  return scratch.x;
}

export class BotBrain {
  private diff: DiffParams;
  private rng: () => number;
  private reactTimer = 0;
  private committedTarget: number;
  private errorX = 0;
  private lastSeenHitBy: PlayerId | null = null;
  private prevJump = false;
  private prevSmash = false;
  private serveDelay: number;

  constructor(
    public readonly botId: PlayerId,
    difficulty: Difficulty,
    seed = 0x9e3779b9,
  ) {
    this.diff = DIFFS[difficulty];
    this.rng = mulberry(seed ^ (botId * 0x85ebca6b));
    this.committedTarget = CENTER_X;
    this.serveDelay = 0.5 + this.rng() * 0.8;
  }

  private side(state: GameState): Side {
    return state.players[this.botId].side;
  }

  private readyX(side: Side): number {
    return side === 'left' ? CENTER_X - 230 : CENTER_X + 230;
  }

  /** Produce this tick's input bitmask. Pure w.r.t. the bot's own state. */
  think(state: GameState, out: InputState): InputState {
    out.left = false;
    out.right = false;
    out.jump = false;
    out.smash = false;

    const me = state.players[this.botId];
    const s = state.shuttle;
    const side = me.side;
    const bounds = sideBounds(side);

    if (state.phase === 'serve') {
      this.serveLogic(state, me.side, out);
      this.prevJump = out.jump;
      this.prevSmash = out.smash;
      return out;
    }

    if (state.phase !== 'rally') {
      // Between points: drift to the ready spot.
      this.moveToward(me.x, this.readyX(side), out, 12);
      this.prevJump = out.jump;
      this.prevSmash = out.smash;
      this.reactTimer = 0;
      this.lastSeenHitBy = null;
      return out;
    }

    // Detect a fresh shot from the opponent → begin reaction delay + resample.
    if (s.lastHitBy !== this.lastSeenHitBy) {
      this.lastSeenHitBy = s.lastHitBy;
      if (s.lastHitBy !== null && s.lastHitBy !== this.botId) {
        this.reactTimer = this.diff.reactionDelay;
        this.errorX = (this.rng() * 2 - 1) * this.diff.errorMag;
      }
    }
    if (this.reactTimer > 0) this.reactTimer -= DT;

    const approaching = this.isApproaching(side, s);
    let target: number;
    if (approaching && this.reactTimer <= 0) {
      const landing = predictLandingX(s);
      // Stand a touch behind the landing spot so the racket meets it in front.
      const behind = side === 'left' ? -34 : 34;
      target = landing + this.errorX + behind;
      this.committedTarget = target;
    } else if (approaching) {
      target = this.committedTarget; // reacting: hold last commit
    } else {
      target = this.readyX(side); // recover to centre
    }

    target = Math.max(bounds.min, Math.min(bounds.max, target));
    this.moveToward(me.x, target, out, 10);

    // Interception: jump / smash / dive decisions.
    this.strikeLogic(state, me.x, me.y, me.onGround, s, side, approaching, out);

    this.prevJump = out.jump;
    this.prevSmash = out.smash;
    return out;
  }

  private serveLogic(state: GameState, side: Side, out: InputState): void {
    const me = state.players[this.botId];
    if (state.match.server === this.botId) {
      // Wait a beat, then serve with a fresh jump press.
      this.serveDelay -= DT;
      if (this.serveDelay <= 0) {
        // The serve fires on a jump edge, so press only when it wasn't held.
        out.jump = !this.prevJump;
      }
    } else {
      this.moveToward(me.x, this.readyX(side), out, 12);
    }
  }

  private isApproaching(side: Side, s: ShuttleState): boolean {
    if (s.dead) return false;
    if (side === 'left') return s.vx < 0 || s.x < CENTER_X;
    return s.vx > 0 || s.x > CENTER_X;
  }

  private moveToward(x: number, target: number, out: InputState, deadzone: number): void {
    const d = target - x;
    if (d > deadzone) out.right = true;
    else if (d < -deadzone) out.left = true;
  }

  private strikeLogic(
    state: GameState,
    bx: number,
    by: number,
    onGround: boolean,
    s: ShuttleState,
    side: Side,
    approaching: boolean,
    out: InputState,
  ): void {
    if (!approaching || s.dead) return;

    const horiz = Math.abs(s.x - bx);
    const shuttleOnMySide = side === 'left' ? s.x < CENTER_X + 60 : s.x > CENTER_X - 60;
    if (!shuttleOnMySide) return;

    const racketY = by - RACKET_CENTER_Y_OFFSET;
    const highContact = s.y < racketY - 10; // shuttle above racket centre
    const veryHigh = s.y < NET_TOP_Y - 20;

    // Jump to meet a high shuttle when close and feeling aggressive.
    if (
      onGround &&
      veryHigh &&
      horiz < 150 &&
      this.rng() < this.diff.aggression &&
      s.vy > -50 // shuttle descending or near apex
    ) {
      out.jump = !this.prevJump; // edge
    }

    // Smash a reachable high shuttle.
    if (highContact && horiz < 110 && this.rng() < this.diff.smashProb) {
      out.smash = true;
    }

    // Desperate low dive to reach a ball dropping just out of run range.
    if (onGround && !highContact && horiz > 70 && horiz < 190 && s.y > by - 60) {
      out.smash = !this.prevSmash; // dive lunge (edge)
    }
  }
}
