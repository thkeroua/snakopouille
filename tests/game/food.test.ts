import { expect, test } from 'vitest';
import { GAMEPLAY, withConfig } from '../../src/config/gameplay';
import { FoodStore } from '../../src/game/food';
import { SnakePath } from '../../src/game/path';
import { Rng } from '../../src/game/rng';
import { SpatialGrid } from '../../src/game/spatialGrid';

const PALETTE = ['#f00', '#0f0'];
const store = (cfg = GAMEPLAY) => new FoodStore(cfg, new Rng(1), PALETTE);

test('grid query finds near, skips far cells', () => {
  const g = new SpatialGrid<string>(1600, 1000, 64);
  g.insert(10, 10, 'near');
  g.insert(900, 900, 'far');
  const seen: string[] = [];
  g.query(12, 12, 5, (it) => seen.push(it));
  expect(seen).toEqual(['near']);
});

test('grid clamps out-of-world coordinates', () => {
  const g = new SpatialGrid<string>(1600, 1000, 64);
  g.insert(-5, 2000, 'edge');
  const seen: string[] = [];
  g.query(0, 999, 1, (it) => seen.push(it));
  expect(seen).toEqual(['edge']);
});

test('spawnNatural respects cap', () => {
  const f = store(withConfig(GAMEPLAY, { food: { maxNatural: 3 } }));
  expect(f.spawnNatural(1)).not.toBeNull();
  expect(f.spawnNatural(1)).not.toBeNull();
  expect(f.spawnNatural(1)).not.toBeNull();
  expect(f.spawnNatural(1)).toBeNull();
  expect(f.naturalCount()).toBe(3);
});

test('fever multiplies spawned values', () => {
  const f = store();
  for (let i = 0; i < 100; i++) expect([25, 50, 250]).toContain(f.spawnNatural(5)!.value);
});

test('spawned food stays inside margin and has palette color', () => {
  const f = store();
  for (let i = 0; i < 200; i++) {
    const it = f.spawnNatural(1)!;
    expect(it.x).toBeGreaterThanOrEqual(20);
    expect(it.x).toBeLessThanOrEqual(1580);
    expect(it.y).toBeGreaterThanOrEqual(20);
    expect(it.y).toBeLessThanOrEqual(980);
    expect(PALETTE).toContain(it.color);
    expect(it.natural).toBe(true);
  }
});

test('touching uses circle overlap', () => {
  const f = store();
  const it = f.add(100, 100, 5, true); // r = 2 + 0.8·√5 ≈ 3.79
  expect(f.touching(100 + it.r + 3.9, 100, 3.8)).toEqual([]);
  expect(f.touching(100 + it.r + 3.0, 100, 3.1)).toEqual([it.id]);
});

test('remove deletes from map and grid', () => {
  const f = store();
  const it = f.add(100, 100, 10, true);
  f.remove(it.id);
  expect(f.items.has(it.id)).toBe(false);
  expect(f.touching(100, 100, 5)).toEqual([]);
  expect(f.naturalCount()).toBe(0);
});

test('dropTrail conserves total value', () => {
  const f = store();
  const p = new SnakePath(4, { x: 100, y: 500 });
  for (let x = 101; x <= 500; x++) p.moveHead({ x, y: 500 });
  const orbs = f.dropTrail(p, 1234);
  expect(orbs).toHaveLength(20);
  expect(orbs.reduce((s, o) => s + o.value, 0)).toBe(1234);
  for (const o of orbs) {
    expect(o.natural).toBe(false);
    expect(o.y).toBeCloseTo(500);
    expect(o.x).toBeGreaterThanOrEqual(100);
    expect(o.x).toBeLessThanOrEqual(500);
  }
});

test('dropTrail on tiny body gives one orb', () => {
  const f = store();
  const p = new SnakePath(4, { x: 100, y: 500 });
  for (let x = 101; x <= 105; x++) p.moveHead({ x, y: 500 });
  const orbs = f.dropTrail(p, 10);
  expect(orbs).toHaveLength(1);
  expect(orbs[0].value).toBe(10);
});
