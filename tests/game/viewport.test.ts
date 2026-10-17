import { expect, test } from 'vitest';
import { fitViewport, isPortrait, screenToWorld } from '../../src/view/viewport';

test('fit wider screen → side bands', () => {
  expect(fitViewport(2000, 1000, 1600, 1000)).toEqual({ scale: 1, offsetX: 200, offsetY: 0, cssWidth: 2000, cssHeight: 1000 });
});

test('fit taller → top/bottom bands', () => {
  expect(fitViewport(1600, 1200, 1600, 1000)).toMatchObject({ scale: 1, offsetX: 0, offsetY: 100 });
});

test('fit scales down', () => {
  expect(fitViewport(800, 500, 1600, 1000).scale).toBe(0.5);
});

test('screenToWorld inverse', () => {
  expect(screenToWorld(fitViewport(2000, 1000, 1600, 1000), 1000, 500)).toEqual({ x: 800, y: 500 });
});

test('isPortrait', () => {
  expect(isPortrait(800, 1280)).toBe(true);
  expect(isPortrait(1280, 800)).toBe(false);
});
