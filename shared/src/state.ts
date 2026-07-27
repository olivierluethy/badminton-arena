// Allocation-free deep copy of GameState. Used for render interpolation
// (prev ← cur each tick) and for netcode reconciliation (rewind to a snapshot).

import type { GameState, PlayerState, ShuttleState } from './types.js';

function copyPlayer(dst: PlayerState, src: PlayerState): void {
  dst.id = src.id;
  dst.side = src.side;
  dst.x = src.x;
  dst.y = src.y;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.onGround = src.onGround;
  dst.facing = src.facing;
  dst.swingTimer = src.swingTimer;
  dst.diveTimer = src.diveTimer;
  dst.lastSwingWasSmash = src.lastSwingWasSmash;
  dst.prevJump = src.prevJump;
  dst.prevSmash = src.prevSmash;
  dst.anim = src.anim;
  dst.animClock = src.animClock;
}

function copyShuttle(dst: ShuttleState, src: ShuttleState): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.dead = src.dead;
  dst.lastHitBy = src.lastHitBy;
  dst.sinceHit = src.sinceHit;
  dst.netted = src.netted;
}

/** Copy `src` into the existing `dst` object graph (no allocation). */
export function copyGameState(dst: GameState, src: GameState): void {
  dst.tick = src.tick;
  dst.phase = src.phase;
  dst.phaseTimer = src.phaseTimer;
  dst.serveTimer = src.serveTimer;
  copyPlayer(dst.players[0], src.players[0]);
  copyPlayer(dst.players[1], src.players[1]);
  copyShuttle(dst.shuttle, src.shuttle);
  const m = dst.match;
  const s = src.match;
  m.scores[0] = s.scores[0];
  m.scores[1] = s.scores[1];
  m.gamesWon[0] = s.gamesWon[0];
  m.gamesWon[1] = s.gamesWon[1];
  m.gameIndex = s.gameIndex;
  m.server = s.server;
  m.leftPlayer = s.leftPlayer;
  m.lastRallyWinner = s.lastRallyWinner;
  m.matchWinner = s.matchWinner;
  m.deciderSwapped = s.deciderSwapped;
}

/** Structured deep clone into a fresh object graph. */
export function cloneGameState(src: GameState): GameState {
  return {
    tick: src.tick,
    phase: src.phase,
    phaseTimer: src.phaseTimer,
    serveTimer: src.serveTimer,
    players: [{ ...src.players[0] }, { ...src.players[1] }],
    shuttle: { ...src.shuttle },
    match: {
      scores: [src.match.scores[0], src.match.scores[1]],
      gamesWon: [src.match.gamesWon[0], src.match.gamesWon[1]],
      gameIndex: src.match.gameIndex,
      server: src.match.server,
      leftPlayer: src.match.leftPlayer,
      lastRallyWinner: src.match.lastRallyWinner,
      matchWinner: src.match.matchWinner,
      deciderSwapped: src.match.deciderSwapped,
    },
  };
}
