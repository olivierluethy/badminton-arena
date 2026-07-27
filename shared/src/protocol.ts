// Wire protocol shared by client and server. Control messages are compact JSON
// tagged by `t`; the high-frequency input and snapshot messages are kept lean.
// Versioned so mismatched builds fail fast.

import type { GameState, InputState, MatchConfig, PlayerId } from './types.js';

export const PROTOCOL_VERSION = 1;

// ---- Input bitmask <-> byte ------------------------------------------------
export const BIT_LEFT = 1;
export const BIT_RIGHT = 2;
export const BIT_JUMP = 4;
export const BIT_SMASH = 8;

export function encodeInput(i: InputState): number {
  return (
    (i.left ? BIT_LEFT : 0) |
    (i.right ? BIT_RIGHT : 0) |
    (i.jump ? BIT_JUMP : 0) |
    (i.smash ? BIT_SMASH : 0)
  );
}

export function decodeInput(mask: number, out: InputState): InputState {
  out.left = (mask & BIT_LEFT) !== 0;
  out.right = (mask & BIT_RIGHT) !== 0;
  out.jump = (mask & BIT_JUMP) !== 0;
  out.smash = (mask & BIT_SMASH) !== 0;
  return out;
}

// ---- Client → Server -------------------------------------------------------
export interface HelloMsg {
  t: 'hello';
  v: number;
  /** Persisted client id for reconnecting to an in-progress match. */
  reconnectId?: string;
  /** Room code to rejoin, paired with reconnectId. */
  reconnectRoom?: string;
}
export interface QueueMsg {
  t: 'queue';
}
export interface CancelQueueMsg {
  t: 'cancelQueue';
}
export interface CreateRoomMsg {
  t: 'createRoom';
}
export interface JoinRoomMsg {
  t: 'joinRoom';
  code: string;
}
export interface InputMsg {
  t: 'input';
  seq: number;
  tick: number;
  mask: number;
}
export interface PingMsg {
  t: 'ping';
  id: number;
}
export interface RematchMsg {
  t: 'rematch';
  vote: boolean;
}
export interface LeaveMsg {
  t: 'leave';
}

export type ClientMsg =
  | HelloMsg
  | QueueMsg
  | CancelQueueMsg
  | CreateRoomMsg
  | JoinRoomMsg
  | InputMsg
  | PingMsg
  | RematchMsg
  | LeaveMsg;

// ---- Server → Client -------------------------------------------------------
export interface WelcomeMsg {
  t: 'welcome';
  clientId: string;
  v: number;
}
export interface QueuedMsg {
  t: 'queued';
}
export interface RoomCreatedMsg {
  t: 'roomCreated';
  code: string;
}
export interface RoomStateMsg {
  t: 'roomState';
  code: string;
  playerCount: number;
}
export interface MatchStartMsg {
  t: 'matchStart';
  slot: PlayerId; // which player you control
  config: MatchConfig;
  names: [string, string];
  serverTick: number;
  code: string; // room code (for reconnect)
}
export interface SnapshotMsg {
  t: 'snapshot';
  state: GameState;
  lastSeq: [number, number]; // last processed input seq per slot
  serverTime: number;
}
export interface PongMsg {
  t: 'pong';
  id: number;
  serverTime: number;
}
export interface OpponentGoneMsg {
  t: 'opponentGone';
  graceMs: number;
}
export interface OpponentBackMsg {
  t: 'opponentBack';
}
export interface MatchEndMsg {
  t: 'matchEnd';
  winner: PlayerId;
  forfeit: boolean;
}
export interface RematchStateMsg {
  t: 'rematchState';
  votes: [boolean, boolean];
}
export interface ErrorMsg {
  t: 'error';
  code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'VERSION' | 'BAD_STATE';
  msg: string;
}

export type ServerMsg =
  | WelcomeMsg
  | QueuedMsg
  | RoomCreatedMsg
  | RoomStateMsg
  | MatchStartMsg
  | SnapshotMsg
  | PongMsg
  | OpponentGoneMsg
  | OpponentBackMsg
  | MatchEndMsg
  | RematchStateMsg
  | ErrorMsg;

export function encodeMsg(m: ClientMsg | ServerMsg): string {
  return JSON.stringify(m);
}

export function decodeMsg<T = ClientMsg | ServerMsg>(data: string): T {
  return JSON.parse(data) as T;
}
