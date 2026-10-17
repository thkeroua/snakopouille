import type { GameplayConfig } from '../config/gameplay';
import { boostLossPerSecond } from './sizing';

export type BoostAccumulator = { pending: number; sinceDrop: number };

export function newBoostAcc(): BoostAccumulator {
  return { pending: 0, sinceDrop: 0 };
}

/**
 * Perte du pas (jamais sous minPoints), cumulée dans `pending`. Tous les dropIntervalS,
 * renvoie la partie entière à déposer derrière la queue ; le reste fractionnaire attend.
 */
export function stepBoost(
  points: number,
  boosting: boolean,
  acc: BoostAccumulator,
  dt: number,
  cfg: GameplayConfig,
): { newPoints: number; drop: number } {
  if (!boosting) return { newPoints: points, drop: 0 };
  const loss = Math.min(boostLossPerSecond(points, cfg) * dt, Math.max(0, points - cfg.snake.minPoints));
  acc.pending += loss;
  acc.sinceDrop += dt;
  let drop = 0;
  if (acc.sinceDrop >= cfg.boost.dropIntervalS - 1e-9) {
    acc.sinceDrop = 0;
    drop = Math.floor(acc.pending);
    acc.pending -= drop;
  }
  return { newPoints: points - loss, drop };
}
