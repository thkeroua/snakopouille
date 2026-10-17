// Écran allumé pendant le salon et la partie : sinon Chrome Android bride la page (rapport du spike).
type Sentinel = { release(): Promise<void> };
type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> };

let wanted = false;
let sentinel: Sentinel | null = null;

async function acquire(): Promise<void> {
  const api = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
  if (!api || sentinel) return;
  try {
    sentinel = await api.request('screen');
    (sentinel as unknown as EventTarget).addEventListener?.('release', () => (sentinel = null));
  } catch {
    sentinel = null; // refusé (batterie faible, onglet caché…) : on réessaiera
  }
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') void acquire();
});

export function keepAwake(): void {
  wanted = true;
  void acquire();
}

export function releaseAwake(): void {
  wanted = false;
  const s = sentinel;
  sentinel = null;
  void s?.release().catch(() => undefined);
}
