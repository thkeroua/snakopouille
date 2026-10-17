import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import { newBoostAcc, stepBoost } from '../../src/game/boost';

const DT = 1 / 60;

function boostFor(points: number, steps: number) {
  const acc = newBoostAcc();
  let p = points;
  let dropped = 0;
  for (let i = 0; i < steps; i++) {
    const r = stepBoost(p, true, acc, DT, GAMEPLAY);
    p = r.newPoints;
    dropped += r.drop;
  }
  return { points: p, dropped, acc };
}

test('20k for 5s loses ~4000-5000', () => {
  const lost = 20000 - boostFor(20000, 300).points;
  expect(lost).toBeGreaterThan(3800);
  expect(lost).toBeLessThan(5000);
});

test('100 for 5s loses ~35-50', () => {
  const lost = 100 - boostFor(100, 300).points;
  expect(lost).toBeGreaterThan(35);
  expect(lost).toBeLessThan(50);
});

test('never below minPoints', () => {
  const r = boostFor(11, 600);
  expect(r.points).toBe(10);
});

test('drops sum equals points lost', () => {
  const r = boostFor(5000, 317);
  expect(r.dropped + r.acc.pending).toBeCloseTo(5000 - r.points, 6);
});

test('drops are integers emitted every dropIntervalS', () => {
  const acc = newBoostAcc();
  let p = 5000;
  const drops: number[] = [];
  for (let i = 0; i < 60; i++) {
    const r = stepBoost(p, true, acc, DT, GAMEPLAY);
    p = r.newPoints;
    if (r.drop > 0) drops.push(r.drop);
  }
  expect(drops.length).toBe(5);
  for (const d of drops) expect(Number.isInteger(d)).toBe(true);
});

test('no loss when not boosting', () => {
  const r = stepBoost(500, false, newBoostAcc(), DT, GAMEPLAY);
  expect(r).toEqual({ newPoints: 500, drop: 0 });
});
