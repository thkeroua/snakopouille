import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import { createSnake, headRadius, stepMotion, type SnakeState } from '../../src/game/snakeMotion';
import type { SnakeInput } from '../../src/game/types';

const DT = 1 / 60;
const NONE: SnakeInput = { target: null, boost: false };
const player = { id: 'a', name: 'A', color: '#fff' };

function snakeAt(x: number, y: number, angle: number, points = 10): SnakeState {
  const s = createSnake(player, { x, y }, angle, GAMEPLAY);
  s.points = points;
  return s;
}
function run(s: SnakeState, input: SnakeInput, steps: number) {
  for (let i = 0; i < steps; i++) stepMotion(s, input, DT, GAMEPLAY);
}
const head = (s: SnakeState) => ({ x: s.path.x(0), y: s.path.y(0) });

test('goes straight without input', () => {
  const s = snakeAt(500, 500, 0);
  run(s, NONE, 60);
  expect(s.angle).toBe(0);
  expect(head(s).x).toBeCloseTo(620, 0);
  expect(head(s).y).toBeCloseTo(500, 5);
});

test('turn is rate-limited', () => {
  const s = snakeAt(500, 500, 0);
  run(s, { target: { x: 300, y: 500.001 }, boost: false }, 1);
  expect(Math.abs(s.angle)).toBeCloseTo(4 / 60, 5);
});

test('steers toward target over time', () => {
  const s = snakeAt(500, 500, 0);
  run(s, { target: { x: 500, y: 900 }, boost: false }, 30);
  expect(s.angle).toBeGreaterThan(1.2);
});

test('dead zone keeps heading', () => {
  const s = snakeAt(500, 500, 0.3);
  run(s, { target: { x: 501, y: 501 }, boost: false }, 1);
  expect(s.angle).toBe(0.3);
});

test('boost doubles speed', () => {
  const s = snakeAt(300, 500, 0, 100);
  run(s, { target: null, boost: true }, 60);
  expect(s.boosting).toBe(true);
  expect(head(s).x).toBeCloseTo(540, 0);
});

test('no boost speed at minPoints', () => {
  const s = snakeAt(300, 500, 0, 10);
  run(s, { target: null, boost: true }, 60);
  expect(s.boosting).toBe(false);
  expect(head(s).x).toBeCloseTo(420, 0);
});

test('slides along wall', () => {
  const s = snakeAt(500, 10, -Math.PI / 4);
  const r = headRadius(s, GAMEPLAY);
  run(s, NONE, 60);
  expect(head(s).y).toBeCloseTo(r, 5);
  expect(head(s).x).toBeGreaterThan(500 + 120 * Math.cos(Math.PI / 4) - 3);
});

test('corner clamp', () => {
  const s = snakeAt(50, 50, -2.3);
  const r = headRadius(s, GAMEPLAY);
  run(s, { target: { x: -100, y: -100 }, boost: false }, 60);
  expect(head(s).x).toBeCloseTo(r, 6);
  expect(head(s).y).toBeCloseTo(r, 6);
  expect(Number.isNaN(s.angle)).toBe(false);
});

test('growth anchors tail', () => {
  const s = snakeAt(100, 500, 0, 1000);
  const tail0 = s.path.tail();
  run(s, NONE, 120);
  expect(s.path.tail()).toEqual(tail0);
  expect(s.path.length()).toBeCloseTo(240, 0);
});

test('length is trimmed to target', () => {
  const s = snakeAt(100, 500, 0, 10);
  run(s, NONE, 120);
  expect(s.path.length()).toBeCloseTo(GAMEPLAY.snake.lengthBase, 3);
});

test('dead snake does not move', () => {
  const s = snakeAt(500, 500, 0);
  s.alive = false;
  run(s, NONE, 10);
  expect(head(s).x).toBe(500);
});
