import { expect, test } from 'vitest';
import { SnakePath } from '../../src/game/path';

test('tail stays while growing', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 40; x++) {
    p.moveHead({ x, y: 0 });
    p.trimTo(1000);
  }
  expect(p.tail()).toEqual({ x: 0, y: 0 });
  expect(p.length()).toBeCloseTo(40);
});

test('trim keeps exact length and moves tail', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 40; x++) {
    p.moveHead({ x, y: 0 });
    p.trimTo(20);
  }
  expect(p.length()).toBeCloseTo(20);
  expect(p.tail().x).toBeCloseTo(20);
});

test('samples spaced', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 100; x++) p.moveHead({ x, y: 0 });
  expect(p.count()).toBeGreaterThanOrEqual(25);
  expect(p.count()).toBeLessThanOrEqual(27);
});

test('head index 0 is current head, last is tail', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 10; x++) p.moveHead({ x, y: 0 });
  expect(p.x(0)).toBe(10);
  expect(p.x(p.count() - 1)).toBe(0);
});

test('length follows a bent path', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 20; x++) p.moveHead({ x, y: 0 });
  for (let y = 1; y <= 20; y++) p.moveHead({ x: 20, y });
  expect(p.length()).toBeCloseTo(40, 0);
});

test('grows past initial capacity', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 40000; x++) p.moveHead({ x: x % 1600, y: Math.floor(x / 1600) * 10 });
  expect(p.count()).toBeGreaterThan(9000);
});

test('trim then grow keeps working after wraparound', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let i = 1; i <= 5000; i++) {
    p.moveHead({ x: i % 1600, y: 0 });
    p.trimTo(100);
  }
  expect(p.length()).toBeCloseTo(100, 0);
});

test('reset', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 50; x++) p.moveHead({ x, y: 0 });
  p.reset({ x: 7, y: 8 });
  expect(p.count()).toBe(1);
  expect(p.tail()).toEqual({ x: 7, y: 8 });
  expect(p.length()).toBe(0);
});

test('first long move from a fresh path is sampled every spacing', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  p.moveHead({ x: 40, y: 0 });
  expect(p.count()).toBeGreaterThanOrEqual(11);
  expect(p.length()).toBeCloseTo(40, 6);
  for (let i = 1; i < p.count(); i++) expect(Math.hypot(p.x(i - 1) - p.x(i), p.y(i - 1) - p.y(i))).toBeLessThanOrEqual(4 + 1e-6);
  expect(p.tail()).toEqual({ x: 0, y: 0 });
});

test('non-finite head positions are ignored', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  p.moveHead({ x: 10, y: 0 });
  p.moveHead({ x: NaN, y: 0 });
  p.moveHead({ x: 20, y: Infinity });
  expect(p.x(0)).toBe(10);
  expect(p.length()).toBeCloseTo(10, 6);
});
