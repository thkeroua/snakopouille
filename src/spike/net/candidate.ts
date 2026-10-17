export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown';

const KNOWN: readonly string[] = ['host', 'srflx', 'prflx', 'relay'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectedCandidateType(stats: Iterable<any>): CandidateType {
  const all = Array.from(stats);
  const byId = new Map(all.filter((s) => s.id).map((s) => [s.id, s]));
  const transport = all.find((s) => s.type === 'transport' && s.selectedCandidatePairId);
  const pair =
    (transport && byId.get(transport.selectedCandidatePairId)) ??
    all.find((s) => s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated);
  if (!pair) return 'unknown';
  const local = byId.get(pair.localCandidateId);
  const t = local?.candidateType;
  return KNOWN.includes(t) ? (t as CandidateType) : 'unknown';
}

export async function readCandidateType(pc: RTCPeerConnection): Promise<CandidateType> {
  return selectedCandidateType((await pc.getStats()).values());
}
