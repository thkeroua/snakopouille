import { expect, test } from 'vitest';
import { memoryChannelPair } from '../../src/net/channel';
import type { Msg } from '../../src/net/protocol';

test('memory channel delivers both lanes synchronously', () => {
  const [a, b] = memoryChannelPair();
  const got: Msg[] = [];
  b.onMessage((m) => got.push(m));
  a.sendReliable({ t: 'beat' });
  a.sendFast({ t: 'bye' });
  expect(got).toEqual([{ t: 'beat' }, { t: 'bye' }]);
});

test('dropFast drops only the fast lane', () => {
  const [a, b] = memoryChannelPair({ dropFast: () => true });
  const got: Msg[] = [];
  b.onMessage((m) => got.push(m));
  a.sendFast({ t: 'beat' });
  a.sendReliable({ t: 'bye' });
  expect(got).toEqual([{ t: 'bye' }]);
});

test('close notifies both ends once and mutes further sends', () => {
  const [a, b] = memoryChannelPair();
  let ca = 0;
  let cb = 0;
  a.onClose(() => ca++);
  b.onClose(() => cb++);
  const got: Msg[] = [];
  b.onMessage((m) => got.push(m));
  a.close();
  a.close();
  b.close();
  a.sendReliable({ t: 'beat' });
  expect([ca, cb, got.length]).toEqual([1, 1, 0]);
});
