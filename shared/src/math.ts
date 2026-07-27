// Small, allocation-free math helpers used across the simulation.

export const DEG = Math.PI / 180;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linearly interpolate an angle-free scalar, clamping t to [0,1]. */
export function lerpClamped(a: number, b: number, t: number): number {
  return lerp(a, b, clamp(t, 0, 1));
}

export function sign(v: number): number {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

/** Move `current` toward `target` by at most `maxDelta` (no overshoot). */
export function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + sign(target - current) * maxDelta;
}

export function length2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
