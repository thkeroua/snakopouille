import type { Vec } from './types';

const TAU = Math.PI * 2;

/** Ramène un angle dans ]-π, π]. */
export function normalizeAngle(a: number): number {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
}

/** Plus petit écart signé pour aller de `from` à `to`, dans ]-π, π]. */
export function angleDiff(from: number, to: number): number {
  return normalizeAngle(to - from);
}

export function rotateToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return current + d;
  return current + Math.sign(d) * maxStep;
}

export function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
