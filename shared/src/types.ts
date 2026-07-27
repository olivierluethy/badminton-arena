// Core data types for the shared simulation. The simulation is a pure function
// of (state, inputPlayer0, inputPlayer1) → state, so every type here is plain
// data with no methods and no references to DOM/Node APIs.

export type Side = 'left' | 'right';
export type PlayerId = 0 | 1;

/** Per-tick input. Encoded to a single byte on the wire (see protocol.ts). */
export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  smash: boolean;
}

export const NO_INPUT: InputState = { left: false, right: false, jump: false, smash: false };

/** Discrete animation/pose state a player figure is in. Drives the renderer. */
export type PlayerAnim =
  | 'idle'
  | 'run'
  | 'jump'
  | 'swing'
  | 'smash'
  | 'dive'
  | 'celebrate'
  | 'slump';

export interface PlayerState {
  id: PlayerId;
  side: Side;
  /** Feet position. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** +1 faces right, -1 faces left (toward the opponent's side). */
  facing: number;
  /** Seconds remaining on an active swing animation (0 = not swinging). */
  swingTimer: number;
  /** Seconds remaining on an active dive lunge (0 = not diving). */
  diveTimer: number;
  /** Whether smash was held on the most recent swing (drives pose + sfx). */
  lastSwingWasSmash: boolean;
  /** Previous-tick input edges, kept in state so netcode replay stays exact. */
  prevJump: boolean;
  prevSmash: boolean;
  anim: PlayerAnim;
  /** Free-running phase clock for cyclic poses (run cycle etc.), in seconds. */
  animClock: number;
}

export interface ShuttleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** true once the shuttle is dead (touched floor/net-settled); frozen. */
  dead: boolean;
  /** Player who last struck the shuttle, or null before first contact. */
  lastHitBy: PlayerId | null;
  /** Ticks since last struck — gates re-contact and drives the trail. */
  sinceHit: number;
  /** Set when the shuttle has been deflected by the net this rally. */
  netted: boolean;
}

export type RallyPhase =
  | 'serve' // waiting for the server to put the shuttle in play
  | 'rally' // shuttle live
  | 'pointScored' // brief freeze after a point
  | 'gameOver' // freeze after a game (before end swap / next game)
  | 'matchOver'; // match finished

export interface MatchState {
  /** Points in the current game, indexed by PlayerId. */
  scores: [number, number];
  /** Games won so far, indexed by PlayerId. */
  gamesWon: [number, number];
  /** Zero-based index of the current game (0,1,2). */
  gameIndex: number;
  /** Which player currently serves. */
  server: PlayerId;
  /** Which player is on the left side this game. */
  leftPlayer: PlayerId;
  /** Winner of the last rally (for banners), or null. */
  lastRallyWinner: PlayerId | null;
  /** Winner of the match once decided, else null. */
  matchWinner: PlayerId | null;
  /** True in the deciding game once the mid-game end swap has happened. */
  deciderSwapped: boolean;
}

export interface GameState {
  /** Monotonic simulation tick since match start. */
  tick: number;
  phase: RallyPhase;
  /** Seconds remaining in the current phase freeze (point/game/match). */
  phaseTimer: number;
  /** Seconds remaining in the serve window before auto-serve. */
  serveTimer: number;
  players: [PlayerState, PlayerState];
  shuttle: ShuttleState;
  match: MatchState;
}

/** Configuration for a fresh match. */
export interface MatchConfig {
  /** Which player serves the very first rally. */
  firstServer: PlayerId;
  /** Which player starts on the left. */
  leftPlayer: PlayerId;
}

/** Events emitted by a single `step` — consumed for sfx, effects, HUD banners. */
export type SimEventType =
  | 'hit'
  | 'smash'
  | 'serve'
  | 'netTouch'
  | 'bounce' // shuttle hit the floor
  | 'pointScored'
  | 'gameWon'
  | 'matchWon'
  | 'endSwap';

export interface SimEvent {
  type: SimEventType;
  /** World position where the event happened, when meaningful. */
  x?: number;
  y?: number;
  /** Player the event pertains to (hitter, point winner, …). */
  player?: PlayerId;
  /** True for smash hits — louder sfx / bigger shake. */
  strong?: boolean;
}

/** A snapshot is a serialisable slice of authoritative state sent to clients. */
export interface GameSnapshot extends GameState {
  /** Last input sequence the server processed, per client slot. */
  lastProcessedInput: [number, number];
}
