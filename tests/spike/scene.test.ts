import { expect, test } from 'vitest';
import { buildScene } from '../../src/spike/render/scene';

test('buildScene shape and bounds', () => {
  const s = buildScene({ snakes: 8, megaSamples: 3000, food: 500, seed: 1 });
  expect(s.snakes).toHaveLength(8);
  expect(s.snakes[0].points.length).toBe(6000);
  expect(s.snakes[0].width).toBe(120);
  expect(s.food.length).toBe(1500);
  for (const sn of s.snakes) {
    for (let i = 0; i < sn.points.length; i += 2) {
      expect(sn.points[i]).toBeGreaterThanOrEqual(0);
      expect(sn.points[i]).toBeLessThanOrEqual(1600);
      expect(sn.points[i + 1]).toBeGreaterThanOrEqual(0);
      expect(sn.points[i + 1]).toBeLessThanOrEqual(1000);
    }
  }
  for (const sn of s.snakes.slice(1)) {
    expect(sn.points.length / 2).toBeGreaterThanOrEqual(40);
    expect(sn.points.length / 2).toBeLessThanOrEqual(400);
    expect(sn.width).toBeGreaterThanOrEqual(4);
    expect(sn.width).toBeLessThanOrEqual(30);
  }
});

test('mega samples are spaced ~4 units', () => {
  const p = buildScene({ snakes: 1, megaSamples: 100, food: 0, seed: 3 }).snakes[0].points;
  for (let i = 2; i < p.length; i += 2) {
    expect(Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])).toBeLessThanOrEqual(4.01);
  }
});

test('buildScene deterministic', () => {
  const a = buildScene({ snakes: 3, megaSamples: 100, food: 10, seed: 7 });
  const b = buildScene({ snakes: 3, megaSamples: 100, food: 10, seed: 7 });
  expect(Array.from(a.snakes[1].points)).toEqual(Array.from(b.snakes[1].points));
  expect(Array.from(a.food)).toEqual(Array.from(b.food));
});
