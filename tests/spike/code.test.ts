import { expect, test } from 'vitest';
import { generateCode, normalizeCode, peerIdForCode } from '../../src/spike/net/code';

test('generateCode uses alphabet, length 4', () => {
  for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/);
});

test('generateCode uses injected rng', () => {
  expect(generateCode(() => 0)).toBe('AAAA');
});

test('normalizeCode', () => {
  expect(normalizeCode(' k7qz ')).toBe('K7QZ');
  expect(normalizeCode('k7 qz')).toBe('K7QZ');
  expect(normalizeCode('K7Q')).toBeNull();
  expect(normalizeCode('K7Q0')).toBeNull();
  expect(normalizeCode('K7QI')).toBeNull();
});

test('peerIdForCode', () => {
  expect(peerIdForCode('K7QZ')).toBe('snakopouille-code-K7QZ');
});
