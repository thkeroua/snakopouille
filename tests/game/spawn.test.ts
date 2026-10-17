import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import { Rng } from '../../src/game/rng';
import { createSnake } from '../../src/game/snakeMotion';
import { findSpawnPoint } from '../../src/game/spawn';

function curled(x: number, y: number) {
  const s = createSnake({ id: 'A', name: 'A', color: '#fff' }, { x, y }, 0, GAMEPLAY);
  for (let k = 1; k <= 200; k++) s.path.moveHead({ x: x + 30 * Math.cos(k / 10), y: y + 30 * Math.sin(k / 10) });
  return s;
}

test('spawns far from the only snake', () => {
  const { pos } = findSpawnPoint([curled(80, 80)], GAMEPLAY, new Rng(1));
  expect(pos.x).toBeGreaterThan(1200);
  expect(pos.y).toBeGreaterThan(700);
});

test('angle faces center', () => {
  const { pos, angle } = findSpawnPoint([curled(80, 80)], GAMEPLAY, new Rng(1));
  expect(Math.cos(angle - Math.atan2(500 - pos.y, 800 - pos.x))).toBeGreaterThan(0.999);
});

test('inside margin', () => {
  for (let seed = 0; seed < 20; seed++) {
    const { pos } = findSpawnPoint([], GAMEPLAY, new Rng(seed));
    expect(pos.x).toBeGreaterThanOrEqual(60);
    expect(pos.x).toBeLessThanOrEqual(1540);
    expect(pos.y).toBeGreaterThanOrEqual(60);
    expect(pos.y).toBeLessThanOrEqual(940);
  }
});

test('ignores dead snakes', () => {
  const dead = curled(800, 500);
  dead.alive = false;
  const a = findSpawnPoint([dead], GAMEPLAY, new Rng(9));
  const b = findSpawnPoint([], GAMEPLAY, new Rng(9));
  expect(a.pos).toEqual(b.pos);
});
