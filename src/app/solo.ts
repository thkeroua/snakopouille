// Entraînement solo contre des mannequins (l'ancien src/main.ts du plan 2).
import { GAMEPLAY, withConfig, type GameplayConfig } from '../config/gameplay';
import { RENDER } from '../config/render';
import { dummyInput } from '../debug/dummies';
import { Match, SIM_DT } from '../game/match';
import { Rng } from '../game/rng';
import type { Player, SnakeInput } from '../game/types';
import { showEndScreen } from '../ui/screens';
import type { GameShell } from './shell';

const MAX_STEPS_PER_FRAME = 5;
const OWN_ID = 'me';

/** Paramètres d'URL (debug / test) : dummies, name, fps, startPoints, duration, seed. */
export function startSolo(shell: GameShell, params: URLSearchParams, name: string, onExit: () => void): () => void {
  const num = (k: string, def: number) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isFinite(v) ? v : def;
  };
  const dummies = Math.max(0, Math.min(GAMEPLAY.maxPlayers - 1, Math.floor(num('dummies', 3))));
  const showFps = params.get('fps') === '1';
  const startPointsOverride = params.has('startPoints') ? num('startPoints', GAMEPLAY.snake.startPoints) : null;
  const cfg: GameplayConfig = withConfig(GAMEPLAY, { match: { durationS: num('duration', GAMEPLAY.match.durationS) } });
  let seed = num('seed', Date.now());

  shell.fpsEl.style.display = showFps ? '' : 'none';
  shell.showGame(true);

  const players: Player[] = [
    { id: OWN_ID, name: (params.get('name') ?? name ?? '').slice(0, 16) || 'Toi', color: RENDER.playerColors[0] },
    ...Array.from({ length: dummies }, (_, i) => ({ id: `dummy${i + 1}`, name: `Mannequin ${i + 1}`, color: RENDER.playerColors[i + 1] })),
  ];

  let match: Match;
  let dummyRng: Rng;
  let ended = false;
  let stopped = false;

  function newMatch() {
    match = new Match(players, cfg, seed, RENDER.foodColors);
    dummyRng = new Rng(seed ^ 0x9e3779b9);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    if (startPointsOverride !== null) match.snakes[0].points = startPointsOverride;
    ended = false;
    shell.hud.update(match, OWN_ID, true);
  }
  newMatch();
  shell.setExit(exit);

  const inputs = new Map<string, SnakeInput>(); // réutilisée à chaque pas
  let acc = 0;
  let lastT = performance.now();
  let frames = 0;
  let fpsT = lastT;
  let simMs = 0;

  function frame(t: number) {
    if (stopped) return;
    acc += (t - lastT) / 1000;
    lastT = t;
    if (acc > SIM_DT * MAX_STEPS_PER_FRAME) acc = SIM_DT * MAX_STEPS_PER_FRAME; // on abandonne le retard

    const s0 = performance.now();
    while (acc >= SIM_DT && !ended) {
      acc -= SIM_DT;
      inputs.set(OWN_ID, shell.controls.read());
      for (const s of match.snakes) if (s.id !== OWN_ID) inputs.set(s.id, dummyInput(s, match.host.time, dummyRng, cfg.world.width, cfg.world.height));
      const events = match.tick(SIM_DT, inputs);
      if (events.some((e) => e.type === 'end')) {
        ended = true;
        shell.hud.update(match, OWN_ID, true);
        showEndScreen(shell.endRoot, match.ranking(), {
          title: 'Fin de partie',
          buttons: [
            { label: 'Rejouer', onClick: newMatch },
            { label: 'Menu', onClick: exit },
          ],
        });
      }
    }
    if (ended) acc = 0;
    simMs += performance.now() - s0;

    shell.renderer.draw(match, OWN_ID);
    shell.hud.update(match, OWN_ID);

    frames++;
    if (showFps && t - fpsT >= 1000) {
      const own = match.snakes[0];
      shell.fpsEl.textContent = `${Math.round((frames * 1000) / (t - fpsT))} FPS · sim ${(simMs / frames).toFixed(2)} ms · ${Math.floor(own.points)} pts · ${own.path.count()} éch.`;
      frames = 0;
      simMs = 0;
      fpsT = t;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function stop() {
    stopped = true;
    shell.fpsEl.style.display = 'none';
  }
  function exit() {
    stop();
    onExit();
  }
  return stop;
}
