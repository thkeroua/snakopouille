import { expect, test } from 'vitest';
import { loadPrefs, savePrefs } from '../../src/ui/prefs';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
} as unknown as Storage;

test('defaults when nothing is stored', () => {
  expect(loadPrefs(fakeStorage())).toEqual({ name: '', color: 0 });
});

test('round trip', () => {
  const s = fakeStorage();
  savePrefs({ name: 'Léa', color: 5 }, s);
  expect(loadPrefs(s)).toEqual({ name: 'Léa', color: 5 });
  expect(s.getItem('snk-name')).toBe('Léa');
  expect(s.getItem('snk-color')).toBe('5');
});

test('invalid color falls back to 0', () => {
  const s = fakeStorage();
  s.setItem('snk-color', '12');
  expect(loadPrefs(s).color).toBe(0);
  s.setItem('snk-color', 'bleu');
  expect(loadPrefs(s).color).toBe(0);
});

test('blocked storage gives defaults without throwing', () => {
  expect(loadPrefs(throwing)).toEqual({ name: '', color: 0 });
  expect(() => savePrefs({ name: 'x', color: 1 }, throwing)).not.toThrow();
});
