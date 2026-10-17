import { expect, test } from 'vitest';
import { HeadBuffer } from '../../src/net/interp';

const buf = () => new HeadBuffer(100);

test('empty buffer samples null', () => expect(buf().sample(0)).toBeNull());

test('interpolates on the sender clock with the delay', () => {
  const b = buf();
  b.push(1000, 5000, 0, 0, 0, false); // offset = 4000
  b.push(1050, 5070, 10, 0, 0, false); // arrivé en retard : offset reste 4000
  expect(b.sample(5125)!.x).toBeCloseTo(5, 6); // t = 1025
});

test('holds the last sample instead of extrapolating', () => {
  const b = buf();
  b.push(0, 0, 0, 0, 0, false);
  b.push(50, 50, 10, 20, 1, true);
  expect(b.sample(10_000)).toEqual({ x: 10, y: 20, angle: 1, boost: true });
});

test('before the first sample returns the first', () => {
  const b = buf();
  b.push(1000, 1000, 3, 4, 0.5, false);
  b.push(1050, 1050, 9, 9, 0.5, false);
  expect(b.sample(0)).toEqual({ x: 3, y: 4, angle: 0.5, boost: false });
});

test('ignores duplicate or older timestamps', () => {
  const b = buf();
  b.push(50, 50, 1, 1, 0, false);
  b.push(50, 60, 9, 9, 0, false);
  b.push(40, 70, 9, 9, 0, false);
  expect(b.size()).toBe(1);
});

test('angle interpolates along the shortest arc', () => {
  const b = buf();
  b.push(0, 0, 0, 0, Math.PI - 0.1, false);
  b.push(100, 100, 0, 0, -Math.PI + 0.1, false);
  expect(Math.abs(b.sample(150)!.angle)).toBeCloseTo(Math.PI, 6);
});

test('old samples are pruned', () => {
  const b = buf();
  for (let i = 0; i < 200; i++) b.push(i * 50, i * 50, i, 0, 0, false);
  b.sample(200 * 50);
  expect(b.size()).toBeLessThan(30);
});

test('clear resets samples and offset', () => {
  const b = buf();
  b.push(0, 5000, 1, 1, 0, false);
  b.clear();
  b.push(0, 100, 2, 2, 0, false);
  expect(b.size()).toBe(1);
  expect(b.sample(200)!.x).toBe(2);
});
