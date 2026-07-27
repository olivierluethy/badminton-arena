// App shell + screen state machine. Owns the viewport, audio, input and the
// active match controller, and swaps between menus and in-game HUD.

import { BotBrain, type Difficulty, type GameState, type PlayerId } from '@badminton/shared';
import { createViewport, resizeViewport, type Viewport } from './render/viewport.js';
import { Sfx } from './audio/sfx.js';
import { Keyboard } from './input/keyboard.js';
import { MatchController, type InputFn } from './game/matchController.js';
import { Hud } from './ui/hud.js';
import { el, clear, button } from './ui/dom.js';

type Mode = 'single' | 'local' | 'online';

export class App {
  private ui: HTMLElement;
  private vp: Viewport;
  private sfx = new Sfx();
  private keyboard = new Keyboard();

  private controller: MatchController | null = null;
  private hud: Hud | null = null;

  private primaryAction: (() => void) | null = null;
  private muted = false;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.ui = ui;
    this.vp = createViewport(canvas);
    window.addEventListener('resize', () => resizeViewport(this.vp));

    this.keyboard.attach({
      mute: () => this.toggleMute(),
      pause: () => this.handlePauseKey(),
      confirm: () => this.primaryAction?.(),
    });
    const resume = (): void => this.sfx.resume();
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('pointerdown', resume, { once: true });
  }

  start(): void {
    this.showTitle();
  }

  // ---- Screen helpers ---------------------------------------------------
  private setScreen(node: HTMLElement, primary?: () => void): void {
    this.teardownMatch();
    clear(this.ui);
    this.ui.append(node);
    this.primaryAction = primary ?? null;
    this.keyboard.setEnabled(false);
  }

  private toggleMute(): void {
    this.muted = this.sfx.toggleMute();
    this.hud?.setMuted(this.muted);
  }

  private handlePauseKey(): void {
    if (this.controller && this.controller instanceof MatchController) {
      if (this.controller.isPaused()) this.resumeGame();
      else this.pauseGame();
    }
  }

  // ---- Title ------------------------------------------------------------
  private showTitle(): void {
    const play = button('Play', () => this.showModeSelect(), 'btn btn--lg');
    const help = button('Controls', () => this.showHelp(() => this.showTitle()), 'btn btn--ghost');
    const screen = el(
      'div',
      { class: 'screen' },
      el(
        'h1',
        { class: 'wordmark' },
        el('span', { class: 'line-1' }, 'Badminton'),
        el('span', { class: 'line-2' }, 'Arena'),
      ),
      el('p', { class: 'tagline' }, 'Floodlit · Fast · First to 11'),
      el('div', { class: 'menu-list' }, play, help),
      el('p', { class: 'muted' }, 'Press Enter to play'),
    );
    this.setScreen(screen, () => this.showModeSelect());
  }

  // ---- Mode select ------------------------------------------------------
  private showModeSelect(): void {
    const card = (icon: string, title: string, sub: string, onClick: () => void, disabled = false) =>
      el(
        'button',
        { class: `mode-card${disabled ? '' : ''}`, onClick: disabled ? () => {} : onClick, disabled },
        el('span', { class: 'icon' }, icon),
        el('span', { class: 'title' }, title),
        el('span', { class: 'sub' }, sub),
      );

    const cards = el(
      'div',
      { class: 'card-row' },
      card('🤖', 'Single', 'vs. CPU', () => this.showDifficulty()),
      card('👥', 'Local', '2 players, 1 keyboard', () => this.startLocal()),
      card('🌐', 'Online', 'Quick match / room', () => this.showLobby()),
    );

    const screen = el(
      'div',
      { class: 'screen' },
      el('div', {}, el('p', { class: 'eyebrow' }, 'Choose a mode'), el('h2', { class: 'heading' }, 'How do you play?')),
      cards,
      button('Back', () => this.showTitle(), 'link-btn'),
    );
    this.setScreen(screen);
  }

  // ---- Difficulty -------------------------------------------------------
  private showDifficulty(): void {
    let selected: Difficulty = 'normal';
    const makeCard = (d: Difficulty, label: string, sub: string) => {
      const c = el(
        'button',
        {
          class: `mode-card diff--${d}${d === selected ? ' selected' : ''}`,
          onClick: () => {
            selected = d;
            [...cards.children].forEach((ch) => ch.classList.remove('selected'));
            c.classList.add('selected');
          },
        },
        el('span', { class: 'title' }, label),
        el('span', { class: 'sub' }, sub),
      );
      return c;
    };
    const cards = el(
      'div',
      { class: 'card-row' },
      makeCard('easy', 'Easy', 'Relaxed rallies'),
      makeCard('normal', 'Normal', 'A real match'),
      makeCard('hard', 'Hard', 'Fast & ruthless'),
    );
    const go = () => this.startSingle(selected);
    const screen = el(
      'div',
      { class: 'screen' },
      el('div', {}, el('p', { class: 'eyebrow' }, 'Single player'), el('h2', { class: 'heading' }, 'Pick a difficulty')),
      cards,
      el('div', { class: 'row' }, button('Start', go, 'btn btn--lg'), button('Back', () => this.showModeSelect(), 'btn btn--ghost')),
    );
    this.setScreen(screen, go);
  }

  // ---- Help -------------------------------------------------------------
  private showHelp(back: () => void): void {
    const kb = (t: string) => el('span', { class: 'key' }, t);
    const grid = el(
      'div',
      { class: 'help-grid' },
      el('div', { class: 'help-section-title' }, 'Player 1 / You (WASD)'),
      el('div', {}, kb('A'), ' ', kb('D')),
      el('div', { class: 'muted' }, 'Move left / right'),
      el('div', {}, kb('W')),
      el('div', { class: 'muted' }, 'Jump · serve'),
      el('div', {}, kb('S')),
      el('div', { class: 'muted' }, 'Smash (air) · dive (ground)'),
      el('div', { class: 'help-section-title' }, 'Player 2 (Arrows)'),
      el('div', {}, kb('←'), ' ', kb('→')),
      el('div', { class: 'muted' }, 'Move left / right'),
      el('div', {}, kb('↑')),
      el('div', { class: 'muted' }, 'Jump · serve'),
      el('div', {}, kb('↓')),
      el('div', { class: 'muted' }, 'Smash · dive'),
      el('div', { class: 'help-section-title' }, 'General'),
      el('div', {}, kb('Esc')),
      el('div', { class: 'muted' }, 'Pause (offline)'),
      el('div', {}, kb('M')),
      el('div', { class: 'muted' }, 'Mute'),
      el('div', {}, kb('Enter')),
      el('div', { class: 'muted' }, 'Confirm menus'),
    );
    const scoring = el(
      'p',
      { class: 'muted' },
      'Contact-based hits: run into the shuttle with your racket. Hit high for flat drives and smashes, low to loft a clear. First to 11 (win by 2, cap 15), best of 3.',
    );
    const screen = el(
      'div',
      { class: 'screen screen--scrim' },
      el(
        'div',
        { class: 'panel' },
        el('p', { class: 'eyebrow' }, 'How to play'),
        el('h2', { class: 'heading' }, 'Controls & rules'),
        grid,
        scoring,
        button('Back', back, 'btn btn--block'),
      ),
    );
    this.setScreen(screen, back);
  }

  // ---- Offline matches --------------------------------------------------
  private startMatch(mode: Mode, inputFn: InputFn, nameA: string, nameB: string, showPause: boolean): void {
    this.teardownMatch();
    clear(this.ui);
    this.lastMode = mode;
    this.keyboard.setEnabled(true);

    const hud = new Hud({
      nameA,
      nameB,
      onMute: () => this.toggleMute(),
      onPause: showPause ? () => this.pauseGame() : undefined,
    });
    hud.setMuted(this.muted);
    hud.mount(this.ui);
    this.hud = hud;

    const controller = new MatchController(
      this.vp,
      this.sfx,
      inputFn,
      { firstServer: 0, leftPlayer: 0 },
      {
        banners: hud,
        onFrame: (state: GameState) => hud.update(state),
        onMatchOver: (winner: PlayerId) => this.onMatchOver(mode, winner, nameA, nameB),
      },
    );
    this.controller = controller;
    controller.start();
    this.primaryAction = null;
  }

  private startLocal(): void {
    const inputFn: InputFn = (_s, out0, out1) => {
      this.keyboard.read('wasd', out0);
      this.keyboard.read('arrows', out1);
    };
    this.startMatch('local', inputFn, 'P1', 'P2', true);
  }

  private startSingle(difficulty: Difficulty): void {
    const bot = new BotBrain(1, difficulty, 0x1234 + difficulty.length);
    const inputFn: InputFn = (state, out0, out1) => {
      this.keyboard.read('wasd', out0);
      bot.think(state, out1);
    };
    this.startMatch('single', inputFn, 'YOU', 'CPU', true);
    this.singleDifficulty = difficulty;
  }

  private singleDifficulty: Difficulty = 'normal';

  // ---- Pause ------------------------------------------------------------
  private pauseGame(): void {
    if (!(this.controller instanceof MatchController)) return;
    this.controller.setPaused(true);
    const overlay = el(
      'div',
      { class: 'screen screen--scrim', id: 'pause-overlay' },
      el(
        'div',
        { class: 'panel panel--narrow stack' },
        el('h2', { class: 'heading' }, 'Paused'),
        button('Resume', () => this.resumeGame(), 'btn btn--block'),
        button('Restart', () => this.restartMatch(), 'btn btn--ghost btn--block'),
        button('Quit to menu', () => this.showTitle(), 'btn btn--ghost btn--block'),
      ),
    );
    this.ui.append(overlay);
    this.primaryAction = () => this.resumeGame();
  }

  private resumeGame(): void {
    document.getElementById('pause-overlay')?.remove();
    if (this.controller instanceof MatchController) this.controller.setPaused(false);
    this.primaryAction = null;
  }

  private restartMatch(): void {
    document.getElementById('pause-overlay')?.remove();
    this.replayLastMode();
  }

  private lastMode: Mode = 'local';
  private replayLastMode(): void {
    if (this.lastMode === 'single') this.startSingle(this.singleDifficulty);
    else if (this.lastMode === 'local') this.startLocal();
    else this.showLobby();
  }

  // ---- Match over -------------------------------------------------------
  private onMatchOver(mode: Mode, winner: PlayerId, nameA: string, nameB: string): void {
    this.lastMode = mode;
    const winnerName = winner === 0 ? nameA : nameB;
    const overlay = el(
      'div',
      { class: 'screen screen--scrim' },
      el(
        'div',
        { class: 'panel stack' },
        el('p', { class: 'eyebrow' }, 'Match over'),
        el('h2', { class: `heading`, style: `color: var(--kit-${winner === 0 ? 'a' : 'b'})` }, `${winnerName} wins!`),
        el('div', { class: 'row' },
          button('Rematch', () => this.replayLastMode(), 'btn btn--lg'),
          button('Menu', () => this.showTitle(), 'btn btn--ghost'),
        ),
      ),
    );
    // Keep the court + celebration visible behind the overlay.
    this.ui.append(overlay);
    this.primaryAction = () => this.replayLastMode();
  }

  // ---- Online (implemented in Stage 7) ---------------------------------
  private showLobby(): void {
    const screen = el(
      'div',
      { class: 'screen' },
      el('div', {}, el('p', { class: 'eyebrow' }, 'Online'), el('h2', { class: 'heading' }, 'Multiplayer lobby')),
      el('p', { class: 'muted' }, 'Online multiplayer is wired up in the running server build.'),
      button('Back', () => this.showModeSelect(), 'btn btn--ghost'),
    );
    this.setScreen(screen, () => this.showModeSelect());
  }

  private teardownMatch(): void {
    if (this.controller) {
      this.controller.stop();
      this.controller = null;
    }
    if (this.hud) {
      this.hud.unmount();
      this.hud = null;
    }
    document.getElementById('pause-overlay')?.remove();
    this.keyboard.setEnabled(false);
  }
}
