import { expect, test } from 'vitest';
import { GAMEPLAY, withConfig, type GameplayConfig } from '../../src/config/gameplay';
import { SIM_DT } from '../../src/game/match';
import type { SnakeInput } from '../../src/game/types';
import { memoryChannelPair } from '../../src/net/channel';
import { ClientSession } from '../../src/net/clientSession';
import { PROTOCOL_VERSION, type FoodWire, type LobbyPlayer, type Msg } from '../../src/net/protocol';

const PALETTE = ['#a00', '#0a0', '#00a'];
const FOOD = ['#ff0'];
const NONE: SnakeInput = { target: null, boost: false };
const PLAYERS: LobbyPlayer[] = [
  { id: 'p1', name: 'Moi', color: 1, host: false },
  { id: 'p2', name: 'Autre', color: 2, host: true },
];

function setup(cfg: GameplayConfig = GAMEPLAY) {
  let t = 1000;
  const [hostEnd, clientEnd] = memoryChannelPair();
  const sent: Msg[] = [];
  hostEnd.onMessage((m) => sent.push(m));
  const c = new ClientSession(clientEnd, 'Moi', 1, cfg, { now: () => t, palette: PALETTE, foodPalette: FOOD });
  const changes: string[] = [];
  c.onChange = (w) => changes.push(w);
  const send = (m: Msg) => hostEnd.sendReliable(m);
  const tick = (k = 1, input: SnakeInput = NONE) => {
    for (let i = 0; i < k; i++) {
      t += SIM_DT * 1000;
      c.tick(SIM_DT, input);
    }
  };
  const start = (food: FoodWire[] = [], durationS = 180) => {
    send({ t: 'welcome', you: 'p1' });
    send({ t: 'lobby', players: PLAYERS, code: 'ABCD' });
    send({ t: 'start', durationS, players: PLAYERS, spawns: [['p1', 1, 500, 500, -Math.PI / 2], ['p2', 1, 300, 480, 0]], food });
  };
  return { c, sent, send, tick, start, changes, hostEnd, advance: (ms: number) => (t += ms), now: () => t };
}

const own = (c: ClientSession) => c.snakes.find((s) => s.id === 'p1')!;
const other = (c: ClientSession) => c.snakes.find((s) => s.id === 'p2')!;

test('sends join with the protocol version and reaches lobby on welcome+lobby', () => {
  const { c, sent, send, changes } = setup();
  expect(sent[0]).toEqual({ t: 'join', v: PROTOCOL_VERSION, name: 'Moi', color: 1 });
  expect(c.phase).toBe('connecting');
  send({ t: 'welcome', you: 'p1' });
  send({ t: 'lobby', players: PLAYERS, code: 'ABCD' });
  expect(c.phase).toBe('lobby');
  expect(c.you).toBe('p1');
  expect(c.lobby).toEqual(PLAYERS);
  expect(c.code).toBe('ABCD');
  expect(changes).toEqual(['lobby']);
  c.setColor(0);
  expect(sent.at(-1)).toEqual({ t: 'color', color: 0 });
});

test('reject closes with the reason', () => {
  const { c, send, changes } = setup();
  send({ t: 'reject', reason: 'full' });
  expect(c.phase).toBe('closed');
  expect(c.closeReason).toBe('full');
  expect(changes).toEqual(['closed']);
});

test('start builds snakes and food; own snake moves locally with input', () => {
  const { c, start, tick, changes } = setup();
  start([[7, 900, 900, 10]]);
  expect(c.phase).toBe('playing');
  expect(changes.at(-1)).toBe('start');
  expect(c.snakes.map((s) => [s.id, s.name, s.color])).toEqual([
    ['p1', 'Moi', '#0a0'],
    ['p2', 'Autre', '#00a'],
  ]);
  expect(c.food.get(7)).toMatchObject({ x: 900, y: 900, value: 10, color: '#ff0' });
  tick(30, { target: { x: 900, y: 500 }, boost: false });
  expect(own(c).path.x(0)).toBeGreaterThan(500);
  expect(own(c).path.y(0)).toBeLessThan(500);
  expect(other(c).path.x(0)).toBe(300); // pas de têtes reçues : immobile
});

test('sends me at sendHz only while alive', () => {
  const { c, sent, start, tick } = setup();
  start();
  const n0 = sent.length;
  tick(60);
  const mes = sent.slice(n0).filter((m) => m.t === 'me') as Extract<Msg, { t: 'me' }>[];
  expect(mes).toHaveLength(20);
  expect(mes.at(-1)).toMatchObject({ life: 1, x: own(c).path.x(0), y: own(c).path.y(0), b: 0 });
  own(c).alive = false;
  const n1 = sent.length;
  tick(60);
  expect(sent.slice(n1).some((m) => m.t === 'me')).toBe(false);
});

test('touching food hides it and sends a single eat; del confirms and unhides', () => {
  const { c, sent, send, start, tick } = setup();
  start([[1, 500, 495, 10]]);
  tick(3);
  expect(c.hiddenFood.has(1)).toBe(true);
  expect(sent.filter((m) => m.t === 'eat')).toEqual([{ t: 'eat', life: 1, ids: [1] }]);
  send({ t: 'food', add: [], del: [1] });
  expect(c.food.has(1)).toBe(false);
  expect(c.hiddenFood.size).toBe(0);
});

function remoteLine(fast: (m: Msg) => void, toX: number, life = 1) {
  const heads: Msg = { t: 'heads', time: 1, s: [] };
  for (let i = 1, x = 300; x <= toX; i++, x += 5) {
    fast({ t: 'heads', time: 1, s: [['p2', life, i, x, 480, 0, 0, 1000]] });
  }
  return heads;
}

test('body hit outside the neck kills locally and sends died once', () => {
  const { c, sent, start, tick, hostEnd, advance } = setup();
  start();
  remoteLine((m) => hostEnd.sendFast(m), 700);
  advance(2000);
  tick(10);
  expect(own(c).alive).toBe(false);
  expect(sent.filter((m) => m.t === 'died')).toEqual([{ t: 'died', life: 1, killer: 'p2' }]);
  expect(c.phase).toBe('playing');
});

test('remote snake follows interpolated heads; stale life is ignored', () => {
  const { c, start, tick, hostEnd, advance } = setup();
  start();
  remoteLine((m) => hostEnd.sendFast(m), 400, 0); // ancienne vie
  advance(2000);
  tick();
  expect(other(c).path.x(0)).toBe(300);
  remoteLine((m) => hostEnd.sendFast(m), 400, 1);
  advance(2000);
  tick();
  expect(other(c).path.x(0)).toBe(400);
  expect(other(c).points).toBe(1000);
  expect(other(c).path.length()).toBeCloseTo(100, 3);
});

test('own points come from heads and the tail trims to them', () => {
  const { c, start, tick, hostEnd } = setup();
  start();
  hostEnd.sendFast({ t: 'heads', time: 1, s: [['p1', 1, 0, 0, 0, 0, 0, 1000]] });
  expect(own(c).points).toBe(1000);
  expect(own(c).path.x(0)).toBe(500); // la position ne vient jamais de l'hôte
  tick(120);
  expect(own(c).path.length()).toBeCloseTo(240, 0);
  hostEnd.sendFast({ t: 'heads', time: 2, s: [['p1', 1, 0, 0, 0, 0, 0, 10]] });
  tick();
  expect(own(c).path.length()).toBeCloseTo(GAMEPLAY.snake.lengthBase, 3);
});

test('time follows heads and never goes backwards; fever after durationS - feverLastS', () => {
  const { c, start, tick, hostEnd, advance } = setup();
  start();
  hostEnd.sendFast({ t: 'heads', time: 10, s: [] });
  advance(500);
  tick();
  expect(c.time).toBeCloseTo(10.5 + SIM_DT, 3);
  hostEnd.sendFast({ t: 'heads', time: 10.2, s: [] });
  tick();
  expect(c.time).toBeGreaterThanOrEqual(10.5);
  expect(c.fever).toBe(false);
  hostEnd.sendFast({ t: 'heads', time: 125, s: [] });
  tick();
  expect(c.fever).toBe(true);
});

test('death and respawn from the host', () => {
  const { c, send, start, tick } = setup();
  start();
  send({ t: 'death', victim: 'p1', killer: null, cause: 'head-on', respawnAt: 7 });
  expect(own(c).alive).toBe(false);
  expect(own(c).respawnAt).toBe(7);
  send({ t: 'respawn', spawn: ['p1', 2, 100, 100, 0] });
  expect(own(c).alive).toBe(true);
  expect(own(c).path.x(0)).toBe(100);
  expect(own(c).points).toBe(GAMEPLAY.snake.startPoints);
  tick(3);
  send({ t: 'left', id: 'p2' });
  expect(other(c).alive).toBe(false);
  expect(other(c).respawnAt).toBe(Infinity);
  send({ t: 'stats', rows: [['p1', 2, 1, 50], ['p2', 0, 3, 90]] });
  expect(c.ranking().map((r) => [r.id, r.score, r.deaths])).toEqual([
    ['p1', 2, 1],
    ['p2', 0, 3],
  ]);
});

test('host bye / channel close / silence → closed host-left exactly once', () => {
  for (const how of ['bye', 'close', 'silence'] as const) {
    const { c, send, start, tick, changes, hostEnd, advance } = setup();
    start();
    if (how === 'bye') send({ t: 'bye' });
    if (how === 'close') hostEnd.close();
    if (how === 'silence') {
      advance(10_500);
      tick();
    }
    tick();
    c.beat();
    expect(c.phase).toBe('closed');
    expect(c.closeReason).toBe('host-left');
    expect(changes.filter((x) => x === 'closed')).toHaveLength(1);
  }
});

test('leave says bye and closes without a reason', () => {
  const { c, sent, start, changes } = setup();
  start();
  c.leave();
  expect(sent.at(-1)).toEqual({ t: 'bye' });
  expect(c.phase).toBe('closed');
  expect(c.closeReason).toBeNull();
  expect(changes).not.toContain('closed');
});

test('end stores the ranking and a new start resets everything', () => {
  const cfg = withConfig(GAMEPLAY, { match: { durationS: 20 } });
  const { c, send, start, tick, changes } = setup(cfg);
  start([[1, 500, 495, 10]], 20);
  tick(2);
  expect(c.cfg.match.durationS).toBe(20);
  send({
    t: 'end',
    ranking: [{ id: 'p2', name: 'Autre', color: '2', score: 1, points: 30, deaths: 0, maxPoints: 40 }],
  });
  expect(c.phase).toBe('ended');
  expect(c.ended).toBe(true);
  expect(changes.at(-1)).toBe('end');
  expect(c.endRanking![0].color).toBe('#00a');
  start([], 30);
  expect(c.phase).toBe('playing');
  expect(c.endRanking).toBeNull();
  expect(c.hiddenFood.size).toBe(0);
  expect(c.cfg.match.durationS).toBe(30);
  expect(c.time).toBe(0);
});

test('an eat the host ignored (sent just before a host-side death) does not hide the food after respawn', () => {
  const { c, send, start, tick } = setup();
  start([[1, 500, 495, 10]]);
  tick(2); // 'eat' envoyé ; l'hôte l'ignore car il vient de tuer ce serpent (tête à tête)
  expect(c.hiddenFood.has(1)).toBe(true);
  send({ t: 'death', victim: 'p1', killer: null, cause: 'head-on', respawnAt: 5 });
  send({ t: 'respawn', spawn: ['p1', 2, 900, 900, 0] });
  expect(c.hiddenFood.has(1)).toBe(false);
  expect(c.food.has(1)).toBe(true);
});

test('eat requests are capped like on the host and only sent ids are hidden', () => {
  const food: FoodWire[] = Array.from({ length: 80 }, (_, i) => [i + 1, 500, 497, 5]);
  const { c, sent, start, tick } = setup();
  start(food);
  tick();
  const eat = sent.find((m) => m.t === 'eat') as Extract<Msg, { t: 'eat' }>;
  expect(eat.ids).toHaveLength(64);
  expect(c.hiddenFood.size).toBe(64);
  tick();
  expect(sent.filter((m) => m.t === 'eat')).toHaveLength(2);
  expect(c.hiddenFood.size).toBe(80);
});
