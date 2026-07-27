// App shell + screen state machine. Owns the viewport, audio, input and the
// active match controller, and swaps between menus and in-game HUD.

import {
  BotBrain,
  type Difficulty,
  type GameState,
  type InputState,
  type PlayerId,
  type ServerMsg,
} from '@badminton/shared';
import { createViewport, resizeViewport, type Viewport } from './render/viewport.js';
import { Sfx } from './audio/sfx.js';
import { Keyboard } from './input/keyboard.js';
import { MatchController, type InputFn } from './game/matchController.js';
import { Hud } from './ui/hud.js';
import { el, clear, button } from './ui/dom.js';
import { NetConnection } from './net/connection.js';
import { OnlineController } from './net/onlineController.js';

type Mode = 'single' | 'local' | 'online';

export class App {
  private ui: HTMLElement;
  private vp: Viewport;
  private sfx = new Sfx();
  private keyboard = new Keyboard();

  private controller: MatchController | null = null;
  private hud: Hud | null = null;

  private net: NetConnection | null = null;
  private online: OnlineController | null = null;
  private onlineNames: [string, string] = ['YOU', 'OPPONENT'];
  private rematchVotes: [boolean, boolean] = [false, false];
  private leavingOnline = false;

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

  // ---- Online -----------------------------------------------------------
  private ensureNet(): NetConnection {
    if (this.net) return this.net;
    const net = new NetConnection();
    net.onMessage = (msg) => this.handleServerMsg(msg);
    net.onClose = () => this.handleNetClose();
    net.connect();
    this.net = net;
    return net;
  }

  private showLobby(): void {
    this.leavingOnline = false;
    this.ensureNet();
    const status = el('p', { class: 'status' }, '');
    const codeInput = el('input', {
      class: 'input',
      maxlength: 4,
      placeholder: '––––',
      autocapitalize: 'characters',
      spellcheck: false,
    }) as HTMLInputElement;

    const quick = button('Quick Match', () => {
      this.net!.send({ t: 'queue' });
      this.showSearching();
    }, 'btn btn--lg btn--block');

    const create = button('Create Room', () => {
      this.net!.send({ t: 'createRoom' });
      status.textContent = 'Creating room…';
    }, 'btn btn--ghost btn--block');

    const join = button('Join', () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length !== 4) {
        status.textContent = 'Enter a 4-character room code.';
        status.className = 'status error';
        return;
      }
      this.net!.send({ t: 'joinRoom', code });
      status.textContent = `Joining ${code}…`;
      status.className = 'status';
    }, 'btn');

    const joinRow = el('div', { class: 'field' }, el('label', {}, 'Join by code'), el('div', { class: 'row' }, codeInput, join));

    const screen = el(
      'div',
      { class: 'screen' },
      el('div', {}, el('p', { class: 'eyebrow' }, 'Online'), el('h2', { class: 'heading' }, 'Multiplayer')),
      el('div', { class: 'panel panel--narrow stack' }, quick, create, joinRow, status),
      button('Back', () => this.showModeSelect(), 'link-btn'),
    );
    this.setScreen(screen);
    this.lobbyStatus = status;
  }

  private lobbyStatus: HTMLElement | null = null;

  private showSearching(): void {
    const screen = el(
      'div',
      { class: 'screen' },
      el('div', { class: 'spinner' }),
      el('h2', { class: 'heading' }, 'Finding a match…'),
      el('p', { class: 'muted' }, 'Looking for another player online.'),
      button('Cancel', () => {
        this.net?.send({ t: 'cancelQueue' });
        this.showLobby();
      }, 'btn btn--ghost'),
    );
    this.setScreen(screen);
  }

  private showRoomWaiting(code: string): void {
    const copyBtn = button('Copy code', () => {
      void navigator.clipboard?.writeText(code);
      copyBtn.textContent = 'Copied!';
    }, 'btn btn--ghost');
    const screen = el(
      'div',
      { class: 'screen' },
      el('div', {}, el('p', { class: 'eyebrow' }, 'Private room'), el('h2', { class: 'heading' }, 'Share this code')),
      el('div', { class: 'room-code' }, code),
      el('div', { class: 'stack' }, el('div', { class: 'spinner' }), el('p', { class: 'muted' }, 'Waiting for an opponent to join…')),
      el('div', { class: 'row' }, copyBtn, button('Cancel', () => { this.net?.send({ t: 'leave' }); this.showLobby(); }, 'link-btn')),
    );
    this.setScreen(screen);
  }

  private handleServerMsg(msg: ServerMsg): void {
    switch (msg.t) {
      case 'queued':
        break; // already showing the searching screen
      case 'roomCreated':
        this.showRoomWaiting(msg.code);
        break;
      case 'roomState':
        break; // match start follows when full
      case 'matchStart':
        this.startOnline(msg.slot, msg.code);
        break;
      case 'snapshot':
      case 'opponentGone':
      case 'opponentBack':
      case 'matchEnd':
        this.online?.handle(msg);
        break;
      case 'rematchState':
        this.rematchVotes = msg.votes;
        this.updateRematchUI();
        break;
      case 'error':
        this.showLobbyError(msg.msg);
        break;
      default:
        break;
    }
  }

  private showLobbyError(text: string): void {
    if (!this.lobbyStatus) {
      this.showLobby();
    }
    if (this.lobbyStatus) {
      this.lobbyStatus.textContent = text;
      this.lobbyStatus.className = 'status error';
    }
  }

  private startOnline(slot: PlayerId, code: string): void {
    this.teardownMatch();
    clear(this.ui);
    this.net!.rememberRoom(code);
    this.removeNetOverlay();
    this.keyboard.setEnabled(true);
    this.rematchVotes = [false, false];

    this.onlineNames = slot === 0 ? ['YOU', 'OPPONENT'] : ['OPPONENT', 'YOU'];
    const hud = new Hud({
      nameA: this.onlineNames[0],
      nameB: this.onlineNames[1],
      onMute: () => this.toggleMute(),
      showPing: true,
    });
    hud.setMuted(this.muted);
    hud.mount(this.ui);
    this.hud = hud;

    const readInput = (out: InputState) => this.keyboard.read('wasd', out);
    const online = new OnlineController(this.vp, this.sfx, this.net!, slot, hud, readInput, {
      onMatchEnd: (winner, forfeit) => this.onOnlineMatchEnd(winner, forfeit),
      onOpponentGone: (graceMs) => this.showOpponentGone(graceMs),
      onOpponentBack: () => this.removeNetOverlay(),
    });
    this.online = online;
    online.start();
    this.primaryAction = null;
  }

  private onOnlineMatchEnd(winner: PlayerId, forfeit: boolean): void {
    const iWon = this.online ? winner === this.online.slot : false;
    const title = forfeit
      ? iWon
        ? 'Opponent left — you win!'
        : 'You forfeited'
      : iWon
        ? 'You win!'
        : 'You lost';

    const yesBtn = button('Rematch', () => {
      this.net?.send({ t: 'rematch', vote: true });
      yesBtn.disabled = true;
      this.myRematchVote = true;
      this.updateRematchUI();
    }, 'btn btn--lg');
    const menuBtn = button('Menu', () => this.leaveOnline(), 'btn btn--ghost');

    this.rematchInfo = el('p', { class: 'muted' }, forfeit ? '' : 'Rematch in the same room?');

    const overlay = el(
      'div',
      { class: 'screen screen--scrim', id: 'net-overlay' },
      el(
        'div',
        { class: 'panel stack' },
        el('p', { class: 'eyebrow' }, 'Match over'),
        el('h2', { class: 'heading', style: `color: var(--kit-${iWon ? (this.online!.slot === 0 ? 'a' : 'b') : this.online!.slot === 0 ? 'b' : 'a'})` }, title),
        this.rematchInfo,
        el('div', { class: 'row' }, yesBtn, menuBtn),
      ),
    );
    this.removeNetOverlay();
    this.ui.append(overlay);
    this.primaryAction = () => yesBtn.click();
  }

  private myRematchVote = false;
  private rematchInfo: HTMLElement | null = null;

  private updateRematchUI(): void {
    if (!this.rematchInfo || !this.online) return;
    const other = this.rematchVotes[(1 - this.online.slot) as PlayerId];
    if (other && this.myRematchVote) this.rematchInfo.textContent = 'Starting rematch…';
    else if (other) this.rematchInfo.textContent = 'Opponent wants a rematch!';
    else if (this.myRematchVote) this.rematchInfo.textContent = 'Waiting for opponent…';
  }

  private showOpponentGone(graceMs: number): void {
    let remaining = Math.ceil(graceMs / 1000);
    const count = el('span', { class: 'serve-count' }, String(remaining));
    const overlay = el(
      'div',
      { class: 'screen screen--scrim', id: 'net-overlay' },
      el(
        'div',
        { class: 'panel panel--narrow stack' },
        el('div', { class: 'spinner' }),
        el('h2', { class: 'heading' }, 'Opponent disconnected'),
        el('p', { class: 'muted' }, 'Waiting for them to reconnect… ', count, 's'),
      ),
    );
    this.removeNetOverlay();
    this.ui.append(overlay);
    const timer = setInterval(() => {
      remaining -= 1;
      count.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    this.netOverlayTimer = timer;
  }

  private netOverlayTimer: ReturnType<typeof setInterval> | null = null;

  private removeNetOverlay(): void {
    document.getElementById('net-overlay')?.remove();
    if (this.netOverlayTimer) {
      clearInterval(this.netOverlayTimer);
      this.netOverlayTimer = null;
    }
  }

  private handleNetClose(): void {
    if (this.leavingOnline) return;
    if (!this.online) return;
    // Show a reconnecting overlay and retry.
    const overlay = el(
      'div',
      { class: 'screen screen--scrim', id: 'net-overlay' },
      el(
        'div',
        { class: 'panel panel--narrow stack' },
        el('div', { class: 'spinner' }),
        el('h2', { class: 'heading' }, 'Connection lost'),
        el('p', { class: 'muted' }, 'Trying to reconnect…'),
        button('Quit to menu', () => this.leaveOnline(), 'btn btn--ghost btn--block'),
      ),
    );
    this.removeNetOverlay();
    this.ui.append(overlay);
    setTimeout(() => {
      if (!this.leavingOnline) this.net?.connect();
    }, 1200);
  }

  private leaveOnline(): void {
    this.leavingOnline = true;
    this.net?.send({ t: 'leave' });
    this.net?.forgetRoom();
    this.net?.close();
    this.net = null;
    this.removeNetOverlay();
    this.showTitle();
  }

  private teardownMatch(): void {
    if (this.controller) {
      this.controller.stop();
      this.controller = null;
    }
    if (this.online) {
      this.online.stop();
      this.online = null;
    }
    if (this.hud) {
      this.hud.unmount();
      this.hud = null;
    }
    document.getElementById('pause-overlay')?.remove();
    this.removeNetOverlay();
    this.keyboard.setEnabled(false);
  }
}
