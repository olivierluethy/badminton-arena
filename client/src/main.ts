import './styles/app.css';
import type { GameState, InputState } from '@badminton/shared';
import { createViewport, resizeViewport } from './render/viewport.js';
import { Sfx } from './audio/sfx.js';
import { Keyboard } from './input/keyboard.js';
import { MatchController } from './game/matchController.js';

// Temporary bootstrap: a local 2-player match to exercise the renderer/sim.
// The full menu shell replaces this in Stage 6.
const canvas = document.getElementById('game') as HTMLCanvasElement;
const vp = createViewport(canvas);
window.addEventListener('resize', () => resizeViewport(vp));

const sfx = new Sfx();
const keyboard = new Keyboard();

const inputFn = (_state: GameState, out0: InputState, out1: InputState): void => {
  keyboard.read('wasd', out0);
  keyboard.read('arrows', out1);
};

const controller = new MatchController(vp, sfx, inputFn, { firstServer: 0, leftPlayer: 0 });

keyboard.attach({
  mute: () => sfx.toggleMute(),
  pause: () => controller.setPaused(!controller.isPaused()),
  confirm: () => {},
});
window.addEventListener('keydown', () => sfx.resume(), { once: true });
window.addEventListener('pointerdown', () => sfx.resume(), { once: true });

controller.start();
