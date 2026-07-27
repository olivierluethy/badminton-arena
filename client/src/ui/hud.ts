// In-game HUD: the LED scoreboard (signature element), serve indicator +
// countdown, phase banners, mute/pause controls and an optional ping readout.
// The scoreboard is identity-fixed (A = warm on the left, B = cool on the right)
// so a player is recognisable across end swaps; the court shows the real ends.

import {
  GAMES_TO_WIN_MATCH,
  POINTS_TO_WIN_GAME,
} from '@badminton/shared';
import type { GameState } from '@badminton/shared';
import { el, clear } from './dom.js';
import type { BannerSink } from '../game/eventFx.js';

export interface HudOptions {
  nameA: string;
  nameB: string;
  onMute: () => void;
  onPause?: () => void;
  showPing?: boolean;
}

export class Hud implements BannerSink {
  readonly root: HTMLElement;
  private digitA!: HTMLElement;
  private digitB!: HTMLElement;
  private pipsA!: HTMLElement;
  private pipsB!: HTMLElement;
  private gameLabel!: HTMLElement;
  private chevron!: HTMLElement;
  private serveCount!: HTMLElement;
  private banner!: HTMLElement;
  private pingEl?: HTMLElement;
  private muteBtn!: HTMLButtonElement;

  private prevGamesA = -1;
  private prevGamesB = -1;

  constructor(private opts: HudOptions) {
    this.root = el('div', { class: 'hud-layer' });
    this.build();
  }

  private build(): void {
    this.digitA = el('div', { class: 'score-digit' }, '0');
    this.digitB = el('div', { class: 'score-digit' }, '0');
    this.pipsA = el('div', { class: 'pips' });
    this.pipsB = el('div', { class: 'pips' });

    const groupA = el(
      'div',
      { class: 'score-group a' },
      el('div', {}, el('div', { class: 'score-name' }, this.opts.nameA), this.pipsA),
      this.digitA,
    );
    const groupB = el(
      'div',
      { class: 'score-group b right' },
      el('div', {}, el('div', { class: 'score-name' }, this.opts.nameB), this.pipsB),
      this.digitB,
    );

    this.gameLabel = el('div', { class: 'game-label' }, 'GAME 1');
    this.chevron = el('span', { class: 'serve-chevron a' }, '◄');
    this.serveCount = el('span', { class: 'serve-count' }, '');
    const center = el(
      'div',
      { class: 'score-center' },
      this.gameLabel,
      el('div', { class: 'serve-row' }, this.chevron, this.serveCount),
    );

    const board = el('div', { class: 'led-scoreboard' }, groupA, center, groupB);
    const hud = el('div', { class: 'hud' }, board);

    this.muteBtn = el(
      'button',
      { class: 'icon-btn', title: 'Mute (M)', onClick: () => this.opts.onMute() },
      '🔊',
    );
    const controls = el('div', { class: 'hud-controls' }, this.muteBtn);
    if (this.opts.onPause) {
      controls.prepend(
        el(
          'button',
          { class: 'icon-btn', title: 'Pause (Esc)', onClick: () => this.opts.onPause!() },
          '⏸',
        ),
      );
    }

    this.banner = el('div', { class: 'banner' });

    this.root.append(hud, controls, this.banner);

    if (this.opts.showPing) {
      this.pingEl = el('div', { class: 'ping' }, '— ms');
      this.root.append(this.pingEl);
    }
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  private renderPips(container: HTMLElement, won: number, kit: 'a' | 'b'): void {
    clear(container);
    for (let i = 0; i < GAMES_TO_WIN_MATCH; i++) {
      container.append(el('div', { class: `pip ${i < won ? 'lit-' + kit : ''}` }));
    }
  }

  update(state: GameState): void {
    const m = state.match;
    this.digitA.textContent = String(m.scores[0]);
    this.digitB.textContent = String(m.scores[1]);

    if (m.gamesWon[0] !== this.prevGamesA) {
      this.renderPips(this.pipsA, m.gamesWon[0], 'a');
      this.prevGamesA = m.gamesWon[0];
    }
    if (m.gamesWon[1] !== this.prevGamesB) {
      this.renderPips(this.pipsB, m.gamesWon[1], 'b');
      this.prevGamesB = m.gamesWon[1];
    }

    this.gameLabel.textContent = `GAME ${m.gameIndex + 1}`;

    // Serve indicator points to the serving player's group.
    const serverIsA = m.server === 0;
    this.chevron.textContent = serverIsA ? '◄' : '►';
    this.chevron.className = `serve-chevron ${serverIsA ? 'a' : 'b'}`;

    if (state.phase === 'serve') {
      this.serveCount.textContent = String(Math.ceil(state.serveTimer));
    } else {
      const highest = Math.max(m.scores[0], m.scores[1]);
      this.serveCount.textContent = highest >= POINTS_TO_WIN_GAME - 1 ? 'GP' : '';
    }
  }

  updatePing(rttMs: number): void {
    if (!this.pingEl) return;
    const r = Math.round(rttMs);
    this.pingEl.textContent = `${r} ms`;
    this.pingEl.className = `ping ${r < 60 ? 'good' : r < 120 ? 'ok' : 'bad'}`;
  }

  showBanner(kind: 'point' | 'game' | 'match', player: number): void {
    const text = kind === 'point' ? 'POINT!' : kind === 'game' ? 'GAME!' : 'MATCH!';
    if (kind === 'point') return; // points are frequent; reserve banners for game/match
    this.banner.textContent = text;
    this.banner.className = `banner ${player === 0 ? 'a' : 'b'}`;
    // Force reflow to restart the animation.
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  mount(container: HTMLElement): void {
    container.append(this.root);
  }

  unmount(): void {
    this.root.remove();
  }
}
