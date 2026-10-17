// Boucle d'une partie réseau : hôte (si on l'est) puis client, à pas fixe ; rendu du miroir client.
import { SIM_DT } from '../game/match';
import type { ClientSession } from '../net/clientSession';
import type { HostSession } from '../net/hostSession';
import type { GameShell } from './shell';

const MAX_STEPS_PER_FRAME = 5;

/** Démarre la boucle ; renvoie la fonction qui l'arrête. */
export function runOnline(shell: GameShell, session: ClientSession, host: HostSession | null): () => void {
  let stopped = false;
  let acc = 0;
  let lastT = performance.now();
  shell.showGame(true);

  function frame(t: number) {
    if (stopped) return;
    acc += (t - lastT) / 1000;
    lastT = t;
    if (acc > SIM_DT * MAX_STEPS_PER_FRAME) acc = SIM_DT * MAX_STEPS_PER_FRAME;
    while (acc >= SIM_DT) {
      acc -= SIM_DT;
      host?.tick(SIM_DT);
      session.tick(SIM_DT, shell.controls.read());
    }
    const you = session.you;
    if (you && (session.phase === 'playing' || session.phase === 'ended')) {
      shell.renderer.draw(session, you);
      shell.hud.update(session, you);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => {
    stopped = true;
  };
}
