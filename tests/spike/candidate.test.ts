import { expect, test } from 'vitest';
import { selectedCandidateType } from '../../src/spike/net/candidate';

const report = (localType: string, viaTransport: boolean) => [
  ...(viaTransport ? [{ type: 'transport', selectedCandidatePairId: 'P1' }] : []),
  { type: 'candidate-pair', id: 'P0', state: 'failed', nominated: false, localCandidateId: 'L0' },
  { type: 'candidate-pair', id: 'P1', state: 'succeeded', nominated: true, localCandidateId: 'L1' },
  { type: 'local-candidate', id: 'L0', candidateType: 'relay' },
  { type: 'local-candidate', id: 'L1', candidateType: localType },
];

test('via transport', () => expect(selectedCandidateType(report('host', true))).toBe('host'));
test('via nominated pair', () => expect(selectedCandidateType(report('srflx', false))).toBe('srflx'));
test('relay', () => expect(selectedCandidateType(report('relay', true))).toBe('relay'));
test('nothing selected', () =>
  expect(selectedCandidateType([{ type: 'local-candidate', id: 'L', candidateType: 'host' }])).toBe('unknown'));
test('unexpected candidate type', () => expect(selectedCandidateType(report('weird', true))).toBe('unknown'));
