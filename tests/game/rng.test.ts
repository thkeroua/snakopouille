import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import { Rng } from '../../src/game/rng';

test('rng deterministic', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
});

test('rng range and int bounds', () => {
  const r = new Rng(5);
  for (let i = 0; i < 1000; i++) {
    const v = r.range(2, 3);
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThan(3);
    const n = r.int(4);
    expect(Number.isInteger(n) && n >= 0 && n < 4).toBe(true);
  }
});

test('pickWeighted respects weights roughly', () => {
  const r = new Rng(1);
  let c = 0;
  for (let i = 0; i < 10000; i++) if (r.pickWeighted(GAMEPLAY.food.values).value === 50) c++;
  expect(c).toBeGreaterThan(200);
  expect(c).toBeLessThan(400);
});
