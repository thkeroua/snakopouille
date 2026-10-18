import type { GameplayConfig } from '../config/gameplay';
import { angleDiff } from './math';
import { forEachSpike } from './bonus';
import { headRadius, snakeWidth, type SnakeState } from './snakeMotion';
import type { SpatialGrid } from './spatialGrid';
import type { DeathCause, SnakeId } from './types';

const SPIKE_STEP = 3; // espacement des points de collision le long d'un pic
const MAX_SPIKE_REFS = 6; // par pic, même sur un très gros serpent
const MIN_SPIKE_HALF = 1;

/** `arc` = abscisse curviligne depuis la tête de son serpent ; `i` = -1 pour un pic. */
export type BodyRef = { snake: SnakeId; i: number; halfWidth: number; x: number; y: number; arc: number };

/**
 * Tous les échantillons des serpents vivants, SAUF leur zone de tête (abscisse depuis
 * la tête < demi-épaisseur) : la tête relève des collisions tête contre tête.
 * Un serpent fantôme n'a pas de corps ici (personne ne meurt dessus) ; un serpent à pics y
 * ajoute ses pics, échantillonnés de la base à la pointe.
 * Renvoie la plus grande demi-épaisseur insérée (rayon de recherche).
 * `pool` est réutilisé d'un pas à l'autre : aucune allocation par échantillon (GC sur la K10).
 */
export function buildBodyGrid(
  snakes: readonly SnakeState[],
  grid: SpatialGrid<BodyRef>,
  cfg: GameplayConfig,
  pool: BodyRef[] = [],
): number {
  grid.clear();
  let maxHalf = 0;
  let used = 0;
  const push = (snake: SnakeId, i: number, halfWidth: number, x: number, y: number, arc: number) => {
    let ref = pool[used];
    if (!ref) ref = pool[used] = { snake, i, halfWidth, x: 0, y: 0, arc: 0 };
    used++;
    ref.snake = snake;
    ref.i = i;
    ref.halfWidth = halfWidth;
    ref.x = x;
    ref.y = y;
    ref.arc = arc;
    grid.insert(x, y, ref);
  };
  for (const s of snakes) {
    if (!s.alive || s.bonus.ghost > 0) continue;
    const halfWidth = snakeWidth(s, cfg) / 2;
    if (halfWidth > maxHalf) maxHalf = halfWidth;
    const p = s.path;
    let arc = 0;
    for (let i = 1; i < p.count(); i++) {
      arc += Math.hypot(p.x(i) - p.x(i - 1), p.y(i) - p.y(i - 1));
      if (arc < halfWidth) continue;
      push(s.id, i, halfWidth, p.x(i), p.y(i), arc);
    }
    if (s.bonus.spikes > 0) {
      forEachSpike(s, cfg, (ax, ay, tx, ty, _ux, _uy, base, sArc) => {
        const len = Math.hypot(tx - ax, ty - ay);
        const n = Math.max(1, Math.ceil(len / Math.max(SPIKE_STEP, len / MAX_SPIKE_REFS)));
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          push(s.id, -1, Math.max(MIN_SPIKE_HALF, base * (1 - t)), ax + (tx - ax) * t, ay + (ty - ay) * t, sArc);
        }
      });
    }
  }
  return maxHalf;
}

/**
 * Marge du « cou » côté client : ce qu'une tête peut parcourir en deux envois réseau à pleine
 * vitesse (accélérateur + bonus vitesse).
 * Le cou d'un autre serpent relève des têtes à tête, arbitrées par l'hôte (decisions.md).
 */
export function neckExtra(cfg: GameplayConfig): number {
  return (2 * cfg.snake.speed * cfg.snake.boostMultiplier * cfg.bonus.speed.multiplier) / cfg.net.sendHz;
}

/**
 * Tête de `s` contre le corps des AUTRES serpents : id du propriétaire touché, ou null
 * (toujours null pour un fantôme).
 * Avec `neckExtra`, le cou de l'autre (arc < sa demi-épaisseur + rayon de `s` + neckExtra) est ignoré.
 */
export function headHitsBody(
  s: SnakeState,
  grid: SpatialGrid<BodyRef>,
  maxHalfWidth: number,
  cfg: GameplayConfig,
  neckExtra?: number,
): SnakeId | null {
  if (s.bonus.ghost > 0) return null;
  const hx = s.path.x(0);
  const hy = s.path.y(0);
  const r = headRadius(s, cfg);
  let hit: SnakeId | null = null;
  grid.query(hx, hy, r + maxHalfWidth, (b) => {
    if (hit !== null || b.snake === s.id) return;
    if (neckExtra !== undefined && b.arc < b.halfWidth + r + neckExtra) return;
    const d = r + b.halfWidth;
    const dx = b.x - hx;
    const dy = b.y - hy;
    if (dx * dx + dy * dy < d * d) hit = b.snake;
  });
  return hit;
}

export type HeadClash = { a: SnakeId; b: SnakeId; aFront: boolean; bFront: boolean };

/**
 * Paires de têtes en contact pendant le pas, avec pour chacune « est-ce son avant qui touche ? ».
 * Le contact est « balayé » (distance minimale entre les deux têtes sur le pas) et l'avant se
 * juge sur les positions d'AVANT le déplacement : deux petits serpents en boost peuvent se
 * croiser en un seul pas, et chacun verrait alors l'autre derrière lui.
 */
export function headClashes(snakes: readonly SnakeState[], cfg: GameplayConfig): HeadClash[] {
  const cone = (cfg.snake.headFrontHalfAngleDeg * Math.PI) / 180;
  const alive = snakes.filter((s) => s.alive);
  const out: HeadClash[] = [];
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      // Position relative de b par rapport à a, au début (0) et à la fin (1) du pas.
      const x0 = b.prevX - a.prevX;
      const y0 = b.prevY - a.prevY;
      const x1 = b.path.x(0) - a.path.x(0);
      const y1 = b.path.y(0) - a.path.y(0);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dd = dx * dx + dy * dy;
      const t = dd > 0 ? Math.max(0, Math.min(1, -(x0 * dx + y0 * dy) / dd)) : 1;
      const mx = x0 + dx * t;
      const my = y0 + dy * t;
      const d = headRadius(a, cfg) + headRadius(b, cfg);
      if (mx * mx + my * my >= d * d) continue;
      const [rx, ry] = x0 !== 0 || y0 !== 0 ? [x0, y0] : [x1, y1];
      out.push({
        a: a.id,
        b: b.id,
        aFront: Math.abs(angleDiff(a.angle, Math.atan2(ry, rx))) <= cone,
        bFront: Math.abs(angleDiff(b.angle, Math.atan2(-ry, -rx))) <= cone,
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
