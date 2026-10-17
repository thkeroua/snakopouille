import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import {
  buildBodyGrid,
  headClashes,
  headHitsBody,
  resolveClash,
  type BodyRef,
} from '../../src/game/collision';
import { createSnake, type SnakeState } from '../../src/game/snakeMotion';
import { SpatialGrid } from '../../src/game/spatialGrid';
import type { Vec } from '../../src/game/types';

/** Serpent dont le corps passe par `pts` (du bout de la queue vers la tête). */
function snake(id: string, pts: Vec[], angle: number, points = 10): SnakeState {
  const s = createSnake({ id, name: id, color: '#fff' }, pts[0], angle, GAMEPLAY);
  s.points = points;
  for (const p of pts.slice(1)) {
    // échantillonnage fin pour que le corps suive le tracé
    const prev = { x: s.path.x(0), y: s.path.y(0) };
    const n = Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y));
    for (let i = 1; i <= n; i++) s.path.moveHead({ x: prev.x + ((p.x - prev.x) * i) / n, y: prev.y + ((p.y - prev.y) * i) / n });
  }
  return s;
}

function grid(snakes: SnakeState[]) {
  const g = new SpatialGrid<BodyRef>(1600, 1000, 64);
  buildBodyGrid(snakes, g, GAMEPLAY);
  return g;
}

const deg = (d: number) => (d * Math.PI) / 180;

test('self body never kills', () => {
  const a = snake('A', [{ x: 300, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 400 }, { x: 300, y: 400 }, { x: 300, y: 300 }], -Math.PI / 2);
  expect(headHitsBody(a, grid([a]), 2, GAMEPLAY)).toBeNull();
});

test('head into other body kills', () => {
  const b = snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0);
  const a = snake('A', [{ x: 250, y: 560 }, { x: 250, y: 501 }], -Math.PI / 2);
  expect(headHitsBody(a, grid([a, b]), 2, GAMEPLAY)).toBe('B');
});

test('head far from body is safe', () => {
  const b = snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0);
  const a = snake('A', [{ x: 250, y: 600 }, { x: 250, y: 510 }], -Math.PI / 2);
  expect(headHitsBody(a, grid([a, b]), 2, GAMEPLAY)).toBeNull();
});

test('dead snakes are not obstacles', () => {
  const b = snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0);
  b.alive = false;
  const a = snake('A', [{ x: 250, y: 560 }, { x: 250, y: 501 }], -Math.PI / 2);
  expect(headHitsBody(a, grid([a, b]), 2, GAMEPLAY)).toBeNull();
});

test('touching other head zone is not body hit', () => {
  const b = snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0);
  const a = snake('A', [{ x: 480, y: 500 }, { x: 403, y: 500 }], Math.PI);
  expect(headHitsBody(a, grid([a, b]), 2, GAMEPLAY)).toBeNull();
  expect(headClashes([a, b], GAMEPLAY)).toHaveLength(1);
});

test('front vs front', () => {
  const a = snake('A', [{ x: 100, y: 100 }], 0);
  const b = snake('B', [{ x: 103, y: 100 }], Math.PI);
  const [c] = headClashes([a, b], GAMEPLAY);
  expect(c).toMatchObject({ a: 'A', b: 'B', aFront: true, bFront: true });
  expect(resolveClash(c)).toEqual([
    { victim: 'A', killer: null, cause: 'head-on' },
    { victim: 'B', killer: null, cause: 'head-on' },
  ]);
});

test('front vs side', () => {
  const a = snake('A', [{ x: 100, y: 100 }], 0);
  const b = snake('B', [{ x: 103, y: 100 }], Math.PI / 2);
  const [c] = headClashes([a, b], GAMEPLAY);
  expect(c).toMatchObject({ aFront: true, bFront: false });
  expect(resolveClash(c)).toEqual([{ victim: 'A', killer: 'B', cause: 'head-side' }]);
});

test('side vs front (b attacks)', () => {
  const a = snake('A', [{ x: 100, y: 100 }], Math.PI / 2);
  const b = snake('B', [{ x: 103, y: 100 }], Math.PI);
  expect(resolveClash(headClashes([a, b], GAMEPLAY)[0])).toEqual([{ victim: 'B', killer: 'A', cause: 'head-side' }]);
});

test('side by side brush', () => {
  const a = snake('A', [{ x: 100, y: 100 }], 0);
  const b = snake('B', [{ x: 100, y: 103 }], 0);
  const [c] = headClashes([a, b], GAMEPLAY);
  expect(c).toMatchObject({ aFront: false, bFront: false });
  expect(resolveClash(c)).toEqual([]);
});

test('heads apart do not clash', () => {
  const a = snake('A', [{ x: 100, y: 100 }], 0);
  const b = snake('B', [{ x: 110, y: 100 }], Math.PI);
  expect(headClashes([a, b], GAMEPLAY)).toEqual([]);
});

test('front cone boundary 45°', () => {
  const at = (d: number) => {
    const a = snake('A', [{ x: 100, y: 100 }], 0);
    const b = snake('B', [{ x: 100 + 3 * Math.cos(deg(d)), y: 100 + 3 * Math.sin(deg(d)) }], Math.PI / 2);
    return headClashes([a, b], GAMEPLAY)[0].aFront;
  };
  expect(at(44)).toBe(true);
  expect(at(46)).toBe(false);
});
