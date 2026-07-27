// Authoritative match: runs the shared simulation at a fixed 60 Hz for one room
// and broadcasts snapshots at 30 Hz. Inputs from both clients are buffered and
// applied per tick; the last processed sequence per slot is echoed for client
// reconciliation.

import {
  DT,
  TICK_RATE,
  createInitialState,
  decodeInput,
  step,
  NO_INPUT,
} from '@badminton/shared';
import type {
  GameState,
  InputState,
  MatchConfig,
  PlayerId,
  ServerMsg,
  SimEvent,
} from '@badminton/shared';

export interface MatchSink {
  /** Send to a slot's current connection (may be absent during disconnect). */
  sendTo(slot: PlayerId, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  onMatchEnd(winner: PlayerId, forfeit: boolean): void;
}

const SNAPSHOT_EVERY = TICK_RATE / 30; // 2 sim ticks per snapshot

export class Match {
  readonly state: GameState;
  private latest: Array<{ seq: number; mask: number }> = [
    { seq: 0, mask: 0 },
    { seq: 0, mask: 0 },
  ];
  private lastSeq: [number, number] = [0, 0];
  private in0: InputState = { ...NO_INPUT };
  private in1: InputState = { ...NO_INPUT };
  private events: SimEvent[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private acc = 0;
  private frozen = false;
  private ended = false;

  constructor(
    config: MatchConfig,
    readonly names: [string, string],
    private sink: MatchSink,
  ) {
    this.state = createInitialState(config);
  }

  start(): void {
    if (this.timer) return;
    this.lastTime = Date.now();
    this.acc = 0;
    this.timer = setInterval(() => this.frame(), Math.round(1000 / TICK_RATE));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    // Avoid a huge catch-up burst when unfreezing.
    if (!frozen) {
      this.lastTime = Date.now();
      this.acc = 0;
    }
  }

  setInput(slot: PlayerId, seq: number, mask: number): void {
    // Keep only the most recent input per slot.
    if (seq >= this.latest[slot].seq) {
      this.latest[slot].seq = seq;
      this.latest[slot].mask = mask;
    }
  }

  private frame(): void {
    if (this.ended) return;
    const now = Date.now();
    this.acc += (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (this.acc > 0.25) this.acc = 0.25; // clamp

    if (this.frozen) {
      this.acc = 0;
      return;
    }

    while (this.acc >= DT) {
      this.stepOnce();
      this.acc -= DT;
      if (this.ended) break;
    }
  }

  private stepOnce(): void {
    decodeInput(this.latest[0].mask, this.in0);
    decodeInput(this.latest[1].mask, this.in1);
    this.lastSeq[0] = this.latest[0].seq;
    this.lastSeq[1] = this.latest[1].seq;

    this.events.length = 0;
    step(this.state, this.in0, this.in1, this.events);

    if (this.state.tick % SNAPSHOT_EVERY === 0) this.broadcastSnapshot();

    if (this.state.phase === 'matchOver' && !this.ended) {
      this.ended = true;
      const w = this.state.match.matchWinner;
      if (w !== null) {
        this.sink.broadcast({ t: 'matchEnd', winner: w, forfeit: false });
        this.sink.onMatchEnd(w, false);
      }
      this.stop();
    }
  }

  private broadcastSnapshot(): void {
    this.sink.broadcast({
      t: 'snapshot',
      state: this.state,
      lastSeq: [this.lastSeq[0], this.lastSeq[1]],
      serverTime: Date.now(),
    });
  }

  /** End the match by forfeit (opponent gave up / grace expired). */
  forfeit(winner: PlayerId): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.sink.broadcast({ t: 'matchEnd', winner, forfeit: true });
    this.sink.onMatchEnd(winner, true);
  }

  isEnded(): boolean {
    return this.ended;
  }
}
