import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import { boostLossPerSecond, foodRadius, targetLengthFor, widthFor } from '../../src/game/sizing';

test('width x30 at 20000 points (±3%)', () => {
  const r = widthFor(20000, GAMEPLAY) / widthFor(10, GAMEPLAY);
  expect(r).toBeGreaterThan(29.1);
  expect(r).toBeLessThan(30.9);
});

test('width floor at minPoints', () => expect(widthFor(3, GAMEPLAY)).toBe(GAMEPLAY.snake.minWidth));

test('length at 10 points is lengthBase', () => expect(targetLengthFor(10, GAMEPLAY)).toBe(GAMEPLAY.snake.lengthBase));

test('length grows without cap', () =>
  expect(targetLengthFor(100000, GAMEPLAY)).toBeGreaterThan(targetLengthFor(20000, GAMEPLAY)));

test('boost calibration from spec', () => {
  expect(boostLossPerSecond(20000, GAMEPLAY)).toBeGreaterThan(900);
  expect(boostLossPerSecond(20000, GAMEPLAY)).toBeLessThan(1100);
  expect(boostLossPerSecond(100, GAMEPLAY)).toBeGreaterThan(9);
  expect(boostLossPerSecond(100, GAMEPLAY)).toBeLessThan(11);
});

test('food radius', () => expect(foodRadius(25, GAMEPLAY)).toBeCloseTo(2 + 0.8 * 5));
