import type { GameplayConfig } from '../config/gameplay';
import type { Rng } from './rng';
import type { SnakeState } from './snakeMotion';
import type { Vec } from './types';

const SAMPLE_STRIDE = 4;

/**
 * Le point d'une grille de candidats le plus éloigné du serpent vivant le plus proche
 * (maximise la distance minimale). Ex aequo → tirage. Cap vers le centre de la map.
 */
export function findSpawnPoint(snakes: readonly SnakeState[], cfg: GameplayConfig, rng: Rng): { pos: Vec; angle: number } {
  const { gridCols, gridRows, margin } = cfg.spawn;
  const { width, height } = cfg.world;
  const stepX = (width - 2 * margin) / gridCols;
  const stepY = (height - 2 * margin) / gridRows;

  const pts: number[] = [];
  for (const s of snakes) {
    if (!s.alive) continue;
    const p = s.path;
    for (let i = 0; i < p.count(); i += SAMPLE_STRIDE) pts.push(p.x(i), p.y(i));
    pts.push(p.x(0), p.y(0));
  }

  let best = -1;
  let ties: Vec[] = [];
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const x = margin + stepX * (c + 0.5);
      const y = margin + stepY * (r + 0.5);
      let min = Infinity;
      for (let k = 0; k < pts.length; k += 2) {
        const d = (pts[k] - x) ** 2 + (pts[k + 1] - y) ** 2;
        if (d < min) min = d;
      }
      if (min > best) {
        best = min;
        ties = [{ x, y }];
      } else if (min === best) {
        ties.push({ x, y });
      }
    }
  }
  const pos = ties[rng.int(ties.length)];
  return { pos, angle: Math.atan2(height / 2 - pos.y, width / 2 - pos.x) };
}
