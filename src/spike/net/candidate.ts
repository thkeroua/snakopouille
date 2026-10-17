export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown';

const KNOWN: readonly string[] = ['host', 'srflx', 'prflx', 'relay'];

/* eslint-disable @typescript-eslint/no-explicit-any */
function selectedPair(stats: Iterable<any>): { pair: any; byId: Map<string, any> } | null {
  const all = Array.from(stats);
  const byId = new Map<string, any>(all.filter((s) => s.id).map((s) => [s.id, s]));
  const transport = all.find((s) => s.type === 'transport' && s.selectedCandidatePairId);
  const pair =
    (transport && byId.get(transport.selectedCandidatePairId)) ??
    all.find((s) => s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated);
  return pair ? { pair, byId } : null;
}

const asType = (t: unknown): CandidateType => (KNOWN.includes(t as string) ? (t as CandidateType) : 'unknown');

export function selectedCandidateType(stats: Iterable<any>): CandidateType {
  const sel = selectedPair(stats);
  return sel ? asType(sel.byId.get(sel.pair.localCandidateId)?.candidateType) : 'unknown';
}

/** « local→distant protocole », ex. « host→prflx udp ». Le type local seul peut masquer un chemin non local. */
export function describePair(stats: Iterable<any>): string {
  const sel = selectedPair(stats);
  if (!sel) return 'unknown';
  const local = sel.byId.get(sel.pair.localCandidateId);
  const remote = sel.byId.get(sel.pair.remoteCandidateId);
  return `${asType(local?.candidateType)}→${asType(remote?.candidateType)} ${local?.protocol ?? '?'}`;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function readCandidateType(pc: RTCPeerConnection): Promise<CandidateType> {
  return selectedCandidateType((await pc.getStats()).values());
}

export async function readPairDescription(pc: RTCPeerConnection): Promise<string> {
  return describePair((await pc.getStats()).values());
}
