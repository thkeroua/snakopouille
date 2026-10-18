import { expect, test } from 'vitest';
import { GAMEPLAY, withConfig } from '../../src/config/gameplay';
import { forEachSpike, PickupStore, tickBonus } from '../../src/game/bonus';
import { buildBodyGrid, headHitsBody, type BodyRef } from '../../src/game/collision';
import { HostRules, createHost } from '../../src/game/hostRules';
import { Rng } from '../../src/game/rng';
import { widthFor } from '../../src/game/sizing';
import { createSnake, headRadius, snakeWidth, stepMotion, type SnakeState } from '../../src/game/snakeMotion';
import { SpatialGrid } from '../../src/game/spatialGrid';
import type { MatchEvent, Vec } from '../../src/game/types';

const CFG = withConfig(GAMEPLAY, { food: { initialNatural: 0 } });

function snake(id: string, pts: Vec[], angle: number, points = 10): SnakeState {
  const s = createSnake({ id, name: id, color: '#fff' }, pts[0], angle, CFG);
  s.points = points;
  for (const p of pts.slice(1)) {
    const prev = { x: s.path.x(0), y: s.path.y(0) };
    const n = Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y));
    for (let i = 1; i <= n; i++) s.path.moveHead({ x: prev.x + ((p.x - prev.x) * i) / n, y: prev.y + ((p.y - prev.y) * i) / n });
  }
  return s;
}

function hits(victim: SnakeState, all: SnakeState[]) {
  const g = new SpatialGrid<BodyRef>(1600, 1000, 64);
  const maxHalf = buildBodyGrid(all, g, CFG);
  return headHitsBody(victim, g, maxHalf, CFG);
}

// A arrive par le haut, sa tête en plein dans le corps horizontal de B.
const crossing = () => [snake('A', [{ x: 250, y: 560 }, { x: 250, y: 501 }], -Math.PI / 2, 100), snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0, 1000)];

test('timers count down and stop at zero', () => {
  const [a] = crossing();
  a.bonus.ghost = 0.5;
  tickBonus(a, 0.3);
  expect(a.bonus.ghost).toBeCloseTo(0.2);
  tickBonus(a, 1);
  expect(a.bonus.ghost).toBe(0);
});

test('speed bonus doubles the distance and stacks with the boost', () => {
  const run = (speed: boolean, boost: boolean) => {
    const s = snake('S', [{ x: 500, y: 500 }], 0, 1000);
    if (speed) s.bonus.speed = 4;
    stepMotion(s, { target: null, boost }, 0.1, CFG);
    return s.path.x(0) - 500;
  };
  expect(run(true, false)).toBeCloseTo(2 * run(false, false));
  expect(run(true, true)).toBeCloseTo(4 * run(false, false));
});

test('ghost: does not die on a body, and nobody dies on its body', () => {
  const [a, b] = crossing();
  expect(hits(a, [a, b])).toBe('B');
  a.bonus.ghost = 7;
  expect(hits(a, [a, b])).toBeNull();
  a.bonus.ghost = 0;
  b.bonus.ghost = 7;
  expect(hits(a, [a, b])).toBeNull();
});

test('obese: three times wider, same length', () => {
  const [, b] = crossing();
  const [, ref] = crossing();
  b.bonus.obese = 10;
  expect(snakeWidth(b, CFG)).toBeCloseTo(3 * widthFor(b.points, CFG));
  expect(headRadius(b, CFG)).toBeCloseTo((3 * widthFor(b.points, CFG)) / 2);
  for (let i = 0; i < 600; i++) {
    stepMotion(b, { target: null, boost: false }, 1 / 60, CFG);
    stepMotion(ref, { target: null, boost: false }, 1 / 60, CFG);
  }
  expect(b.path.length()).toBeCloseTo(ref.path.length(), 5);
});

test('obese body reaches heads that would pass next to it', () => {
  const b = snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0, 1000);
  const a = snake('A', [{ x: 250, y: 600 }, { x: 250, y: 520 }], -Math.PI / 2); // 20 u au-dessus de l'axe de B
  expect(hits(a, [a, b])).toBeNull();
  b.bonus.obese = 10;
  expect(hits(a, [a, b])).toBe('B');
});

test('spikes stick out on both sides and kill other heads', () => {
  const b = snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0, 1000);
  const half = snakeWidth(b, CFG) / 2;
  b.bonus.spikes = 5;
  const tips: { y: number; len: number }[] = [];
  forEachSpike(b, CFG, (ax, ay, tx, ty) => tips.push({ y: ty - 500, len: Math.hypot(tx - ax, ty - ay) }));
  expect(tips.length).toBeGreaterThan(10);
  expect(tips.some((t) => t.y > 0)).toBe(true);
  expect(tips.some((t) => t.y < 0)).toBe(true);
  for (const t of tips) {
    expect(t.len).toBeGreaterThanOrEqual(Math.max(CFG.bonus.spikes.minLen, half * CFG.bonus.spikes.minLenFactor) - 1e-6);
    expect(t.len).toBeLessThanOrEqual(half * CFG.bonus.spikes.maxLenFactor + 1e-6);
  }
  // Une petite tête posée à la pointe du plus long pic meurt ; sans pics, elle passe.
  const longest = [...tips].filter((t) => t.y < 0).sort((p, q) => q.len - p.len)[0];
  let tip: Vec = { x: 0, y: 0 };
  forEachSpike(b, CFG, (_ax, _ay, tx, ty) => {
    if (ty - 500 === longest.y) tip = { x: tx, y: ty };
  });
  const a = snake('A', [{ x: tip.x, y: tip.y - 60 }, { x: tip.x, y: tip.y + 0.5 }], Math.PI / 2);
  expect(hits(a, [a, b])).toBe('B');
  b.bonus.spikes = 0;
  expect(hits(a, [a, b])).toBeNull();
});

test('pickup store spawns up to maxOnMap and finds touched pickups', () => {
  const store = new PickupStore();
  const rng = new Rng(3);
  for (let i = 0; i < 10; i++) store.spawn(rng, CFG);
  expect(store.items.size).toBe(CFG.bonus.maxOnMap);
  const p = [...store.items.values()][0];
  expect(store.touching(p.x + CFG.bonus.pickupRadius + 1, p.y, 2, CFG).map((q) => q.id)).toContain(p.id);
  expect(store.touching(p.x + CFG.bonus.pickupRadius + 3, p.y, 2, CFG)).toEqual([]);
});

function host(snakes: SnakeState[]) {
  const players = snakes.map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const st = createHost(players, CFG, new Rng(1), ['#fff']);
  return { st, rules: new HostRules(st, CFG, new Rng(2)) };
}

test('host: taking a pickup starts its full timer and emits an event', () => {
  const [a, b] = crossing();
  const { st, rules } = host([a, b]);
  const p = st.pickups.add(a.path.x(0), a.path.y(0), 'ghost');
  const ev: MatchEvent[] = [];
  rules.takePickups([a, b], ev);
  expect(ev).toEqual([{ type: 'bonus', snake: 'A', kind: 'ghost', pickupId: p.id }]);
  expect(a.bonus.ghost).toBe(CFG.bonus.ghost.durationS);
  expect(st.pickups.items.size).toBe(0);
});

test('host: pickups appear over time', () => {
  const { st, rules } = host(crossing());
  for (let t = 0; t < 3 * CFG.bonus.intervalMaxS; t += 0.05) rules.spawnPickup(0.05);
  expect(st.pickups.items.size).toBe(CFG.bonus.maxOnMap);
});

test('host: death clears bonuses; a reported death involving a ghost is ignored', () => {
  const [a, b] = crossing();
  const { rules } = host([a, b]);
  b.bonus.ghost = 3;
  const ev: MatchEvent[] = [];
  rules.deaths([a, b], ev, [{ victim: 'A', killer: 'B' }], false);
  expect(ev).toEqual([]);
  b.bonus.ghost = 0;
  a.bonus.speed = 2;
  rules.deaths([a, b], ev, [{ victim: 'A', killer: 'B' }], false);
  expect(a.alive).toBe(false);
  expect(a.bonus.speed).toBe(0);
});
