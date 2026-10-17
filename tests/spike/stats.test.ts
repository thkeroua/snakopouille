import { expect, test } from 'vitest';
import { summarize } from '../../src/spike/net/stats';

test('summarize', () => {
  expect(summarize([5, 1, 3, 2, 4])).toEqual({ count: 5, min: 1, avg: 3, p50: 3, p95: 5, max: 5 });
});

test('summarize empty', () => {
  expect(summarize([])).toEqual({ count: 0, min: 0, avg: 0, p50: 0, p95: 0, max: 0 });
});

test('summarize does not mutate input', () => {
  const s = [3, 1, 2];
  summarize(s);
  expect(s).toEqual([3, 1, 2]);
});
