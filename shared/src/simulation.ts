// The simulation state machine: createInitialState + a single 60 Hz `step`.
// This is the one place that advances the world. Client and server both call it.
//
// `step` mutates `state` in place and returns it (avoids per-tick allocation).
// Emitted events are appended to the caller-provided `events` array, which the
// caller clears before each call.

import {
  DT,
  FLOOR_Y,
  HIT_COOLDOWN,
  PLAYER_VEL_TRANSFER,
  RACKET_ARC_SPAN,
  RACKET_HIT_RADIUS,
  ANGLE_LOW_CONTACT,
  ANGLE_HIGH_CONTACT,
  SMASH_ANGLE_BONUS,
  SERVE_ANGLE,
  SERVE_SPEED,
  SERVE_SHUTTLE_Y_OFFSET,
  SHUTTLE_RADIUS,
  SMASH_SPEED,
  SWING_DURATION,
  SWING_SPEED,
  TICK_RATE,
} from './constants.js';
import { clamp, lerp } from './math.js';
import { collideNet, integrateShuttle, racketCenter, stepPlayer } from './physics.js';
import {
  beginNextGame,
  maybeDeciderSwap,
  resolveFloorContact,
  setupServe,
} from './rules.js';
import type {
  GameState,
  InputState,
  MatchConfig,
  PlayerId,
  PlayerState,
  SimEvent,
  Side,
} from './types.js';

function makePlayer(id: PlayerId, side: Side): PlayerState {
  return {
    id,
    side,
    x: 0,
    y: FLOOR_Y,
    vx: 0,
    vy: 0,
    onGround: true,
    facing: side === 'left' ? 1 : -1,
    swingTimer: 0,
    diveTimer: 0,
    lastSwingWasSmash: false,
    prevJump: true,
    prevSmash: true,
    anim: 'idle',
    animClock: 0,
  };
}

export function createInitialState(config: MatchConfig): GameState {
  const leftId = config.leftPlayer;
  const state: GameState = {
    tick: 0,
    phase: 'serve',
    phaseTimer: 0,
    serveTimer: 0,
    players: [
      makePlayer(0, leftId === 0 ? 'left' : 'right'),
      makePlayer(1, leftId === 1 ? 'left' : 'right'),
    ],
    shuttle: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      dead: false,
      lastHitBy: null,
      sinceHit: 0,
      netted: false,
    },
    match: {
      scores: [0, 0],
      gamesWon: [0, 0],
      gameIndex: 0,
      server: config.firstServer,
      leftPlayer: leftId,
      lastRallyWinner: null,
      matchWinner: null,
      deciderSwapped: false,
    },
  };
  setupServe(state);
  return state;
}

const HIT_COOLDOWN_TICKS = HIT_COOLDOWN * TICK_RATE;
const RACKET_HIT_DIST = RACKET_HIT_RADIUS + SHUTTLE_RADIUS;

/** Launch the serve from the server's racket toward the opponent. */
function executeServe(state: GameState, events: SimEvent[]): void {
  const server = state.players[state.match.server];
  const s = state.shuttle;
  const r = racketCenter(server);
  s.x = r.x;
  s.y = server.y - SERVE_SHUTTLE_Y_OFFSET;
  const dir = server.facing;
  s.vx = dir * SERVE_SPEED * Math.cos(SERVE_ANGLE);
  s.vy = -SERVE_SPEED * Math.sin(SERVE_ANGLE);
  s.dead = false;
  s.netted = false;
  s.lastHitBy = server.id;
  s.sinceHit = 0;
  server.anim = 'swing';
  server.swingTimer = SWING_DURATION;
  state.phase = 'rally';
  events.push({ type: 'serve', player: server.id, x: s.x, y: s.y });
}

/**
 * Test one player's racket against the shuttle and, on contact, launch it.
 * Outgoing velocity derives from: shot type (smash held), vertical contact
 * offset on the racket arc (high = flat/down, low = lofted), and a share of the
 * player's own velocity. Returns true if a hit occurred.
 */
function tryHit(p: PlayerState, state: GameState, input: InputState, events: SimEvent[]): boolean {
  const s = state.shuttle;
  if (s.dead) return false;
  if (s.lastHitBy === p.id) return false; // no double hits
  if (s.sinceHit < HIT_COOLDOWN_TICKS) return false;

  const r = racketCenter(p);
  const dx = s.x - r.x;
  const dy = s.y - r.y;
  if (dx * dx + dy * dy > RACKET_HIT_DIST * RACKET_HIT_DIST) return false;

  // Contact offset: +1 = shuttle high on the arc (above centre), -1 = low.
  const contact = clamp((r.y - s.y) / (RACKET_ARC_SPAN * 0.5), -1, 1);
  const t01 = (contact + 1) * 0.5; // 0 low … 1 high
  const smash = input.smash;

  let angle = lerp(ANGLE_LOW_CONTACT, ANGLE_HIGH_CONTACT, t01);
  if (smash) angle -= SMASH_ANGLE_BONUS;

  const speed = smash ? SMASH_SPEED : SWING_SPEED;
  const dir = p.facing;
  s.vx = dir * speed * Math.cos(angle) + p.vx * PLAYER_VEL_TRANSFER;
  s.vy = -speed * Math.sin(angle);
  s.lastHitBy = p.id;
  s.sinceHit = 0;
  s.netted = false;

  p.swingTimer = SWING_DURATION;
  p.lastSwingWasSmash = smash;
  p.anim = smash ? 'smash' : 'swing';

  events.push({ type: smash ? 'smash' : 'hit', x: r.x, y: r.y, player: p.id, strong: smash });
  return true;
}

/** Choose a player's discrete animation from its physical state. */
function updateAnim(p: PlayerState): void {
  p.animClock += DT;
  if (p.swingTimer > 0) return; // keep swing/smash pose until it elapses
  if (p.diveTimer > 0) p.anim = 'dive';
  else if (!p.onGround) p.anim = 'jump';
  else if (Math.abs(p.vx) > 45) p.anim = 'run';
  else p.anim = 'idle';
}

/** Movement-only integration used during the serve phase (no jump/dive). */
function stepPlayerMoveOnly(p: PlayerState, input: InputState): void {
  const moveOnly: InputState = { left: input.left, right: input.right, jump: false, smash: false };
  stepPlayer(p, moveOnly, DT);
}

/**
 * Advance the world exactly one tick. `in0`/`in1` are the inputs for players 0
 * and 1. Events are appended to `events` (caller clears it first).
 */
export function step(
  state: GameState,
  in0: InputState,
  in1: InputState,
  events: SimEvent[],
): GameState {
  state.tick += 1;

  const p0 = state.players[0];
  const p1 = state.players[1];

  // Decay swing timers regardless of phase.
  if (p0.swingTimer > 0) p0.swingTimer = Math.max(0, p0.swingTimer - DT);
  if (p1.swingTimer > 0) p1.swingTimer = Math.max(0, p1.swingTimer - DT);

  switch (state.phase) {
    case 'serve':
      stepServe(state, in0, in1, events);
      break;
    case 'rally':
      stepRally(state, in0, in1, events);
      break;
    case 'pointScored':
    case 'gameOver':
    case 'matchOver':
      stepFreeze(state, events);
      break;
  }

  return state;
}

function stepServe(state: GameState, in0: InputState, in1: InputState, events: SimEvent[]): void {
  state.serveTimer = Math.max(0, state.serveTimer - DT);

  const serverId = state.match.server;
  const serverInput = serverId === 0 ? in0 : in1;
  const server = state.players[serverId];

  // Serve trigger: a fresh press of jump or smash (edge), or window expiry.
  const serveEdge =
    (serverInput.jump && !server.prevJump) || (serverInput.smash && !server.prevSmash);

  // Move both players (no jumping during the serve).
  stepPlayerMoveOnly(state.players[0], in0);
  stepPlayerMoveOnly(state.players[1], in1);

  // Maintain true input edges for the server (movement step cleared them).
  server.prevJump = serverInput.jump;
  server.prevSmash = serverInput.smash;

  updateAnim(state.players[0]);
  updateAnim(state.players[1]);

  if (serveEdge || state.serveTimer <= 0) {
    executeServe(state, events);
    return;
  }

  // Keep the held shuttle pegged to the server's racket.
  const r = racketCenter(server);
  state.shuttle.x = r.x;
  state.shuttle.y = server.y - SERVE_SHUTTLE_Y_OFFSET;
}

function stepRally(state: GameState, in0: InputState, in1: InputState, events: SimEvent[]): void {
  const p0 = state.players[0];
  const p1 = state.players[1];

  stepPlayer(p0, in0, DT);
  stepPlayer(p1, in1, DT);

  const s = state.shuttle;
  const prevX = s.x;
  integrateShuttle(s, DT);

  // Hit tests before net/floor so a low save near the net still connects.
  // Only one racket may connect per tick (they defend opposite sides).
  if (!tryHit(p0, state, in0, events)) tryHit(p1, state, in1, events);

  // Net (swept against prevX so fast shots can't tunnel through).
  const net = collideNet(s, prevX);
  if (net.hit) {
    events.push({ type: 'netTouch', x: s.x, y: s.y });
  }

  // Floor → rally resolved.
  if (!s.dead && s.y + SHUTTLE_RADIUS >= FLOOR_Y) {
    s.y = FLOOR_Y - SHUTTLE_RADIUS;
    s.dead = true;
    s.vx = 0;
    s.vy = 0;
    resolveFloorContact(state, events);
  }

  updateAnim(p0);
  updateAnim(p1);
}

function stepFreeze(state: GameState, events: SimEvent[]): void {
  state.phaseTimer = Math.max(0, state.phaseTimer - DT);

  // Winner celebrates, loser slumps.
  const winner = state.match.lastRallyWinner;
  if (winner !== null) {
    state.players[winner].anim = 'celebrate';
    state.players[(1 - winner) as PlayerId].anim = 'slump';
  }
  state.players[0].animClock += DT;
  state.players[1].animClock += DT;

  if (state.phaseTimer > 0) return;

  switch (state.phase) {
    case 'pointScored':
      maybeDeciderSwap(state, events);
      setupServe(state);
      break;
    case 'gameOver':
      beginNextGame(state, events);
      break;
    case 'matchOver':
      // Terminal — external code resets or leaves the match.
      break;
  }
}
