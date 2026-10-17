import type { GameplayConfig } from '../config/gameplay';
import { angleDiff } from './math';
import { widthFor } from './sizing';
import { headRadius, type SnakeState } from './snakeMotion';
import type { SpatialGrid } from './spatialGrid';
import type { DeathCause, SnakeId } from './types';

export type BodyRef = { snake: SnakeId; i: number; halfWidth: number; x: number; y: number };

/**
 * Tous les échantillons des serpents vivants, SAUF leur zone de tête (abscisse depuis
 * la tête < demi-épaisseur) : la tête relève des collisions tête contre tête.
 * Renvoie la plus grande demi-épaisseur insérée (rayon de recherche).
 */
export function buildBodyGrid(snakes: readonly SnakeState[], grid: SpatialGrid<BodyRef>, cfg: GameplayConfig): number {
  grid.clear();
  let maxHalf = 0;
  for (const s of snakes) {
    if (!s.alive) continue;
    const halfWidth = widthFor(s.points, cfg) / 2;
    if (halfWidth > maxHalf) maxHalf = halfWidth;
    const p = s.path;
    let arc = 0;
    for (let i = 1; i < p.count(); i++) {
      arc += Math.hypot(p.x(i) - p.x(i - 1), p.y(i) - p.y(i - 1));
      if (arc < halfWidth) continue;
      grid.insert(p.x(i), p.y(i), { snake: s.id, i, halfWidth, x: p.x(i), y: p.y(i) });
    }
  }
  return maxHalf;
}

/** Tête de `s` contre le corps des AUTRES serpents : id du propriétaire touché, ou null. */
export function headHitsBody(
  s: SnakeState,
  grid: SpatialGrid<BodyRef>,
  maxHalfWidth: number,
  cfg: GameplayConfig,
): SnakeId | null {
  const hx = s.path.x(0);
  const hy = s.path.y(0);
  const r = headRadius(s, cfg);
  let hit: SnakeId | null = null;
  grid.query(hx, hy, r + maxHalfWidth, (b) => {
    if (hit !== null || b.snake === s.id) return;
    const d = r + b.halfWidth;
    const dx = b.x - hx;
    const dy = b.y - hy;
    if (dx * dx + dy * dy < d * d) hit = b.snake;
  });
  return hit;
}

export type HeadClash = { a: SnakeId; b: SnakeId; aFront: boolean; bFront: boolean };

/** Paires de têtes en contact, avec pour chacune « est-ce son avant qui touche ? ». */
export function headClashes(snakes: readonly SnakeState[], cfg: GameplayConfig): HeadClash[] {
  const cone = (cfg.snake.headFrontHalfAngleDeg * Math.PI) / 180;
  const alive = snakes.filter((s) => s.alive);
  const out: HeadClash[] = [];
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const dx = b.path.x(0) - a.path.x(0);
      const dy = b.path.y(0) - a.path.y(0);
      const d = headRadius(a, cfg) + headRadius(b, cfg);
      if (dx * dx + dy * dy >= d * d) continue;
      const toB = Math.atan2(dy, dx);
      const toA = Math.atan2(-dy, -dx);
      out.push({
        a: a.id,
        b: b.id,
        aFront: Math.abs(angleDiff(a.angle, toB)) <= cone,
        bFront: Math.abs(angleDiff(b.angle, toA)) <= cone,
      });
    }
  }
  return out;
}

export function resolveClash(c: HeadClash): { victim: SnakeId; killer: SnakeId | null; cause: DeathCause }[] {
  if (c.aFront && c.bFront) {
    return [
      { victim: c.a, killer: null, cause: 'head-on' },
      { victim: c.b, killer: null, cause: 'head-on' },
    ];
  }
  if (c.aFront) return [{ victim: c.a, killer: c.b, cause: 'head-side' }];
  if (c.bFront) return [{ victim: c.b, killer: c.a, cause: 'head-side' }];
  return [];
}
