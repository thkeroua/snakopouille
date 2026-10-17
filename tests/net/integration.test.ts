import { expect, test } from 'vitest';
import { GAMEPLAY, withConfig } from '../../src/config/gameplay';
import { SIM_DT } from '../../src/game/match';
import { Rng } from '../../src/game/rng';
import type { SnakeInput } from '../../src/game/types';
import { memoryChannelPair, type Channel } from '../../src/net/channel';
import { ClientSession } from '../../src/net/clientSession';
import { HostSession } from '../../src/net/hostSession';

const PALETTE = ['#a00', '#0a0', '#00a', '#aa0'];
const FOOD = ['#ff0'];
const CFG = withConfig(GAMEPLAY, { match: { durationS: 20, feverLastS: 5 } });
type Strategy = (c: ClientSession, step: number) => SnakeInput;
const STRAIGHT: Strategy = () => ({ target: null, boost: false });

function setup(opts: { dropFast?: () => boolean } = {}) {
  let t = 0;
  const now = () => t;
  const host = new HostSession(CFG, { seed: 3, now, colorCount: PALETTE.length });
  const chans: Channel[] = [host.connectLocal()];
  for (let i = 0; i < 2; i++) {
    const [a, b] = memoryChannelPair({ dropFast: opts.dropFast });
    host.addGuest(b);
    chans.push(a);
  }
  const clients = chans.map((ch, i) => new ClientSession(ch, `J${i}`, i, CFG, { now, palette: PALETTE, foodPalette: FOOD }));
  host.start();
  const step = (k: number, strategies: Strategy[], each?: (n: number) => void) => {
    for (let n = 0; n < k; n++) {
      t += SIM_DT * 1000;
      host.tick(SIM_DT);
      clients.forEach((c, i) => c.tick(SIM_DT, (strategies[i] ?? STRAIGHT)(c, n)));
      if (n % 60 === 0) {
        host.beat();
        for (const c of clients) c.beat();
      }
      each?.(n);
    }
  };
  return { host, clients, step, chans };
}

const MATCH_STEPS = Math.ceil(20 / SIM_DT) + 10;

/** Tourne autour du centre : tout le monde bouge, mange, et se croise parfois. */
const circling =
  (phase: number): Strategy =>
  (c, n) => {
    const a = n / 120 + phase;
    return { target: { x: 800 + 400 * Math.cos(a), y: 500 + 300 * Math.sin(a) }, boost: n % 300 < 30 };
  };

test('all clients see the same snakes, food and ranking at the end', () => {
  const { clients, step } = setup();
  const strategies = [circling(0), circling(2), circling(4)];
  let lastFood: number[][] = [];
  step(MATCH_STEPS, strategies, () => {
    if (clients[0].phase === 'playing') lastFood = clients.map((c) => [...c.food.keys()].sort((a, b) => a - b));
  });
  expect(clients.every((c) => c.phase === 'ended')).toBe(true);
  expect(lastFood[1]).toEqual(lastFood[0]);
  expect(lastFood[2]).toEqual(lastFood[0]);
  const r0 = clients[0].endRanking!;
  expect(r0).toHaveLength(3);
  expect(clients[1].endRanking).toEqual(r0);
  expect(clients[2].endRanking).toEqual(r0);
  expect(new Set(r0.map((r) => r.id)).size).toBe(3);
  expect(new Set(r0.map((r) => r.color)).size).toBe(3);
  expect(r0.some((r) => r.maxPoints > CFG.snake.startPoints)).toBe(true); // on a mangé
});

test('eaten food never stays hidden', () => {
  const { clients, step } = setup();
  const since = new Map<string, number>();
  let worst = 0;
  step(MATCH_STEPS, [circling(0), circling(2), circling(4)], (n) => {
    clients.forEach((c, i) => {
      for (const id of c.hiddenFood) {
        const k = `${i}:${id}`;
        if (!since.has(k)) since.set(k, n);
        worst = Math.max(worst, n - since.get(k)!);
      }
    });
  });
  expect(since.size).toBeGreaterThan(0);
  expect(worst).toBeLessThanOrEqual(3);
});

test('a guest that steers into another body dies on every screen, killer scores', () => {
  const { clients, step } = setup();
  // J1 fonce sur la queue de J2, J2 avance tout droit (et glisse le long des murs).
  const chase: Strategy = (c) => {
    const target = c.snakes.find((s) => s.id === 'p3');
    return { target: target ? target.path.tail() : null, boost: false };
  };
  let deathSeen = -1;
  step(MATCH_STEPS, [STRAIGHT, chase, STRAIGHT], (n) => {
    if (deathSeen < 0 && clients[2].ranking().find((r) => r.id === 'p2')!.deaths > 0) deathSeen = n;
  });
  expect(deathSeen).toBeGreaterThan(0);
  const r = clients[0].endRanking!;
  expect(r.find((x) => x.id === 'p3')!.score).toBeGreaterThanOrEqual(1);
  expect(r.find((x) => x.id === 'p2')!.deaths).toBeGreaterThanOrEqual(1);
  expect(clients[1].endRanking).toEqual(r);
});

test('fast lane with 30 % loss still converges (positions within 30 u of the owner)', () => {
  const rng = new Rng(11);
  const { clients, step } = setup({ dropFast: () => rng.next() < 0.3 });
  step(90, [STRAIGHT, STRAIGHT, STRAIGHT]); // 1,5 s : avant qu'ils se croisent au centre
  for (const viewer of clients) {
    for (const owner of clients) {
      if (viewer === owner) continue;
      const real = owner.snakes.find((s) => s.id === owner.you)!;
      const seen = viewer.snakes.find((s) => s.id === owner.you)!;
      expect(real.alive).toBe(true);
      expect(Math.hypot(real.path.x(0) - seen.path.x(0), real.path.y(0) - seen.path.y(0))).toBeLessThan(30);
    }
  }
});

test('host-side guest close mid-match: remaining players finish and the leaver is in the ranking', () => {
  const { clients, step, chans } = setup();
  step(5 * 60, [circling(0), circling(2), circling(4)]);
  chans[2].close();
  expect(clients[2].phase).toBe('closed');
  const leaver = clients[0].snakes.find((s) => s.id === 'p3')!;
  expect(leaver.alive).toBe(false);
  step(MATCH_STEPS, [circling(0), circling(2)]);
  expect(clients[0].phase).toBe('ended');
  expect(clients[1].phase).toBe('ended');
  expect(clients[0].endRanking!.map((r) => r.id).sort()).toEqual(['p1', 'p2', 'p3']);
});
