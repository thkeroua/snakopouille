import { SLOTS, peerIdForSlot } from './roomId';

export async function claimSlot(
  tryOpen: (peerId: string) => Promise<'ok' | 'taken'>,
  roomId: string,
): Promise<{ slot: number; peerId: string } | null> {
  for (const slot of SLOTS) {
    const peerId = peerIdForSlot(roomId, slot);
    if ((await tryOpen(peerId)) === 'ok') return { slot, peerId };
  }
  return null;
}
