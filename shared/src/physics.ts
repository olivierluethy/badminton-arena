// Pure movement + collision. No rules, no scoring — just kinematics and the
// geometry of the court. `simulation.ts` orchestrates these and applies rules.

import {
  DT,
  DIVE_DURATION,
  DIVE_SPEED,
  DRAG_K,
  FLOOR_Y,
  JUMP_SPEED,
  LEFT_MAX_X,
  LEFT_MIN_X,
  NET_HALF_THICKNESS,
  NET_TOP_Y,
  CENTER_X,
  PLAYER_ACCEL,
  PLAYER_AIR_ACCEL,
  PLAYER_FRICTION,
  PLAYER_GRAVITY,
  PLAYER_MAX_SPEED,
  RACKET_REACH,
  RACKET_CENTER_Y_OFFSET,
  RIGHT_MAX_X,
  RIGHT_MIN_X,
  SHUTTLE_GRAVITY,
  SHUTTLE_MAX_SPEED,
} from './constants.js';
import { clamp, length2 } from './math.js';
import type { InputState, PlayerState, ShuttleState } from './types.js';

/** Horizontal bounds for a player, based on which side they defend. */
export function sideBounds(side: PlayerState['side']): { min: number; max: number } {
  return side === 'left'
    ? { min: LEFT_MIN_X, max: LEFT_MAX_X }
    : { min: RIGHT_MIN_X, max: RIGHT_MAX_X };
}

/** World position of a player's racket contact centre. */
export function racketCenter(p: PlayerState): { x: number; y: number } {
  return {
    x: p.x + p.facing * RACKET_REACH,
    y: p.y - RACKET_CENTER_Y_OFFSET,
  };
}

/**
 * Advance one player one tick. Handles run accel/friction, jump, dive lunge,
 * gravity, floor landing and side bounds. Swing/hit detection is done by the
 * simulation after motion. `dt` is passed for clarity but is always DT.
 */
export function stepPlayer(p: PlayerState, input: InputState, dt: number): void {
  // Players always face the net (toward the opponent's side).
  p.facing = p.side === 'left' ? 1 : -1;

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const accel = p.onGround ? PLAYER_ACCEL : PLAYER_AIR_ACCEL;

  if (dir !== 0) {
    p.vx += dir * accel * dt;
    p.vx = clamp(p.vx, -PLAYER_MAX_SPEED, PLAYER_MAX_SPEED);
  } else if (p.onGround) {
    // Friction toward rest.
    const drop = PLAYER_FRICTION * dt;
    if (Math.abs(p.vx) <= drop) p.vx = 0;
    else p.vx -= Math.sign(p.vx) * drop;
  }

  // Dive lunge — grounded smash press (edge-triggered so a held key won't spam).
  const smashEdge = input.smash && !p.prevSmash;
  if (smashEdge && p.onGround && p.diveTimer <= 0) {
    const lungeDir = dir !== 0 ? dir : p.facing;
    p.vx = lungeDir * DIVE_SPEED;
    p.diveTimer = DIVE_DURATION;
  }
  if (p.diveTimer > 0) p.diveTimer -= dt;

  // Jump — edge-triggered from the ground.
  const jumpEdge = input.jump && !p.prevJump;
  if (jumpEdge && p.onGround) {
    p.vy = -JUMP_SPEED;
    p.onGround = false;
  }

  // Gravity while airborne.
  if (!p.onGround) p.vy += PLAYER_GRAVITY * dt;

  // Integrate.
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Floor.
  if (p.y >= FLOOR_Y) {
    p.y = FLOOR_Y;
    p.vy = 0;
    p.onGround = true;
  }

  // Side bounds — never cross the net line, never leave the court.
  const b = sideBounds(p.side);
  if (p.x < b.min) {
    p.x = b.min;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > b.max) {
    p.x = b.max;
    if (p.vx > 0) p.vx = 0;
  }

  // Record input edges for next tick.
  p.prevJump = input.jump;
  p.prevSmash = input.smash;
}

/**
 * Advance the shuttle one tick under gravity + quadratic air drag.
 * a_drag = -DRAG_K * |v| * v — the high coefficient gives the sharp, asymmetric
 * badminton arc. Returns without touching floor/net; the simulation resolves
 * those collisions so it can emit the right events.
 */
export function integrateShuttle(s: ShuttleState, dt: number): void {
  if (s.dead) return;

  const speed = length2(s.vx, s.vy);
  // Drag acceleration components (opposes velocity, scales with speed²).
  const dragMag = DRAG_K * speed; // multiplied by each velocity component below
  const ax = -dragMag * s.vx;
  const ay = SHUTTLE_GRAVITY - dragMag * s.vy;

  s.vx += ax * dt;
  s.vy += ay * dt;

  // Clamp speed for numerical stability on very hard smashes.
  const newSpeed = length2(s.vx, s.vy);
  if (newSpeed > SHUTTLE_MAX_SPEED) {
    const k = SHUTTLE_MAX_SPEED / newSpeed;
    s.vx *= k;
    s.vy *= k;
  }

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.sinceHit += 1;
}

/** Result of testing the shuttle against the net this tick. */
export interface NetCollision {
  hit: boolean;
  /** Sign of the side the shuttle came from (-1 left, +1 right). */
  fromSide: number;
}

/**
 * Collide the shuttle with the solid net band. If the shuttle crosses the net
 * line below the net top, it is deflected: horizontal motion is killed and it
 * is nudged back to the side it came from so it drops into that half.
 */
export function collideNet(s: ShuttleState): NetCollision {
  if (s.dead) return { hit: false, fromSide: 0 };

  const withinBandX = Math.abs(s.x - CENTER_X) <= NET_HALF_THICKNESS + s.vx * DT * 0 + 6;
  const belowTop = s.y >= NET_TOP_Y;

  if (withinBandX && belowTop) {
    const fromSide = s.vx >= 0 ? -1 : 1; // moving right ⇒ came from left
    // Deflect: settle against the net on the incoming side.
    s.x = CENTER_X + fromSide * (NET_HALF_THICKNESS + 6);
    s.vx = fromSide * 40; // small nudge into the hitter's half
    if (s.vy < 0) s.vy = 0; // kill any remaining lift
    s.netted = true;
    return { hit: true, fromSide };
  }
  return { hit: false, fromSide: 0 };
}

/** Constrain shuttle horizontal position never to teleport through the net. */
export function shuttlePastNet(prevX: number, s: ShuttleState): boolean {
  return (prevX - CENTER_X) * (s.x - CENTER_X) < 0;
}
