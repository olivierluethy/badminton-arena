// Fixed-timestep game loop with an accumulator. The simulation advances in
// exact DT increments; rendering is decoupled and receives an interpolation
// alpha between the previous and current simulation states.

import { DT } from '@badminton/shared';

export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private readonly maxFrame = 0.25; // clamp huge tab-away gaps

  constructor(
    private onStep: () => void,
    private onRender: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (frameDt > this.maxFrame) frameDt = this.maxFrame;

    this.acc += frameDt;
    while (this.acc >= DT) {
      this.onStep();
      this.acc -= DT;
    }
    const alpha = this.acc / DT;
    this.onRender(alpha, frameDt);
    this.raf = requestAnimationFrame(this.frame);
  };
}
