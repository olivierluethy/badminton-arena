// Offline authoritative match driver (Single Player + Local Multiplayer). Runs
// the shared simulation locally at a fixed 60 Hz and renders with interpolation.
// Online mode uses its own controller (prediction/reconciliation) in net/.

import {
  createInitialState,
  copyGameState,
  step,
  NO_INPUT,
} from '@badminton/shared';
import type { GameState, InputState, MatchConfig, PlayerId, SimEvent } from '@badminton/shared';
import type { Viewport } from '../render/viewport.js';
import { Renderer } from '../render/renderer.js';
import { Effects } from '../render/effects.js';
import type { Sfx } from '../audio/sfx.js';
import { GameLoop } from './loop.js';
import { applyEvents, type BannerSink } from './eventFx.js';

export type InputFn = (state: GameState, out0: InputState, out1: InputState) => void;

export interface MatchHooks {
  onMatchOver?: (winner: PlayerId) => void;
  onFrame?: (state: GameState) => void;
  banners?: BannerSink;
}

export class MatchController {
  readonly state: GameState;
  private prev: GameState;
  readonly effects = new Effects();
  private renderer: Renderer;
  private loop: GameLoop;
  private events: SimEvent[] = [];
  private in0: InputState = { ...NO_INPUT };
  private in1: InputState = { ...NO_INPUT };
  private paused = false;
  private matchOverFired = false;

  constructor(
    vp: Viewport,
    private sfx: Sfx,
    private inputFn: InputFn,
    config: MatchConfig,
    private hooks: MatchHooks = {},
  ) {
    this.state = createInitialState(config);
    this.prev = createInitialState(config);
    copyGameState(this.prev, this.state);
    this.effects.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new Renderer(vp, this.effects);
    this.loop = new GameLoop(
      () => this.fixedStep(),
      (alpha, dt) => this.render(alpha, dt),
    );
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  setPaused(pause: boolean): void {
    if (pause && !this.paused) copyGameState(this.prev, this.state);
    this.paused = pause;
  }

  isPaused(): boolean {
    return this.paused;
  }

  private fixedStep(): void {
    if (this.paused) return;

    copyGameState(this.prev, this.state);
    this.inputFn(this.state, this.in0, this.in1);

    this.events.length = 0;
    step(this.state, this.in0, this.in1, this.events);
    applyEvents(this.events, this.effects, this.sfx, this.hooks.banners);

    // Shuttle trail while live.
    const s = this.state.shuttle;
    if (this.state.phase === 'rally' && !s.dead) {
      this.effects.pushTrail(s.x, s.y);
    } else if (this.state.phase !== 'rally') {
      this.effects.clearTrail();
    }

    this.effects.update(1 / 60);

    if (this.state.phase === 'matchOver' && !this.matchOverFired) {
      this.matchOverFired = true;
      const w = this.state.match.matchWinner;
      if (w !== null) this.hooks.onMatchOver?.(w);
    }
  }

  private render(alpha: number, dt: number): void {
    this.renderer.render(this.prev, this.state, this.paused ? 0 : alpha, dt);
    this.hooks.onFrame?.(this.state);
  }
}
