import { expect, test } from 'vitest';
import { angleDiff, clamp, dist2, normalizeAngle, rotateToward } from '../../src/game/math';

test('normalizeAngle range', () => {
  expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
  expect(normalizeAngle(0.5)).toBeCloseTo(0.5);
});
test('angleDiff wraps', () => expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2));
test('rotateToward clamps step', () => expect(rotateToward(0, 1, 0.25)).toBeCloseTo(0.25));
test('rotateToward reaches target', () => expect(rotateToward(0, 0.1, 0.25)).toBeCloseTo(0.1));
test('rotateToward takes short way across ±π', () => expect(rotateToward(3, -3, 0.1)).toBeCloseTo(3.1));
test('dist2 and clamp', () => {
  expect(dist2({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  expect(clamp(5, 0, 3)).toBe(3);
  expect(clamp(-1, 0, 3)).toBe(0);
});
