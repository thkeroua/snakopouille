import { expect, test } from 'vitest';
import { GAMEPLAY, withConfig } from '../../src/config/gameplay';
import { leaderId } from '../../src/game/hostRules';
import { Match, SIM_DT } from '../../src/game/match';
import type { SnakeState } from '../../src/game/snakeMotion';
import type { MatchEvent, Player, SnakeInput, Vec } from '../../src/game/types';

const PALETTE = ['#ffd84a'];
const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `P${i}`, name: `P${i}`, color: '#fff' }));
const NO_INPUT = new Map<string, SnakeInput>();
const QUIET = withConfig(GAMEPLAY, { food: { initialNatural: 0, spawnIntervalS: 1e9 } });

function place(s: SnakeState, pts: Vec[], angle: number, points: number) {
  s.points = points;
  s.angle = angle;
  s.path.reset(pts[0]);
  for (const p of pts.slice(1)) {
    const prev = { x: s.path.x(0), y: s.path.y(0) };
    const n = Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y));
    for (let i = 1; i <= n; i++) s.path.moveHead({ x: prev.x + ((p.x - prev.x) * i) / n, y: prev.y + ((p.y - prev.y) * i) / n });
  }
}

function runUntil(m: Match, pred: (ev: MatchEvent[]) => boolean, max = 20000): MatchEvent[] {
  for (let i = 0; i < max; i++) {
    const ev = m.tick(SIM_DT, NO_INPUT);
    if (pred(ev)) return ev;
  }
  throw new Error('condition never met');
}

test('fever starts at durationS - feverLastS and multiplies natural spawns', () => {
  const cfg = withConfig(GAMEPLAY, { match: { durationS: 20, feverLastS: 10 } });
  const m = new Match(players(1), cfg, 1, PALETTE);
  let feverEvents = 0;
  let feverAt = -1;
  const before = new Set(m.host.food.items.keys());
  for (let i = 0; i < 20 * 60 && !m.host.ended; i++) {
    const ev = m.tick(SIM_DT, NO_INPUT);
    if (ev.some((e) => e.type === 'fever-start')) {
      feverEvents++;
      feverAt = m.host.time;
      for (const id of m.host.food.items.keys()) before.add(id);
    }
  }
  expect(feverEvents).toBe(1);
  expect(feverAt).toBeGreaterThanOrEqual(10 - 1e-9);
  expect(feverAt).toBeLessThan(10 + SIM_DT + 1e-9);
  const spawnedAfter = [...m.host.food.items.values()].filter((f) => f.natural && !before.has(f.id));
  expect(spawnedAfter.length).toBeGreaterThan(0);
  for (const f of spawnedAfter) expect([25, 50, 250]).toContain(f.value);
});

test('match ends at durationS and freezes', () => {
  const cfg = withConfig(GAMEPLAY, { match: { durationS: 3, feverLastS: 1 } });
  const m = new Match(players(2), cfg, 2, PALETTE);
  let ends = 0;
  for (let i = 0; i < 3 * 60 + 5; i++) if (m.tick(SIM_DT, NO_INPUT).some((e) => e.type === 'end')) ends++;
  expect(ends).toBe(1);
  expect(m.host.ended).toBe(true);
  const x = m.snakes[0].path.x(0);
  expect(m.tick(SIM_DT, NO_INPUT)).toEqual([]);
  expect(m.snakes[0].path.x(0)).toBe(x);
});

test('end freezes state', () => {
  const cfg = withConfig(QUIET, { match: { durationS: 2, feverLastS: 1 } });
  const m = new Match(players(2), cfg, 3, PALETTE);
  const [a, b] = m.snakes;
  place(b, [{ x: 100, y: 500 }, { x: 700, y: 500 }], 0, 1000); // 1000 pts : corps assez long pour ne pas être raccourci
  place(a, [{ x: 400, y: 560 }, { x: 400, y: 504 }], -Math.PI / 2, 800);
  m.tick(SIM_DT, NO_INPUT);
  expect(a.alive).toBe(false);
  runUntil(m, (ev) => ev.some((e) => e.type === 'end'));
  const deaths = m.host.stats.get(a.id)!.deaths;
  for (let i = 0; i < 400; i++) m.tick(SIM_DT, NO_INPUT);
  expect(m.host.stats.get(a.id)!.deaths).toBe(deaths);
  expect(m.host.stats.get(a.id)!.maxPoints).toBe(800);
});

test('body kill credits owner and drops trail', () => {
  const m = new Match(players(2), QUIET, 4, PALETTE);
  const [a, b] = m.snakes;
  place(b, [{ x: 100, y: 500 }, { x: 700, y: 500 }], 0, 1000); // 1000 pts : corps assez long pour ne pas être raccourci
  place(a, [{ x: 400, y: 600 }, { x: 400, y: 504 }], -Math.PI / 2, 500);
  const ev = m.tick(SIM_DT, NO_INPUT);
  expect(ev).toContainEqual({ type: 'death', victim: a.id, killer: b.id, cause: 'body' });
  expect(m.host.stats.get(b.id)!.score).toBe(1);
  expect(m.host.stats.get(a.id)!.deaths).toBe(1);
  const trail = [...m.host.food.items.values()].filter((f) => !f.natural);
  expect(trail.reduce((s, f) => s + f.value, 0)).toBe(500);
});

test('respawn after 5s at 10 points', () => {
  const m = new Match(players(2), QUIET, 5, PALETTE);
  const [a, b] = m.snakes;
  place(b, [{ x: 100, y: 500 }, { x: 700, y: 500 }], 0, 1000); // 1000 pts : corps assez long pour ne pas être raccourci
  place(a, [{ x: 400, y: 600 }, { x: 400, y: 504 }], -Math.PI / 2, 300);
  m.tick(SIM_DT, NO_INPUT);
  const diedAt = m.host.time;
  runUntil(m, (ev) => ev.some((e) => e.type === 'respawn' && e.snake === a.id));
  expect(m.host.time - diedAt).toBeGreaterThanOrEqual(5 - 1e-9);
  expect(m.host.time - diedAt).toBeLessThan(5 + SIM_DT + 1e-9);
  expect(a.alive).toBe(true);
  expect(a.points).toBe(10);
});

test('simultaneous deaths: head-on, nobody scores', () => {
  const m = new Match(players(2), QUIET, 6, PALETTE);
  const [a, b] = m.snakes;
  place(a, [{ x: 300, y: 500 }, { x: 398, y: 500 }], 0, 10);
  place(b, [{ x: 500, y: 500 }, { x: 402, y: 500 }], Math.PI, 10);
  const ev = m.tick(SIM_DT, NO_INPUT).filter((e) => e.type === 'death');
  expect(ev).toHaveLength(2);
  for (const e of ev) expect(e).toMatchObject({ killer: null, cause: 'head-on' });
  expect(m.host.stats.get(a.id)!.score + m.host.stats.get(b.id)!.score).toBe(0);
});

test('simultaneous deaths: each dies on the other body, each scores once', () => {
  const m = new Match(players(2), QUIET, 7, PALETTE);
  const [a, b] = m.snakes;
  // A horizontal vers la droite dont la tête touche le corps vertical de B, et inversement.
  place(a, [{ x: 200, y: 300 }, { x: 200, y: 600 }, { x: 485, y: 600 }], 0, 1000);
  place(b, [{ x: 500, y: 800 }, { x: 500, y: 450 }, { x: 215, y: 450 }], Math.PI, 1000);
  // A : tête (485,600) → corps de B en x=500. B : tête (215,450) → corps de A en x=200.
  const deaths = m.tick(SIM_DT, NO_INPUT).filter((e) => e.type === 'death');
  expect(deaths).toHaveLength(2);
  expect(m.host.stats.get(a.id)!.score).toBe(1);
  expect(m.host.stats.get(b.id)!.score).toBe(1);
});

test('eating adds value, first snake wins tie', () => {
  const m = new Match(players(2), QUIET, 8, PALETTE);
  const [a, b] = m.snakes;
  place(a, [{ x: 395, y: 300 }, { x: 395, y: 400 }], Math.PI / 2, 10);
  place(b, [{ x: 405, y: 300 }, { x: 405, y: 400 }], Math.PI / 2, 10);
  const f = m.host.food.add(400, 401, 10, true);
  const eats = m.tick(SIM_DT, NO_INPUT).filter((e) => e.type === 'eat');
  expect(eats).toEqual([{ type: 'eat', snake: a.id, foodId: f.id, value: 10 }]);
  expect(a.points).toBe(20);
  expect(b.points).toBe(10);
});

test('crown leader', () => {
  const m = new Match(players(3), QUIET, 9, PALETTE);
  const [a, b, c] = m.snakes;
  a.points = 50;
  b.points = 80;
  c.points = 80;
  expect(leaderId(m.snakes)).toBeNull();
  c.points = 90;
  expect(leaderId(m.snakes)).toBe(c.id);
  c.alive = false;
  expect(leaderId(m.snakes)).toBe(b.id);
});

test('ranking order', () => {
  const m = new Match(players(3), QUIET, 10, PALETTE);
  const [a, b, c] = m.snakes;
  m.host.stats.get(a.id)!.score = 1;
  m.host.stats.get(b.id)!.score = 2;
  m.host.stats.get(c.id)!.score = 1;
  a.points = 30;
  c.points = 70;
  expect(m.ranking().map((r) => r.id)).toEqual([b.id, c.id, a.id]);
});

test('boost drops land at the tail', () => {
  const m = new Match(players(1), QUIET, 11, PALETTE);
  const [a] = m.snakes;
  place(a, [{ x: 200, y: 500 }, { x: 600, y: 500 }], 0, 3000);
  const inputs = new Map<string, SnakeInput>([[a.id, { target: null, boost: true }]]);
  for (let i = 0; i < 30; i++) m.tick(SIM_DT, inputs);
  const drops = [...m.host.food.items.values()].filter((f) => !f.natural);
  expect(drops.length).toBeGreaterThan(0);
  expect(a.points).toBeLessThan(3000);
  for (const d of drops) expect(d.x).toBeLessThan(260);
});

test('boosted head-on where heads cross in one tick is still head-on', () => {
  const m = new Match(players(2), QUIET, 12, PALETTE);
  const [a, b] = m.snakes;
  // Têtes à 6 unités (pas encore au contact) ; en boost chacune avance de 4 → elles se croisent.
  place(a, [{ x: 200, y: 500 }, { x: 300, y: 500 }], 0, 12);
  place(b, [{ x: 406, y: 500 }, { x: 306, y: 500 }], Math.PI, 12);
  const inputs = new Map<string, SnakeInput>([
    [a.id, { target: null, boost: true }],
    [b.id, { target: null, boost: true }],
  ]);
  const deaths = m.tick(SIM_DT, inputs).filter((e) => e.type === 'death');
  expect(deaths).toHaveLength(2);
  for (const e of deaths) expect(e).toMatchObject({ killer: null, cause: 'head-on' });
  expect(m.host.stats.get(a.id)!.score + m.host.stats.get(b.id)!.score).toBe(0);
});

test('Match exposes GameView fields', () => {
  const m = new Match(players(2), GAMEPLAY, 1, PALETTE);
  m.tick(SIM_DT, NO_INPUT);
  expect(m.time).toBeCloseTo(SIM_DT, 9);
  expect(m.fever).toBe(false);
  expect(m.ended).toBe(false);
  expect(m.food).toBe(m.host.food.items);
  expect(m.hiddenFood.size).toBe(0);
  expect(m.ranking()).toHaveLength(2);
});
