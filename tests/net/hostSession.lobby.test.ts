import { expect, test } from 'vitest';
import { GAMEPLAY } from '../../src/config/gameplay';
import { memoryChannelPair, type Channel } from '../../src/net/channel';
import { HostSession } from '../../src/net/hostSession';
import { PROTOCOL_VERSION, type Msg } from '../../src/net/protocol';

function setup() {
  let t = 0;
  const host = new HostSession(GAMEPLAY, { seed: 1, now: () => t, colorCount: 8 });
  host.code = 'ABCD';
  return { host, advance: (ms: number) => (t += ms) };
}

type Peer = { ch: Channel; got: Msg[]; closed: () => boolean; last<T extends Msg['t']>(t: T): Extract<Msg, { t: T }> | undefined };

function peer(ch: Channel): Peer {
  const got: Msg[] = [];
  let closed = false;
  ch.onMessage((m) => got.push(m));
  ch.onClose(() => (closed = true));
  return {
    ch,
    got,
    closed: () => closed,
    last: (t) => [...got].reverse().find((m) => m.t === t) as never,
  };
}

function guest(host: HostSession, name = 'Invité', color = 0): Peer {
  const [a, b] = memoryChannelPair();
  const p = peer(a);
  host.addGuest(b);
  a.sendReliable({ t: 'join', v: PROTOCOL_VERSION, name, color });
  return p;
}

function local(host: HostSession, name = 'Thibault', color = 0): Peer {
  const p = peer(host.connectLocal());
  p.ch.sendReliable({ t: 'join', v: PROTOCOL_VERSION, name, color });
  return p;
}

test('join gets welcome and everyone gets the lobby', () => {
  const { host } = setup();
  const h = local(host, 'Thibault', 2);
  const g = guest(host, 'Léa', 3);
  expect(h.last('welcome')).toEqual({ t: 'welcome', you: 'p1' });
  expect(g.last('welcome')).toEqual({ t: 'welcome', you: 'p2' });
  const expected = {
    t: 'lobby',
    code: 'ABCD',
    players: [
      { id: 'p1', name: 'Thibault', color: 2, host: true },
      { id: 'p2', name: 'Léa', color: 3, host: false },
    ],
  };
  expect(h.last('lobby')).toEqual(expected);
  expect(g.last('lobby')).toEqual(expected);
  expect(host.lobbyPlayers()).toEqual(expected.players);
});

test('same preferred color: the second gets the first free color', () => {
  const { host } = setup();
  local(host, 'A', 0);
  guest(host, 'B', 0);
  const c = guest(host, 'C', 0);
  expect(c.last('lobby')!.players.map((p) => p.color)).toEqual([0, 1, 2]);
});

test('color change to a taken color is ignored', () => {
  const { host } = setup();
  local(host, 'A', 0);
  const b = guest(host, 'B', 1);
  b.ch.sendReliable({ t: 'color', color: 0 });
  expect(host.lobbyPlayers()[1].color).toBe(1);
  b.ch.sendReliable({ t: 'color', color: 5 });
  expect(b.last('lobby')!.players[1].color).toBe(5);
  b.ch.sendReliable({ t: 'color', color: 42 });
  expect(host.lobbyPlayers()[1].color).toBe(5);
});

test('9th player is rejected with full', () => {
  const { host } = setup();
  local(host);
  for (let i = 0; i < 7; i++) guest(host, `G${i}`);
  const ninth = guest(host, 'Neuf');
  expect(ninth.last('reject')).toEqual({ t: 'reject', reason: 'full' });
  expect(host.lobbyPlayers()).toHaveLength(8);
});

test('a rejected guest is not cut off by the host (the reject must leave first) and is then ignored', () => {
  const { host, advance } = setup();
  local(host);
  for (let i = 0; i < 7; i++) guest(host, `G${i}`);
  const ninth = guest(host, 'Neuf');
  // Fermer tout de suite peut perdre le 'reject' sur un vrai WebRTC : c'est l'invité qui ferme.
  expect(ninth.closed()).toBe(false);
  ninth.ch.sendReliable({ t: 'join', v: PROTOCOL_VERSION, name: 'Encore', color: 0 });
  expect(ninth.got.filter((m) => m.t === 'reject')).toHaveLength(1);
  expect(ninth.got.some((m) => m.t === 'welcome' || m.t === 'lobby')).toBe(false);
  advance(10_500);
  host.beat();
  expect(ninth.closed()).toBe(true);
});

test('wrong protocol version is rejected', () => {
  const { host } = setup();
  const [a, b] = memoryChannelPair();
  const p = peer(a);
  host.addGuest(b);
  a.sendReliable({ t: 'join', v: PROTOCOL_VERSION + 1, name: 'Vieux', color: 0 });
  expect(p.last('reject')).toEqual({ t: 'reject', reason: 'version' });
  expect(host.lobbyPlayers()).toHaveLength(0);
});

test('guest closing its channel or saying bye leaves the lobby', () => {
  const { host } = setup();
  const h = local(host);
  const g = guest(host, 'B');
  const g2 = guest(host, 'C');
  g.ch.close();
  expect(host.lobbyPlayers().map((p) => p.name)).toEqual(['Thibault', 'C']);
  g2.ch.sendReliable({ t: 'bye' });
  expect(h.last('lobby')!.players.map((p) => p.name)).toEqual(['Thibault']);
});

test('silent guest is dropped after peerTimeoutS', () => {
  const { host, advance } = setup();
  const h = local(host);
  const g = guest(host, 'Muet');
  advance(5000);
  h.ch.sendReliable({ t: 'beat' });
  host.beat();
  expect(host.lobbyPlayers()).toHaveLength(2);
  advance(5500);
  h.ch.sendReliable({ t: 'beat' });
  host.beat();
  expect(host.lobbyPlayers().map((p) => p.name)).toEqual(['Thibault']);
  expect(g.closed()).toBe(true);
  expect(g.got.some((m) => m.t === 'beat')).toBe(true);
});

test('probeInfo reports host name, player count and phase', () => {
  const { host } = setup();
  expect(host.probeInfo()).toEqual({ t: 'hello', name: 'Hôte', players: 0, max: 8, playing: false });
  local(host, 'Thibault');
  guest(host, 'B');
  expect(host.probeInfo()).toEqual({ t: 'hello', name: 'Thibault', players: 2, max: 8, playing: false });
  expect(host.phase).toBe('lobby');
});

test('empty or long names are cleaned up', () => {
  const { host } = setup();
  local(host, '   ');
  guest(host, 'Un pseudo beaucoup trop long');
  expect(host.lobbyPlayers().map((p) => p.name)).toEqual(['Joueur 1', 'Un pseudo beauco']);
});

test('close says bye to everyone and closes channels', () => {
  const { host } = setup();
  const h = local(host);
  const g = guest(host);
  host.close();
  expect(g.last('bye')).toEqual({ t: 'bye' });
  expect(h.closed() && g.closed()).toBe(true);
});
