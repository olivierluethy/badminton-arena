// Rally resolution, scoring and match progression. Pure functions over
// GameState — identical in all three modes because this is the only rules code.

import {
  DECIDER_SWAP_SCORE,
  FLOOR_Y,
  GAME_FREEZE_TIME,
  GAME_POINT_CAP,
  GAMES_TO_WIN_MATCH,
  CENTER_X,
  LEFT_BASELINE,
  RIGHT_BASELINE,
  MATCH_FREEZE_TIME,
  POINT_FREEZE_TIME,
  POINTS_TO_WIN_GAME,
  SERVE_SHUTTLE_Y_OFFSET,
  SERVE_WINDOW,
  WIN_BY,
} from './constants.js';
import type { GameState, PlayerId, PlayerState, Side, SimEvent } from './types.js';
import { racketCenter } from './physics.js';

export function other(id: PlayerId): PlayerId {
  return (1 - id) as PlayerId;
}

/** The player currently defending a given side. */
export function playerOnSide(state: GameState, side: Side): PlayerState {
  return state.players[0].side === side ? state.players[0] : state.players[1];
}

/** True while the third (deciding) game is being played. */
export function isDecidingGame(state: GameState): boolean {
  return state.match.gameIndex === 2;
}

/** Has `winner` just won the current game? */
function gameIsWon(winnerScore: number, loserScore: number): boolean {
  if (winnerScore >= GAME_POINT_CAP) return true;
  return winnerScore >= POINTS_TO_WIN_GAME && winnerScore - loserScore >= WIN_BY;
}

/**
 * Award the rally to `winner`: bump score, grant serve, then decide whether the
 * game/match ended and set the appropriate freeze phase. Mutates state, pushes
 * events. The phase-timer expiry (in simulation.ts) drives the next transition.
 */
export function awardRally(state: GameState, winner: PlayerId, events: SimEvent[]): void {
  const m = state.match;
  m.scores[winner] += 1;
  m.lastRallyWinner = winner;
  m.server = winner; // rally winner serves next

  events.push({ type: 'pointScored', player: winner });

  const ws = m.scores[winner];
  const ls = m.scores[other(winner)];

  if (gameIsWon(ws, ls)) {
    m.gamesWon[winner] += 1;
    events.push({ type: 'gameWon', player: winner });

    if (m.gamesWon[winner] >= GAMES_TO_WIN_MATCH) {
      m.matchWinner = winner;
      events.push({ type: 'matchWon', player: winner });
      state.phase = 'matchOver';
      state.phaseTimer = MATCH_FREEZE_TIME;
    } else {
      state.phase = 'gameOver';
      state.phaseTimer = GAME_FREEZE_TIME;
    }
  } else {
    state.phase = 'pointScored';
    state.phaseTimer = POINT_FREEZE_TIME;
  }
}

/**
 * Decide the rally from where the shuttle hit the floor.
 * - Out of bounds (beyond a baseline): the last hitter hit it out → they lose.
 * - In bounds: it landed in one player's half → that player loses.
 * If nobody has hit it yet (shouldn't happen post-serve) the serving side loses.
 */
export function resolveFloorContact(state: GameState, events: SimEvent[]): void {
  const s = state.shuttle;
  events.push({ type: 'bounce', x: s.x, y: FLOOR_Y });

  const landedSide: Side = s.x < CENTER_X ? 'left' : 'right';
  const defender = playerOnSide(state, landedSide);
  const outOfBounds = s.x < LEFT_BASELINE || s.x > RIGHT_BASELINE;

  // Default: it landed in the defender's half → the defender loses the rally.
  let loser: PlayerId = defender.id;

  if (s.netted && s.lastHitBy !== null) {
    // Netted: deflected into the hitter's half → the hitter loses.
    loser = s.lastHitBy;
  } else if (outOfBounds && s.lastHitBy !== null) {
    // Hit long past a baseline → the last hitter put it out → they lose.
    loser = s.lastHitBy;
  }

  awardRally(state, other(loser), events);
}

/** Swap which player defends which end (between games / mid-decider). */
export function swapEnds(state: GameState, events: SimEvent[]): void {
  const m = state.match;
  m.leftPlayer = other(m.leftPlayer);
  for (const p of state.players) {
    p.side = m.leftPlayer === p.id ? 'left' : 'right';
  }
  events.push({ type: 'endSwap' });
}

/** Position both players and the (held) shuttle for a serve. */
export function setupServe(state: GameState): void {
  state.phase = 'serve';
  state.serveTimer = SERVE_WINDOW;
  state.shuttle.dead = false;
  state.shuttle.netted = false;
  state.shuttle.lastHitBy = null;
  state.shuttle.sinceHit = 0;
  state.shuttle.vx = 0;
  state.shuttle.vy = 0;

  for (const p of state.players) {
    const ready = p.side === 'left' ? CENTER_X - 230 : CENTER_X + 230;
    p.x = ready;
    p.y = FLOOR_Y;
    p.vx = 0;
    p.vy = 0;
    p.onGround = true;
    p.diveTimer = 0;
    p.swingTimer = 0;
    p.anim = 'idle';
    p.prevJump = true; // require a fresh press to serve/jump
    p.prevSmash = true;
  }

  // Peg the shuttle to the server's racket, lifted for an underhand serve.
  const server = state.players[state.match.server];
  const r = racketCenter(server);
  state.shuttle.x = r.x;
  state.shuttle.y = server.y - SERVE_SHUTTLE_Y_OFFSET;
}

/** Begin the next game: advance index, reset scores, swap ends. */
export function beginNextGame(state: GameState, events: SimEvent[]): void {
  const m = state.match;
  m.gameIndex += 1;
  m.scores[0] = 0;
  m.scores[1] = 0;
  m.deciderSwapped = false;
  swapEnds(state, events);
  setupServe(state);
}

/**
 * In the deciding game, swap ends the first time either player reaches 6.
 * Call at point-scored resolution. Returns true if a swap happened.
 */
export function maybeDeciderSwap(state: GameState, events: SimEvent[]): boolean {
  const m = state.match;
  if (!isDecidingGame(state) || m.deciderSwapped) return false;
  if (m.scores[0] >= DECIDER_SWAP_SCORE || m.scores[1] >= DECIDER_SWAP_SCORE) {
    m.deciderSwapped = true;
    swapEnds(state, events);
    return true;
  }
  return false;
}

export const POINT_FREEZE = POINT_FREEZE_TIME;
export const GAME_FREEZE = GAME_FREEZE_TIME;
export const MATCH_FREEZE = MATCH_FREEZE_TIME;
