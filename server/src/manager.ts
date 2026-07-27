// Connection registry, quick-match queue, private rooms, reconnect grace and
// rematch flow. Room state lives entirely in memory.

import type { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  encodeMsg,
  type ClientMsg,
  type MatchConfig,
  type PlayerId,
  type ServerMsg,
} from '@badminton/shared';
import { Match, type MatchSink } from './match.js';

const RECONNECT_GRACE_MS = 20000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let idCounter = 1;
function genId(): string {
  return `c${(idCounter++).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class ClientConn {
  readonly id = genId();
  room: Room | null = null;
  slot: PlayerId | null = null;
  inQueue = false;

  constructor(readonly ws: WebSocket) {}

  send(msg: ServerMsg): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(encodeMsg(msg));
  }
}

class Room implements MatchSink {
  conns: [ClientConn | null, ClientConn | null] = [null, null];
  clientIds: [string | null, string | null] = [null, null];
  match: Match | null = null;
  rematchVotes: [boolean, boolean] = [false, false];
  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    readonly isPrivate: boolean,
    private manager: Manager,
  ) {}

  playerCount(): number {
    return (this.conns[0] ? 1 : 0) + (this.conns[1] ? 1 : 0);
  }

  seat(conn: ClientConn, slot: PlayerId): void {
    this.conns[slot] = conn;
    this.clientIds[slot] = conn.id;
    conn.room = this;
    conn.slot = slot;
  }

  sendTo(slot: PlayerId, msg: ServerMsg): void {
    this.conns[slot]?.send(msg);
  }

  broadcast(msg: ServerMsg): void {
    this.conns[0]?.send(msg);
    this.conns[1]?.send(msg);
  }

  startMatch(config: MatchConfig): void {
    this.rematchVotes = [false, false];
    this.match = new Match(config, ['P1', 'P2'], this);
    for (let s = 0 as PlayerId; s < 2; s = (s + 1) as PlayerId) {
      this.sendTo(s, {
        t: 'matchStart',
        slot: s,
        config,
        names: ['P1', 'P2'],
        serverTick: 0,
        code: this.code,
      });
    }
    this.match.start();
  }

  onMatchEnd(_winner: PlayerId, _forfeit: boolean): void {
    // Keep the room alive for rematch voting; it is cleaned up on leave/empty.
  }

  handleRematch(slot: PlayerId, vote: boolean): void {
    this.rematchVotes[slot] = vote;
    this.broadcast({ t: 'rematchState', votes: [this.rematchVotes[0], this.rematchVotes[1]] });
    if (this.rematchVotes[0] && this.rematchVotes[1]) {
      // Alternate first server for fairness.
      const firstServer: PlayerId = Math.random() < 0.5 ? 0 : 1;
      this.startMatch({ firstServer, leftPlayer: 0 });
    }
  }

  handleDisconnect(conn: ClientConn): void {
    const slot = conn.slot;
    if (slot === null) return;
    if (this.conns[slot] !== conn) return;
    this.conns[slot] = null;

    if (!this.match || this.match.isEnded()) {
      // Not in an active match — drop the seat and maybe close the room.
      this.clientIds[slot] = null;
      if (this.playerCount() === 0) this.manager.removeRoom(this.code);
      return;
    }

    // Active match: freeze and start the reconnect grace window.
    this.match.setFrozen(true);
    const other = (1 - slot) as PlayerId;
    this.sendTo(other, { t: 'opponentGone', graceMs: RECONNECT_GRACE_MS });
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      // Grace expired → remaining player wins by forfeit.
      if (this.match && !this.match.isEnded()) this.match.forfeit(other);
      this.clientIds[slot] = null;
      if (this.playerCount() === 0) this.manager.removeRoom(this.code);
    }, RECONNECT_GRACE_MS);
  }

  handleReconnect(conn: ClientConn, slot: PlayerId): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.seat(conn, slot);
    if (this.match) {
      conn.send({
        t: 'matchStart',
        slot,
        config: { firstServer: this.match.state.match.server, leftPlayer: this.match.state.match.leftPlayer },
        names: ['P1', 'P2'],
        serverTick: this.match.state.tick,
        code: this.code,
      });
      this.match.setFrozen(false);
    }
    this.sendTo((1 - slot) as PlayerId, { t: 'opponentBack' });
  }

  /** Find a disconnected slot matching a reconnect id. */
  reconnectSlot(reconnectId: string): PlayerId | null {
    if (this.clientIds[0] === reconnectId && this.conns[0] === null) return 0;
    if (this.clientIds[1] === reconnectId && this.conns[1] === null) return 1;
    return null;
  }

  freeSlot(): PlayerId | null {
    if (this.conns[0] === null && this.clientIds[0] === null) return 0;
    if (this.conns[1] === null && this.clientIds[1] === null) return 1;
    return null;
  }

  dispose(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.match?.stop();
  }
}

export class Manager {
  private clients = new Map<string, ClientConn>();
  private rooms = new Map<string, Room>();
  private waiting: ClientConn | null = null;

  addConnection(ws: WebSocket): ClientConn {
    const conn = new ClientConn(ws);
    this.clients.set(conn.id, conn);
    return conn;
  }

  removeRoom(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      room.dispose();
      this.rooms.delete(code);
    }
  }

  private genCode(): string {
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  handleMessage(conn: ClientConn, msg: ClientMsg): void {
    switch (msg.t) {
      case 'hello':
        this.onHello(conn, msg.v, msg.reconnectId, msg.reconnectRoom);
        break;
      case 'queue':
        this.onQueue(conn);
        break;
      case 'cancelQueue':
        if (this.waiting === conn) this.waiting = null;
        conn.inQueue = false;
        break;
      case 'createRoom':
        this.onCreateRoom(conn);
        break;
      case 'joinRoom':
        this.onJoinRoom(conn, msg.code.toUpperCase());
        break;
      case 'input':
        if (conn.room?.match && conn.slot !== null) {
          conn.room.match.setInput(conn.slot, msg.seq, msg.mask);
        }
        break;
      case 'ping':
        conn.send({ t: 'pong', id: msg.id, serverTime: Date.now() });
        break;
      case 'rematch':
        if (conn.room && conn.slot !== null) conn.room.handleRematch(conn.slot, msg.vote);
        break;
      case 'leave':
        this.leaveRoom(conn);
        break;
    }
  }

  private onHello(conn: ClientConn, v: number, reconnectId?: string, reconnectRoom?: string): void {
    if (v !== PROTOCOL_VERSION) {
      conn.send({ t: 'error', code: 'VERSION', msg: 'Client/server version mismatch. Please refresh.' });
      return;
    }
    conn.send({ t: 'welcome', clientId: conn.id, v: PROTOCOL_VERSION });

    // Attempt reconnect into an in-progress match.
    if (reconnectId && reconnectRoom) {
      const room = this.rooms.get(reconnectRoom.toUpperCase());
      const slot = room?.reconnectSlot(reconnectId);
      if (room && slot !== null && slot !== undefined) {
        room.handleReconnect(conn, slot);
      }
    }
  }

  private onQueue(conn: ClientConn): void {
    if (conn.room) return;
    if (this.waiting && this.waiting !== conn && this.waiting.ws.readyState === this.waiting.ws.OPEN) {
      const other = this.waiting;
      this.waiting = null;
      other.inQueue = false;
      const room = new Room(this.genCode(), false, this);
      this.rooms.set(room.code, room);
      room.seat(other, 0);
      room.seat(conn, 1);
      room.startMatch({ firstServer: 0, leftPlayer: 0 });
    } else {
      this.waiting = conn;
      conn.inQueue = true;
      conn.send({ t: 'queued' });
    }
  }

  private onCreateRoom(conn: ClientConn): void {
    if (conn.room) return;
    const room = new Room(this.genCode(), true, this);
    this.rooms.set(room.code, room);
    room.seat(conn, 0);
    conn.send({ t: 'roomCreated', code: room.code });
    conn.send({ t: 'roomState', code: room.code, playerCount: 1 });
  }

  private onJoinRoom(conn: ClientConn, code: string): void {
    if (conn.room) return;
    const room = this.rooms.get(code);
    if (!room) {
      conn.send({ t: 'error', code: 'ROOM_NOT_FOUND', msg: `No room “${code}”.` });
      return;
    }
    const slot = room.freeSlot();
    if (slot === null) {
      conn.send({ t: 'error', code: 'ROOM_FULL', msg: 'That room is full.' });
      return;
    }
    room.seat(conn, slot);
    room.broadcast({ t: 'roomState', code: room.code, playerCount: room.playerCount() });
    if (room.playerCount() === 2) {
      room.startMatch({ firstServer: 0, leftPlayer: 0 });
    }
  }

  private leaveRoom(conn: ClientConn): void {
    const room = conn.room;
    if (!room) return;
    conn.room = null;
    const slot = conn.slot;
    conn.slot = null;
    if (slot === null) return;
    // Treat an explicit leave during a live match as a forfeit.
    if (room.match && !room.match.isEnded()) {
      room.match.forfeit((1 - slot) as PlayerId);
    }
    room.conns[slot] = null;
    room.clientIds[slot] = null;
    if (room.playerCount() === 0) this.removeRoom(room.code);
  }

  handleClose(conn: ClientConn): void {
    if (this.waiting === conn) this.waiting = null;
    if (conn.room) conn.room.handleDisconnect(conn);
    this.clients.delete(conn.id);
  }
}
