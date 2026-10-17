import { expect, test } from 'vitest';
import { claimSlot } from '../../src/net/slots';

test('claimSlot takes first free slot', async () => {
  const taken = new Set(['snakopouille-r-1', 'snakopouille-r-2']);
  const r = await claimSlot(async (id) => (taken.has(id) ? 'taken' : 'ok'), 'r');
  expect(r).toEqual({ slot: 3, peerId: 'snakopouille-r-3' });
});

test('claimSlot returns null when all taken', async () => {
  expect(await claimSlot(async () => 'taken', 'r')).toBeNull();
});

test('claimSlot propagates other errors', async () => {
  await expect(
    claimSlot(async () => {
      throw new Error('server-error');
    }, 'r'),
  ).rejects.toThrow('server-error');
});
