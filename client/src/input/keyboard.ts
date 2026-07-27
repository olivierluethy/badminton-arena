// Keyboard → input bitmasks. Tracks held keys (repeat-free) and produces an
// InputState for each of the two control sets. Arrow keys get preventDefault so
// the page never scrolls during play.

import type { InputState } from '@badminton/shared';

export type ControlSet = 'wasd' | 'arrows';

const WASD_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Keyboard {
  private down = new Set<string>();
  private onMute?: () => void;
  private onPause?: () => void;
  private onConfirm?: () => void;
  private enabled = true;

  attach(handlers: { mute?: () => void; pause?: () => void; confirm?: () => void }): void {
    this.onMute = handlers.mute;
    this.onPause = handlers.pause;
    this.onConfirm = handlers.confirm;
    window.addEventListener('keydown', this.handleDown);
    window.addEventListener('keyup', this.handleUp);
    window.addEventListener('blur', this.handleBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.handleDown);
    window.removeEventListener('keyup', this.handleUp);
    window.removeEventListener('blur', this.handleBlur);
    this.down.clear();
  }

  /** Disable movement capture (e.g. while a menu is open) but keep hotkeys. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.down.clear();
  }

  private handleDown = (e: KeyboardEvent): void => {
    if (ARROW_KEYS.has(e.code) || e.code === 'Space') e.preventDefault();

    // Global hotkeys (fire on the keydown edge, ignore auto-repeat).
    if (!e.repeat) {
      if (e.code === 'KeyM') this.onMute?.();
      else if (e.code === 'Escape') this.onPause?.();
      else if (e.code === 'Enter') this.onConfirm?.();
    }

    if (this.enabled) this.down.add(e.code);
  };

  private handleUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private handleBlur = (): void => {
    this.down.clear();
  };

  private isDown(code: string): boolean {
    return this.down.has(code);
  }

  read(set: ControlSet, out: InputState): InputState {
    if (set === 'wasd') {
      out.left = this.isDown('KeyA');
      out.right = this.isDown('KeyD');
      out.jump = this.isDown('KeyW');
      out.smash = this.isDown('KeyS');
    } else {
      out.left = this.isDown('ArrowLeft');
      out.right = this.isDown('ArrowRight');
      out.jump = this.isDown('ArrowUp');
      out.smash = this.isDown('ArrowDown');
    }
    return out;
  }

  // Expose which key groups exist for help/UX.
  static readonly WASD = WASD_KEYS;
  static readonly ARROWS = ARROW_KEYS;
}
