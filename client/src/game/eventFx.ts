// Translate simulation events into audio + visual juice. Called once per fixed
// step with the events emitted by `step`.

import { CENTER_X, FLOOR_Y } from '@badminton/shared';
import type { SimEvent } from '@badminton/shared';
import type { Effects } from '../render/effects.js';
import type { Sfx } from '../audio/sfx.js';

export interface BannerSink {
  showBanner(kind: 'point' | 'game' | 'match', player: number): void;
}

export function applyEvents(
  events: SimEvent[],
  effects: Effects,
  sfx: Sfx,
  banners?: BannerSink,
): void {
  for (const e of events) {
    switch (e.type) {
      case 'hit':
        sfx.hit();
        if (e.x !== undefined) effects.spawnFlash(e.x, e.y ?? 0, false);
        if (e.x !== undefined) effects.spawnHitSparks(e.x, e.y ?? 0, false);
        effects.addShake(1.5);
        break;
      case 'smash':
        sfx.smash();
        if (e.x !== undefined) effects.spawnFlash(e.x, e.y ?? 0, true);
        if (e.x !== undefined) effects.spawnHitSparks(e.x, e.y ?? 0, true);
        effects.addShake(6);
        break;
      case 'serve':
        sfx.serve();
        break;
      case 'netTouch': {
        sfx.netTouch();
        const dir = (e.x ?? CENTER_X) < CENTER_X ? -1 : 1;
        effects.kickNet(dir, 90);
        break;
      }
      case 'bounce': {
        sfx.bounce();
        const dir = (e.x ?? CENTER_X) < CENTER_X ? 1 : -1;
        effects.spawnDust(e.x ?? CENTER_X, FLOOR_Y, dir, 10);
        break;
      }
      case 'pointScored':
        sfx.point();
        if (banners && e.player !== undefined) banners.showBanner('point', e.player);
        break;
      case 'gameWon':
        sfx.gameWon();
        effects.addShake(4);
        if (banners && e.player !== undefined) banners.showBanner('game', e.player);
        break;
      case 'matchWon':
        sfx.matchWon();
        effects.addShake(7);
        if (banners && e.player !== undefined) banners.showBanner('match', e.player);
        break;
      case 'endSwap':
        break;
    }
  }
}
