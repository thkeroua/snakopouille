// Plein écran au toucher. Sur Chrome Android, `pointerdown` d'un doigt ne compte pas comme un geste
// de l'utilisateur (seuls pointerup/touchend/click comptent) : la demande y serait refusée en silence.
// On redemande donc à chaque toucher tant qu'on n'est pas en plein écran, puis on bloque le paysage.

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

function request(): void {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement
    .requestFullscreen()
    .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape'))
    .catch(() => undefined); // refusé ou non pris en charge : on réessaiera au prochain toucher
}

export function enableFullscreenOnTap(): void {
  window.addEventListener('pointerup', request);
  window.addEventListener('click', request);
}
