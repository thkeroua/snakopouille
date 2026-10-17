import { expect, test } from 'vitest';
import { GAMEPLAY, withConfig, type GameplayConfig } from '../../src/config/gameplay';
import { SIM_DT } from '../../src/game/match';
import { memoryChannelPair, type Channel } from '../../src/net/channel';
import { HostSession } from '../../src/net/hostSession';
import { PROTOCOL_VERSION, type HeadWire, type Msg } from '../../src/net/protocol';

const QUIET = withConfig(GAMEPLAY, { food: { initialNatural: 5, spawnIntervalS: 1e9 } });

type Peer = {
  id: string;
  ch: Channel;
  got: Msg[];
  all<T extends Msg['t']>(t: T): Extract<Msg, { t: T }>[];
  last<T extends Msg['t']>(t: T): Extract<Msg, { t: T }> | undefined;
  me(x: number, y: number, a?: number, life?: number, b?: 0 | 1): void;
};

function setup(cfg: GameplayConfig = QUIET, n = 3) {
  let t = 0;
  const host = new HostSession(cfg, { seed: 7, now: () => t, colorCount: 8 });
  const peers: Peer[] = [];
  for (let i = 0; i < n; i++) {
    let ch: Channel;
    if (i === 0) ch = host.connectLocal();
    else {
      const [a, b] = memoryChannelPair();
      host.addGuest(b);
      ch = a;
    }
    const got: Msg[] = [];
    ch.onMessage((m) => got.push(m));
    ch.sendReliable({ t: 'join', v: PROTOCOL_VERSION, name: `J${i}`, color: i });
    const all = <T extends Msg['t']>(type: T) => got.filter((m) => m.t === type) as Extract<Msg, { t: T }>[];
    const p: Peer = {
      id: (got.find((m) => m.t === 'welcome') as Extract<Msg, { t: 'welcome' }>).you,
      ch,
      got,
      all,
      last: (type) => all(type).at(-1),
      me: (x, y, a = 0, life = 1, b = 0) => {
        t += 1; // ts strictement croissant
        ch.sendFast({ t: 'me', life, ts: t, x, y, a, b });
      },
    };
    peers.push(p);
  }
  const tick = (k = 1) => {
    for (let i = 0; i < k; i++) {
      t += SIM_DT * 1000;
      host.tick(SIM_DT);
    }
  };
  return { host, peers, tick };
}

const headOf = (p: Peer, id: string): HeadWire | undefined => p.last('heads')?.s.find((h) => h[0] === id);

test('start sends spawns, initial food and duration to everyone', () => {
  const { host, peers } = setup();
  host.start();
  expect(host.phase).toBe('playing');
  for (const p of peers) {
    const s = p.last('start')!;
    expect(s.durationS).toBe(QUIET.match.durationS);
    expect(s.players.map((x) => x.id)).toEqual(['p1', 'p2', 'p3']);
    expect(s.spawns.map((x) => [x[0], x[1]])).toEqual([['p1', 1], ['p2', 1], ['p3', 1]]);
    expect(s.food).toHaveLength(5);
  }
  expect(peers[1].last('start')).toEqual(peers[2].last('start'));
});

test('me messages move the snake on the host and are relayed in heads at sendHz', () => {
  const { host, peers, tick } = setup();
  host.start();
  tick();
  expect(headOf(peers[0], 'p2')).toBeUndefined(); // pas encore de 'me' dans cette vie
  peers[1].me(500, 500, 0.5);
  const before = peers[0].all('heads').length;
  tick(60);
  expect(peers[0].all('heads').length - before).toBe(20);
  const h = headOf(peers[2], 'p2')!;
  expect([h[1], h[3], h[4], h[5], h[7]]).toEqual([1, 500, 500, 0.5, 10]);
});

test('eat credits the first request only; the food del is broadcast once', () => {
  const { host, peers, tick } = setup();
  host.start();
  const [fid, , , value] = peers[0].last('start')!.food[0];
  peers[1].me(100, 100);
  peers[2].me(200, 200);
  peers[1].ch.sendReliable({ t: 'eat', life: 1, ids: [fid] });
  peers[2].ch.sendReliable({ t: 'eat', life: 1, ids: [fid] });
  tick(3);
  expect(headOf(peers[0], 'p2')![7]).toBe(10 + value);
  expect(headOf(peers[0], 'p3')![7]).toBe(10);
  const dels = peers[2].all('food').flatMap((m) => m.del).filter((id) => id === fid);
  expect(dels).toHaveLength(1);
});

test('died from the current life kills, scores the killer, drops a trail, sends death then food then stats', () => {
  const { host, peers, tick } = setup();
  host.start();
  peers[1].me(300, 300);
  tick();
  const mark = peers[2].got.length;
  peers[1].ch.sendReliable({ t: 'died', life: 1, killer: 'p3' });
  tick();
  const after = peers[2].got.slice(mark).filter((m) => m.t === 'death' || m.t === 'food' || m.t === 'stats');
  expect(after.map((m) => m.t)).toEqual(['death', 'food', 'stats']);
  expect(after[0]).toMatchObject({ victim: 'p2', killer: 'p3', cause: 'body', respawnAt: expect.any(Number) });
  const trail = (after[1] as Extract<Msg, { t: 'food' }>).add;
  expect(trail.reduce((t, f) => t + f[3], 0)).toBe(10);
  const rows = (after[2] as Extract<Msg, { t: 'stats' }>).rows;
  expect(rows.find((r) => r[0] === 'p3')![1]).toBe(1);
  expect(rows.find((r) => r[0] === 'p2')![2]).toBe(1);
  expect(headOf(peers[0], 'p2')).toBeUndefined();
});

test('messages from a previous life are ignored', () => {
  const { host, peers, tick } = setup();
  host.start();
  peers[1].me(300, 300);
  peers[1].ch.sendReliable({ t: 'died', life: 1, killer: 'p3' });
  tick(Math.ceil(QUIET.match.respawnDelayS / SIM_DT) + 2);
  const sp = peers[0].all('respawn').find((m) => m.spawn[0] === 'p2')!;
  expect(sp.spawn[1]).toBe(2);
  const fid = peers[0].last('start')!.food[1][0];
  peers[1].me(700, 700, 0, 1);
  peers[1].ch.sendReliable({ t: 'eat', life: 1, ids: [fid] });
  peers[1].ch.sendReliable({ t: 'died', life: 1, killer: 'p3' });
  tick(5);
  const deaths = peers[0].all('death').filter((d) => d.victim === 'p2');
  expect(deaths).toHaveLength(1);
  expect(peers[0].all('food').flatMap((m) => m.del)).not.toContain(fid);
  peers[1].me(710, 700, 0, 2);
  tick(4);
  const h = headOf(peers[0], 'p2')!;
  expect([h[1], h[3], h[7]]).toEqual([2, 710, 10]);
});

test('head-on decided by the host kills both, nobody scores', () => {
  const { host, peers, tick } = setup();
  host.start();
  peers[1].me(780, 500, 0);
  peers[2].me(823, 500, Math.PI);
  tick();
  peers[1].me(800, 500, 0);
  peers[2].me(803, 500, Math.PI);
  tick();
  const deaths = peers[0].all('death');
  expect(deaths.map((d) => [d.victim, d.killer, d.cause]).sort()).toEqual([
    ['p2', null, 'head-on'],
    ['p3', null, 'head-on'],
  ]);
  expect(peers[0].last('stats')!.rows.every((r) => r[1] === 0)).toBe(true);
});

test('a guest leaving mid-match dies once, never respawns, stays in the final ranking', () => {
  const cfg = withConfig(QUIET, { match: { durationS: 20 } });
  const { host, peers, tick } = setup(cfg);
  host.start();
  peers[2].me(400, 400);
  tick();
  peers[2].ch.close();
  expect(peers[0].last('left')).toEqual({ t: 'left', id: 'p3' });
  tick();
  expect(peers[0].last('food')!.add.reduce((t, f) => t + f[3], 0)).toBe(10);
  for (let i = 0; i < 22; i++) {
    peers[0].ch.sendReliable({ t: 'beat' }); // les autres restent connectés
    peers[1].ch.sendReliable({ t: 'beat' });
    tick(60);
  }
  expect(peers[0].all('respawn').some((m) => m.spawn[0] === 'p3')).toBe(false);
  expect(peers[0].last('end')!.ranking.map((r) => r.id).sort()).toEqual(['p1', 'p2', 'p3']);
});

test('end after durationS sends the ranking and allows start() again with scores reset', () => {
  const cfg = withConfig(QUIET, { match: { durationS: 2, feverLastS: 1 } });
  const { host, peers, tick } = setup(cfg);
  host.start();
  peers[1].me(300, 300);
  peers[1].ch.sendReliable({ t: 'died', life: 1, killer: 'p1' });
  tick(Math.ceil(2 / SIM_DT) + 2);
  expect(host.phase).toBe('ended');
  const first = peers[1].last('end')!.ranking;
  expect(first[0]).toMatchObject({ id: 'p1', score: 1 });
  expect(host.probeInfo().playing).toBe(false);
  host.start();
  expect(host.phase).toBe('playing');
  expect(peers[2].all('start')).toHaveLength(2);
  tick(Math.ceil(2 / SIM_DT) + 2);
  expect(peers[1].last('end')!.ranking.every((r) => r.score === 0 && r.deaths === 0)).toBe(true);
});

test('malformed play messages are ignored (no NaN, no unknown or self killer)', () => {
  const { host, peers, tick } = setup();
  host.start();
  peers[1].me(300, 300);
  tick();
  peers[1].ch.sendFast({ t: 'me', life: 1, ts: 999, x: NaN, y: 300, a: 0, b: 0 });
  peers[1].ch.sendFast({ t: 'me', life: 1, ts: 1000, x: 1e9, y: -1e9, a: 0, b: 0 });
  peers[1].ch.sendReliable({ t: 'eat', life: 1, ids: 'x' as unknown as number[] });
  peers[1].ch.sendReliable({ t: 'died', life: 1, killer: 'nobody' });
  peers[1].ch.sendReliable({ t: 'died', life: 1, killer: 'p2' });
  tick(3);
  const h = headOf(peers[0], 'p2')!;
  expect(Number.isFinite(h[3]) && Number.isFinite(h[4])).toBe(true);
  expect(h[3]).toBeLessThanOrEqual(QUIET.world.width);
  expect(h[4]).toBeGreaterThanOrEqual(0);
  expect(peers[0].all('death')).toHaveLength(0);
});

test('join during a match is rejected with playing', () => {
  const { host } = setup();
  host.start();
  const [a, b] = memoryChannelPair();
  const got: Msg[] = [];
  a.onMessage((m) => got.push(m));
  host.addGuest(b);
  a.sendReliable({ t: 'join', v: PROTOCOL_VERSION, name: 'Tard', color: 5 });
  expect(got).toEqual([{ t: 'reject', reason: 'playing' }]);
  expect(host.probeInfo().playing).toBe(true);
});
