import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import { applyHead } from '../../src/game/remote';
import { targetLengthFor } from '../../src/game/sizing';
import { createSnake } from '../../src/game/snakeMotion';

const mk = () => createSnake({ id: 'r', name: 'r', color: '#fff' }, { x: 100, y: 500 }, 0, GAMEPLAY);

test('applyHead grows from the tail and trims to target length', () => {
  const s = mk();
  for (let i = 1; i <= 200; i++) applyHead(s, 100 + i * 6, 500, 0, false, 1000, GAMEPLAY);
  expect(s.path.length()).toBeCloseTo(Math.min(1200, targetLengthFor(1000, GAMEPLAY)), 3);
  expect(s.points).toBe(1000);
  const short = mk();
  for (let i = 1; i <= 5; i++) applyHead(short, 100 + i * 6, 500, 0, false, 1000, GAMEPLAY);
  expect(short.path.tail()).toEqual({ x: 100, y: 500 });
});

test('applyHead records the previous head for swept clashes', () => {
  const s = mk();
  applyHead(s, 110, 500, 0.3, true, 10, GAMEPLAY);
  applyHead(s, 120, 505, 0.4, true, 10, GAMEPLAY);
  expect([s.prevX, s.prevY]).toEqual([110, 500]);
  expect(s.path.x(0)).toBe(120);
  expect(s.angle).toBe(0.4);
  expect(s.boosting).toBe(true);
});
