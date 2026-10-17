import { expect, test } from 'vitest';
import { formatClock } from '../../src/ui/hud';

test('formatClock m:ss rounding up, never negative', () => {
  expect(formatClock(180)).toBe('3:00');
  expect(formatClock(59.2)).toBe('1:00');
  expect(formatClock(9)).toBe('0:09');
  expect(formatClock(-3)).toBe('0:00');
});
