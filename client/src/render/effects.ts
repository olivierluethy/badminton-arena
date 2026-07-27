// Juice layer: pooled dust particles, impact flashes, screen shake, net wobble
// spring, and the shuttle trail buffer. No per-frame allocation — everything is
// preallocated and reused.

import { rgba, UI, SHUTTLE } from './palette.js';
import type { TrailPoint } from './shuttle.js';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Flash {
  active: boolean;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  strong: boolean;
}

const MAX_PARTICLES = 96;
const MAX_FLASHES = 12;
const TRAIL_LEN = 14;

export class Effects {
  private particles: Particle[] = [];
  private flashes: Flash[] = [];
  private trail: TrailPoint[] = [];
  private trailHead = 0;
  private trailCount = 0;

  private shakeMag = 0;
  shakeX = 0;
  shakeY = 0;
  private shakeSeed = 12.9898;

  private netWobble = 0;
  private netWobbleVel = 0;

  reduceMotion = false;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: '#fff',
      });
    }
    for (let i = 0; i < MAX_FLASHES; i++) {
      this.flashes.push({ active: false, x: 0, y: 0, life: 0, maxLife: 1, radius: 1, strong: false });
    }
    for (let i = 0; i < TRAIL_LEN; i++) this.trail.push({ x: 0, y: 0 });
  }

  reset(): void {
    for (const p of this.particles) p.active = false;
    for (const f of this.flashes) f.active = false;
    this.trailCount = 0;
    this.trailHead = 0;
    this.shakeMag = 0;
    this.netWobble = 0;
    this.netWobbleVel = 0;
  }

  private freeParticle(): Particle | null {
    for (const p of this.particles) if (!p.active) return p;
    return null;
  }

  spawnDust(x: number, y: number, dir: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const p = this.freeParticle();
      if (!p) return;
      const a = Math.PI + (Math.random() - 0.5) * 1.4;
      const spd = 40 + Math.random() * 130;
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 12;
      p.y = y;
      p.vx = Math.cos(a) * spd * dir + dir * 40;
      p.vy = -Math.abs(Math.sin(a) * spd) - 20;
      p.maxLife = 0.35 + Math.random() * 0.3;
      p.life = p.maxLife;
      p.size = 3 + Math.random() * 4;
      p.color = '#D9CFF2';
    }
  }

  spawnHitSparks(x: number, y: number, strong: boolean): void {
    const n = strong ? 12 : 6;
    for (let i = 0; i < n; i++) {
      const p = this.freeParticle();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * (strong ? 260 : 140);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * spd;
      p.vy = Math.sin(a) * spd;
      p.maxLife = 0.22 + Math.random() * 0.2;
      p.life = p.maxLife;
      p.size = 2 + Math.random() * 3;
      p.color = strong ? UI.accent2 : SHUTTLE.trail;
    }
  }

  spawnFlash(x: number, y: number, strong: boolean): void {
    let f = this.flashes.find((fl) => !fl.active);
    if (!f) f = this.flashes[0];
    f.active = true;
    f.x = x;
    f.y = y;
    f.maxLife = strong ? 0.14 : 0.09;
    f.life = f.maxLife;
    f.radius = strong ? 64 : 38;
    f.strong = strong;
  }

  addShake(mag: number): void {
    if (this.reduceMotion) return;
    this.shakeMag = Math.min(10, this.shakeMag + mag);
  }

  kickNet(dir: number, strength: number): void {
    this.netWobbleVel += dir * strength;
  }

  pushTrail(x: number, y: number): void {
    this.trail[this.trailHead].x = x;
    this.trail[this.trailHead].y = y;
    this.trailHead = (this.trailHead + 1) % TRAIL_LEN;
    if (this.trailCount < TRAIL_LEN) this.trailCount++;
  }

  clearTrail(): void {
    this.trailCount = 0;
    this.trailHead = 0;
  }

  /** Ordered oldest→newest trail points currently valid. */
  getTrail(out: TrailPoint[]): TrailPoint[] {
    out.length = 0;
    for (let i = 0; i < this.trailCount; i++) {
      const idx = (this.trailHead - this.trailCount + i + TRAIL_LEN * 2) % TRAIL_LEN;
      out.push(this.trail[idx]);
    }
    return out;
  }

  netWobbleValue(): number {
    return this.netWobble;
  }

  update(dt: number): void {
    // Particles.
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += 420 * dt; // gravity on dust
      p.vx *= 1 - 2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    // Flashes.
    for (const f of this.flashes) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) f.active = false;
    }
    // Shake decay + offset.
    if (this.shakeMag > 0.01) {
      this.shakeMag *= Math.pow(0.0025, dt);
      this.shakeSeed += 1;
      this.shakeX = (Math.sin(this.shakeSeed * 12.9898) * 43758.5453) % 1;
      this.shakeX = (this.shakeX - 0.5) * 2 * this.shakeMag;
      this.shakeY = (Math.sin(this.shakeSeed * 78.233) * 43758.5453) % 1;
      this.shakeY = (this.shakeY - 0.5) * 2 * this.shakeMag;
    } else {
      this.shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
    // Net wobble spring.
    const k = 220;
    const damp = 9;
    this.netWobbleVel += (-k * this.netWobble - damp * this.netWobbleVel) * dt;
    this.netWobble += this.netWobbleVel * dt;
    if (Math.abs(this.netWobble) < 0.05 && Math.abs(this.netWobbleVel) < 0.05) {
      this.netWobble = 0;
      this.netWobbleVel = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Flashes (additive-ish).
    for (const f of this.flashes) {
      if (!f.active) continue;
      const t = f.life / f.maxLife;
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * (1.4 - t));
      grad.addColorStop(0, rgba(f.strong ? UI.accent : '#FFFFFF', 0.85 * t));
      grad.addColorStop(1, rgba('#FFFFFF', 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * (1.4 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (const p of this.particles) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      ctx.fillStyle = rgba(p.color, t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
