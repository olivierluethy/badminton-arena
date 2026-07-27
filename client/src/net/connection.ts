// WebSocket lifecycle for the client: connect, send typed messages, measure RTT
// via ping/pong, and persist a reconnect id so an interrupted match can resume.

import {
  PROTOCOL_VERSION,
  decodeMsg,
  encodeMsg,
  type ClientMsg,
  type ServerMsg,
} from '@badminton/shared';

const LS_CLIENT_ID = 'ba_client_id';
const SS_ROOM = 'ba_room';

export type ServerMsgHandler = (msg: ServerMsg) => void;

export class NetConnection {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingId = 0;
  private pingSentAt = new Map<number, number>();
  rttMs = 0;

  clientId: string | null = null;
  onMessage: ServerMsgHandler = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  connect(): void {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      const reconnectId = localStorage.getItem(LS_CLIENT_ID) ?? undefined;
      const reconnectRoom = sessionStorage.getItem(SS_ROOM) ?? undefined;
      this.send({ t: 'hello', v: PROTOCOL_VERSION, reconnectId, reconnectRoom });
      this.startPing();
      this.onOpen();
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = decodeMsg<ServerMsg>(String(ev.data));
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        this.clientId = msg.clientId;
        localStorage.setItem(LS_CLIENT_ID, msg.clientId);
      } else if (msg.t === 'pong') {
        const sent = this.pingSentAt.get(msg.id);
        if (sent !== undefined) {
          this.rttMs = performance.now() - sent;
          this.pingSentAt.delete(msg.id);
        }
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      this.stopPing();
      this.onClose();
    };
    ws.onerror = () => {
      /* onclose will follow */
    };
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMsg(msg));
    }
  }

  rememberRoom(code: string): void {
    sessionStorage.setItem(SS_ROOM, code);
  }

  forgetRoom(): void {
    sessionStorage.removeItem(SS_ROOM);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      const id = ++this.pingId;
      this.pingSentAt.set(id, performance.now());
      this.send({ t: 'ping', id });
    }, 1000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  close(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
