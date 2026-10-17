import { GAMEPLAY, withConfig, type GameplayConfig } from './config/gameplay';
import { RENDER } from './config/render';
import { dummyInput } from './debug/dummies';
import { Rng } from './game/rng';
import { Match, SIM_DT } from './game/match';
import type { Player, SnakeInput } from './game/types';
import { Controls } from './input/controls';
import { Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import { bindPortraitOverlay, showEndScreen } from './ui/screens';
import type { Viewport } from './view/viewport';

const MAX_STEPS_PER_FRAME = 5;
const OWN_ID = 'me';

// ---------- paramètres d'URL (debug / test) ----------
const params = new URLSearchParams(location.search);
const num = (k: string, def: number) => {
  const v = Number(params.get(k));
  return params.has(k) && Number.isFinite(v) ? v : def;
};
const dummies = Math.max(0, Math.min(GAMEPLAY.maxPlayers - 1, Math.floor(num('dummies', 3))));
const name = (params.get('name') ?? 'Toi').slice(0, 16);
const showFps = params.get('fps') === '1';
const startPointsOverride = params.has('startPoints') ? num('startPoints', GAMEPLAY.snake.startPoints) : null;
const cfg: GameplayConfig = withConfig(GAMEPLAY, {
  match: { durationS: num('duration', GAMEPLAY.match.durationS) },
});
let seed = num('seed', Date.now());

// ---------- DOM ----------
const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud')!;
const boostBtn = document.getElementById('boost')!;
const endRoot = document.getElementById('end')!;
const fpsEl = document.getElementById('fps')!;
bindPortraitOverlay(document.getElementById('portrait')!);
fpsEl.style.display = showFps ? '' : 'none';

const renderer = new Renderer(canvas, cfg.world.width, cfg.world.height);
let viewport: Viewport = renderer.resize(window.innerWidth, window.innerHeight);
const onResize = () => (viewport = renderer.resize(window.innerWidth, window.innerHeight));
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

const controls = new Controls(canvas, boostBtn, () => viewport);
const hud = new Hud(hudRoot);

window.addEventListener(
  'pointerdown',
  () => {
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  },
  { once: true },
);

// ---------- partie ----------
const players: Player[] = [
  { id: OWN_ID, name, color: RENDER.playerColors[0] },
  ...Array.from({ length: dummies }, (_, i) => ({ id: `dummy${i + 1}`, name: `Mannequin ${i + 1}`, color: RENDER.playerColors[i + 1] })),
];

let match: Match;
let dummyRng: Rng;
let ended = false;

function newMatch() {
  match = new Match(players, cfg, seed, RENDER.foodColors);
  dummyRng = new Rng(seed ^ 0x9e3779b9);
  seed = (seed * 1664525 + 1013904223) >>> 0;
  if (startPointsOverride !== null) match.snakes[0].points = startPointsOverride;
  ended = false;
  hud.update(match, OWN_ID, true);
}
newMatch();

// ---------- boucle ----------
let acc = 0;
let lastT = performance.now();
let frames = 0;
let fpsT = lastT;
let simMs = 0;

function frame(t: number) {
  acc += (t - lastT) / 1000;
  lastT = t;
  if (acc > SIM_DT * MAX_STEPS_PER_FRAME) acc = SIM_DT * MAX_STEPS_PER_FRAME; // on abandonne le retard

  const s0 = performance.now();
  while (acc >= SIM_DT && !ended) {
    acc -= SIM_DT;
    const inputs = new Map<string, SnakeInput>([[OWN_ID, controls.read()]]);
    for (const s of match.snakes) if (s.id !== OWN_ID) inputs.set(s.id, dummyInput(s, match.host.time, dummyRng, cfg.world.width, cfg.world.height));
    const events = match.tick(SIM_DT, inputs);
    if (events.some((e) => e.type === 'end')) {
      ended = true;
      hud.update(match, OWN_ID, true);
      showEndScreen(endRoot, match.ranking(), newMatch);
    }
  }
  if (ended) acc = 0;
  simMs += performance.now() - s0;

  renderer.draw(match, OWN_ID);
  hud.update(match, OWN_ID);

  frames++;
  if (showFps && t - fpsT >= 1000) {
    const own = match.snakes[0];
    fpsEl.textContent = `${Math.round((frames * 1000) / (t - fpsT))} FPS · sim ${(simMs / frames).toFixed(2)} ms · ${Math.floor(own.points)} pts · ${own.path.count()} éch.`;
    frames = 0;
    simMs = 0;
    fpsT = t;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
