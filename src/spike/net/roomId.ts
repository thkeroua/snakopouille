const IPIFY_URL = 'https://api.ipify.org?format=json';

export async function fetchPublicIp(fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(IPIFY_URL);
  if (!res.ok) throw new Error(`ipify HTTP ${res.status}`);
  const json = (await res.json()) as { ip?: unknown };
  if (typeof json.ip !== 'string' || json.ip === '') throw new Error('ipify: missing ip');
  return json.ip;
}

export async function roomIdFromIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`snakopouille:${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const SLOTS: readonly number[] = [1, 2, 3, 4];

export function peerIdForSlot(roomId: string, slot: number): string {
  return `snakopouille-${roomId}-${slot}`;
}
