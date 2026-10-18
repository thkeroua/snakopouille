import { expect, test } from 'vitest';
import { GAMEPLAY, withConfig } from '../../src/config/gameplay';
import { HostRules, createHost } from '../../src/game/hostRules';
import { Rng } from '../../src/game/rng';
import { createSnake, type SnakeState } from '../../src/game/snakeMotion';
import type { MatchEvent, Vec } from '../../src/game/types';

const CFG = withConfig(GAMEPLAY, { food: { initialNatural: 0 } });

function snake(id: string, pts: Vec[], angle: number, points: number): SnakeState {
  const s = createSnake({ id, name: id, color: '#fff' }, pts[0], angle, CFG);
  s.points = points;
  for (const p of pts.slice(1)) {
    const prev = { x: s.path.x(0), y: s.path.y(0) };
    const n = Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y));
    for (let i = 1; i <= n; i++) s.path.moveHead({ x: prev.x + ((p.x - prev.x) * i) / n, y: prev.y + ((p.y - prev.y) * i) / n });
  }
  return s;
}

function setup() {
  const a = snake('A', [{ x: 250, y: 560 }, { x: 250, y: 501 }], -Math.PI / 2, 100);
  const b = snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0, 1000);
  const players = [a, b].map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const host = createHost(players, CFG, new Rng(1), ['#fff']);
  const rules = new HostRules(host, CFG, new Rng(2));
  return { a, b, host, rules, snakes: [a, b] };
}

test('reported body death scores the killer and drops a trail', () => {
  const { a, host, rules, snakes } = setup();
  const ev: MatchEvent[] = [];
  rules.deaths(snakes, ev, [{ victim: 'A', killer: 'B' }], false);
  expect(a.alive).toBe(false);
  expect(ev).toEqual([{ type: 'death', victim: 'A', killer: 'B', cause: 'body' }]);
  expect(host.stats.get('B')!.score).toBe(1);
  expect(host.stats.get('A')!.deaths).toBe(1);
  const total = [...host.food.items.values()].reduce((t, f) => t + f.value, 0);
  expect(total).toBe(100);
});

test('reported death of an already dead snake is ignored', () => {
  const { host, rules, snakes } = setup();
  rules.deaths(snakes, [], [{ victim: 'A', killer: 'B' }], false);
  const ev: MatchEvent[] = [];
  rules.deaths(snakes, ev, [{ victim: 'A', killer: 'B' }], false);
  expect(ev).toEqual([]);
  expect(host.stats.get('A')!.deaths).toBe(1);
  expect(host.stats.get('B')!.score).toBe(1);
});

test('detectBody=false does not run local body detection', () => {
  const { a, rules, snakes } = setup(); // la tête de A est dans le corps de B
  const ev: MatchEvent[] = [];
  rules.deaths(snakes, ev, [], false);
  expect(a.alive).toBe(true);
  rules.deaths(snakes, ev);
  expect(a.alive).toBe(false);
});

test('eatRequest credits only present food and ignores dead snakes', () => {
  const { a, b, host, rules } = setup();
  const f = host.food.add(10, 10, 50, true);
  const ev: MatchEvent[] = [];
  rules.eatRequest(a, [f.id, 9999], ev);
  rules.eatRequest(b, [f.id], ev);
  expect(a.points).toBe(150);
  expect(b.points).toBe(1000);
  expect(ev).toEqual([{ type: 'eat', snake: 'A', foodId: f.id, value: 50 }]);
  const g = host.food.add(20, 20, 10, true);
  a.alive = false;
  rules.eatRequest(a, [g.id], ev);
  expect(host.food.items.has(g.id)).toBe(true);
});

test('super food appears from time to time, at most maxOnMap', () => {
  const { host, rules } = setup();
  const sup = () => [...host.food.items.values()].filter((f) => f.isSuper);
  for (let t = 0; t < CFG.food.super.intervalMaxS; t += 0.05) rules.spawnFood(0.05);
  expect(sup().length).toBeGreaterThanOrEqual(1);
  for (let t = 0; t < 10 * CFG.food.super.intervalMaxS; t += 0.05) rules.spawnFood(0.05);
  expect(sup()).toHaveLength(CFG.food.super.maxOnMap);
  for (const f of sup()) expect(CFG.food.super.values.map((v) => v.value)).toContain(f.value);
});

test('magnet: food just beside the head is eaten without touching it', () => {
  const { a, host, rules } = setup();
  const hx = a.path.x(0);
  const hy = a.path.y(0);
  const f = host.food.add(hx + 12, hy, 5, false); // r ≈ 3.8 : hors du rayon de tête seul
  const far = host.food.add(hx + 40, hy, 5, false);
  const ev: MatchEvent[] = [];
  rules.eat([a], ev);
  expect(ev).toEqual([{ type: 'eat', snake: 'A', foodId: f.id, value: 5 }]);
  expect(host.food.items.has(far.id)).toBe(true);
});
