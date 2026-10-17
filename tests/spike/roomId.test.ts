import { expect, test } from 'vitest';
import { fetchPublicIp, peerIdForSlot, roomIdFromIp } from '../../src/spike/net/roomId';

test('roomIdFromIp is stable, 8 lowercase hex', async () => {
  const a = await roomIdFromIp('81.2.3.4');
  expect(a).toMatch(/^[0-9a-f]{8}$/);
  expect(await roomIdFromIp('81.2.3.4')).toBe(a);
  expect(await roomIdFromIp('81.2.3.5')).not.toBe(a);
});

test('peerIdForSlot format', () => {
  expect(peerIdForSlot('ab12cd34', 2)).toBe('snakopouille-ab12cd34-2');
});

test('fetchPublicIp returns ip', async () => {
  const f = async () => new Response(JSON.stringify({ ip: '81.2.3.4' }), { status: 200 });
  expect(await fetchPublicIp(f as typeof fetch)).toBe('81.2.3.4');
});

test('fetchPublicIp rejects on network error', async () => {
  const f = async () => {
    throw new TypeError('Failed to fetch');
  };
  await expect(fetchPublicIp(f as typeof fetch)).rejects.toThrow();
});

test('fetchPublicIp rejects on missing ip', async () => {
  const f = async () => new Response('{}', { status: 200 });
  await expect(fetchPublicIp(f as typeof fetch)).rejects.toThrow();
});

test('fetchPublicIp rejects on http error', async () => {
  const f = async () => new Response('nope', { status: 503 });
  await expect(fetchPublicIp(f as typeof fetch)).rejects.toThrow();
});

test('fetchPublicIp rejects after timeout on hanging fetch', async () => {
  const hanging = (_u: unknown, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
  await expect(fetchPublicIp(hanging as typeof fetch, 50)).rejects.toThrow();
});
