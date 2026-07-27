// Online match controller. Server-authoritative with:
//  - client-side prediction for the local player (input ring buffer, rewind to
//    the authoritative state, replay unacknowledged inputs via shared stepPlayer)
//  - entity interpolation for the remote player and the shuttle (100 ms render
//    delay, extrapolation capped at 150 ms)
// Juice/audio are derived by diffing consecutive authoritative snapshots.

import {
  DT,
  NO_INPUT,
  cloneGameState,
  copyGameState,
  decodeInput,
  encodeInput,
  stepPlayer,
} from '@badminton/shared';
import type {
  GameState,
  InputState,
  PlayerId,
  PlayerState,
  ServerMsg,
  SnapshotMsg,
} from '@badminton/shared';
import type { Viewport } from '../render/viewport.js';
import { Renderer } from '../render/renderer.js';
import { Effects } from '../render/effects.js';
import type { Sfx } from '../audio/sfx.js';
import { GameLoop } from '../game/loop.js';
import type { Hud } from '../ui/hud.js';
import type { NetConnection } from './connection.js';
import { CENTER_X, FLOOR_Y } from '@badminton/shared';

const INTERP_DELAY = 0.1; // seconds of render delay
const EXTRAP_CAP = 0.15; // max seconds to extrapolate past the last snapshot
const BUFFER_MS = 1500;

interface Snap {
  recvTime: number;
  state: GameState;
}

export interface OnlineCallbacks {
  onMatchEnd?: (winner: PlayerId, forfeit: boolean) => void;
  onOpponentGone?: (graceMs: number) => void;
  onOpponentBack?: () => void;
}

function copyPlayerInto(dst: PlayerState, src: PlayerState): void {
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

export class OnlineController {
  private effects = new Effects();
  private renderer: Renderer;
  private loop: GameLoop;

  private snaps: Snap[] = [];
  private renderState: GameState | null = null;
  private predicted: PlayerState | null = null;
  private inputBuf: Array<{ seq: number; mask: number }> = [];
  private seqCounter = 0;
  private localInput: InputState = { ...NO_INPUT };
  private tmpInput: InputState = { ...NO_INPUT };
  private lastSnapState: GameState | null = null;
  private started = false;

  constructor(
    vp: Viewport,
    private sfx: Sfx,
    private net: NetConnection,
    readonly slot: PlayerId,
    private hud: Hud,
    private readInput: (out: InputState) => void,
    private callbacks: OnlineCallbacks = {},
  ) {
    this.effects.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new Renderer(vp, this.effects);
    this.loop = new GameLoop(
      () => this.fixedStep(),
      (_alpha, dt) => this.render(dt),
    );
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'snapshot':
        this.onSnapshot(msg);
        break;
      case 'opponentGone':
        this.callbacks.onOpponentGone?.(msg.graceMs);
        break;
      case 'opponentBack':
        this.callbacks.onOpponentBack?.();
        break;
      case 'matchEnd':
        if (msg.winner === this.slot) this.sfx.matchWon();
        this.callbacks.onMatchEnd?.(msg.winner, msg.forfeit);
        break;
      default:
        break;
    }
  }

  private onSnapshot(msg: SnapshotMsg): void {
    const state = cloneGameState(msg.state);
    const now = performance.now();
    this.snaps.push({ recvTime: now, state });
    while (this.snaps.length > 2 && now - this.snaps[0].recvTime > BUFFER_MS) this.snaps.shift();

    // Init render/prediction structures on first snapshot.
    if (!this.renderState) this.renderState = cloneGameState(state);
    if (!this.predicted) {
      this.predicted = { ...state.players[this.slot] };
      this.started = true;
    }

    // Juice from the diff against the previous snapshot.
    this.diffJuice(this.lastSnapState, state);
    this.lastSnapState = state;

    // Reconcile local prediction.
    const ack = msg.lastSeq[this.slot];
    while (this.inputBuf.length && this.inputBuf[0].seq <= ack) this.inputBuf.shift();
    copyPlayerInto(this.predicted, state.players[this.slot]);
    for (const buffered of this.inputBuf) {
      decodeInput(buffered.mask, this.tmpInput);
      stepPlayer(this.predicted, this.tmpInput, DT);
    }
  }

  private fixedStep(): void {
    if (!this.started || !this.predicted) return;
    this.readInput(this.localInput);
    const seq = ++this.seqCounter;
    const mask = encodeInput(this.localInput);
    this.inputBuf.push({ seq, mask });
    if (this.inputBuf.length > 240) this.inputBuf.shift();
    this.net.send({ t: 'input', seq, tick: this.lastSnapState?.tick ?? 0, mask });

    // Predict this input forward immediately.
    stepPlayer(this.predicted, this.localInput, DT);
  }

  private render(frameDt: number): void {
    this.effects.update(frameDt);
    if (!this.renderState || this.snaps.length === 0 || !this.predicted) return;

    const newest = this.snaps[this.snaps.length - 1];
    copyGameState(this.renderState, newest.state);

    // Interpolate remote player + shuttle at (now - delay).
    const T = performance.now() - INTERP_DELAY * 1000;
    this.interpolate(this.renderState, T);

    // Local player: use predicted kinematics, keep snapshot pose/anim.
    const lp = this.renderState.players[this.slot];
    lp.x = this.predicted.x;
    lp.y = this.predicted.y;
    lp.vx = this.predicted.vx;
    lp.vy = this.predicted.vy;
    lp.onGround = this.predicted.onGround;
    lp.facing = this.predicted.facing;

    const rs = this.renderState;
    if (rs.phase === 'rally' && !rs.shuttle.dead) {
      this.effects.pushTrail(rs.shuttle.x, rs.shuttle.y);
    } else if (rs.phase !== 'rally') {
      this.effects.clearTrail();
    }

    this.renderer.render(rs, rs, 0, frameDt);
    this.hud.update(newest.state);
    this.hud.updatePing(this.net.rttMs);
  }

  /** Set the remote player + shuttle positions from the snapshot buffer at T. */
  private interpolate(rs: GameState, T: number): void {
    const n = this.snaps.length;
    const remote = (1 - this.slot) as PlayerId;
    if (n === 1) return; // nothing to interpolate against

    const first = this.snaps[0];
    const last = this.snaps[n - 1];

    if (T <= first.recvTime) {
      this.applyState(rs, first.state, remote, 0, first.state);
      return;
    }
    if (T >= last.recvTime) {
      // Extrapolate from the last snapshot, capped.
      const dt = Math.min((T - last.recvTime) / 1000, EXTRAP_CAP);
      const rp = last.state.players[remote];
      rs.players[remote].x = rp.x + rp.vx * dt;
      rs.players[remote].y = rp.y + rp.vy * dt;
      const sh = last.state.shuttle;
      if (!sh.dead) {
        rs.shuttle.x = sh.x + sh.vx * dt;
        rs.shuttle.y = sh.y + sh.vy * dt;
      }
      return;
    }
    // Find bracketing pair.
    for (let i = 0; i < n - 1; i++) {
      const a = this.snaps[i];
      const b = this.snaps[i + 1];
      if (T >= a.recvTime && T < b.recvTime) {
        const span = b.recvTime - a.recvTime;
        const t = span > 0 ? (T - a.recvTime) / span : 0;
        this.applyState(rs, a.state, remote, t, b.state);
        return;
      }
    }
  }

  private applyState(
    rs: GameState,
    a: GameState,
    remote: PlayerId,
    t: number,
    b: GameState,
  ): void {
    const ra = a.players[remote];
    const rb = b.players[remote];
    rs.players[remote].x = ra.x + (rb.x - ra.x) * t;
    rs.players[remote].y = ra.y + (rb.y - ra.y) * t;
    const sa = a.shuttle;
    const sb = b.shuttle;
    rs.shuttle.x = sa.x + (sb.x - sa.x) * t;
    rs.shuttle.y = sa.y + (sb.y - sa.y) * t;
    rs.shuttle.vx = sb.vx;
    rs.shuttle.vy = sb.vy;
  }

  private diffJuice(prev: GameState | null, cur: GameState): void {
    if (!prev) return;

    // Hit / smash — shuttle changed hands.
    if (cur.shuttle.lastHitBy !== prev.shuttle.lastHitBy && cur.shuttle.lastHitBy !== null) {
      const hitter = cur.shuttle.lastHitBy;
      const strong = cur.players[hitter].lastSwingWasSmash;
      if (strong) {
        this.sfx.smash();
        this.effects.spawnFlash(cur.shuttle.x, cur.shuttle.y, true);
        this.effects.spawnHitSparks(cur.shuttle.x, cur.shuttle.y, true);
        this.effects.addShake(6);
      } else {
        this.sfx.hit();
        this.effects.spawnFlash(cur.shuttle.x, cur.shuttle.y, false);
        this.effects.spawnHitSparks(cur.shuttle.x, cur.shuttle.y, false);
        this.effects.addShake(1.5);
      }
    }

    // Net touch.
    if (cur.shuttle.netted && !prev.shuttle.netted) {
      this.sfx.netTouch();
      this.effects.kickNet(cur.shuttle.x < CENTER_X ? -1 : 1, 90);
    }

    // Floor bounce.
    if (cur.shuttle.dead && !prev.shuttle.dead) {
      this.sfx.bounce();
      this.effects.spawnDust(cur.shuttle.x, FLOOR_Y, cur.shuttle.x < CENTER_X ? 1 : -1, 10);
    }

    // Serve.
    if (prev.phase === 'serve' && cur.phase === 'rally') this.sfx.serve();

    // Scoring.
    for (let p = 0 as PlayerId; p < 2; p = (p + 1) as PlayerId) {
      if (cur.match.scores[p] > prev.match.scores[p] && cur.phase === 'pointScored') {
        this.sfx.point();
      }
      if (cur.match.gamesWon[p] > prev.match.gamesWon[p]) {
        this.sfx.gameWon();
        this.hud.showBanner('game', p);
        this.effects.addShake(4);
      }
    }
  }
}
