// Bonus à ramasser : icônes posées par l'hôte, effets temporaires sur le serpent qui les prend.
// Les minuteurs sont des secondes restantes, décomptées à chaque pas par chaque appareil.
import type { GameplayConfig } from '../config/gameplay';
import type { Rng } from './rng';
import { snakeWidth, type SnakeState } from './snakeMotion';

export const BONUS_KINDS = ['speed', 'ghost', 'obese', 'spikes'] as const;
export type BonusKind = (typeof BONUS_KINDS)[number];
export type BonusTimers = Record<BonusKind, number>;

export type Pickup = { id: number; x: number; y: number; kind: BonusKind };

export function noBonus(): BonusTimers {
  return { speed: 0, ghost: 0, obese: 0, spikes: 0 };
}

export function isBonusKind(k: unknown): k is BonusKind {
  return typeof k === 'string' && (BONUS_KINDS as readonly string[]).includes(k);
}

export function tickBonus(s: SnakeState, dt: number): void {
  for (const k of BONUS_KINDS) if (s.bonus[k] > 0) s.bonus[k] = Math.max(0, s.bonus[k] - dt);
}

export function clearBonus(s: SnakeState): void {
  for (const k of BONUS_KINDS) s.bonus[k] = 0;
}

export class PickupStore {
  readonly items = new Map<number, Pickup>();
  private nextId = 1;

  add(x: number, y: number, kind: BonusKind): Pickup {
    return this.insert(this.nextId, x, y, kind);
  }

  /** Miroir client : bonus reçu de l'hôte, avec son id. */
  insert(id: number, x: number, y: number, kind: BonusKind): Pickup {
    this.nextId = Math.max(this.nextId, id + 1);
    const p: Pickup = { id, x, y, kind };
    this.items.set(id, p);
    return p;
  }

  remove(id: number): void {
    this.items.delete(id);
  }

  /** Nouveau bonus au hasard (genre pondéré), ou null si la map en a déjà assez. */
  spawn(rng: Rng, cfg: GameplayConfig): Pickup | null {
    const b = cfg.bonus;
    if (this.items.size >= b.maxOnMap) return null;
    const { kind } = rng.pickWeighted(BONUS_KINDS.map((k) => ({ kind: k, weight: b[k].weight })));
    const m = b.spawnMargin;
    return this.add(rng.range(m, cfg.world.width - m), rng.range(m, cfg.world.height - m), kind);
  }

  /** Bonus touchés par le cercle (x, y, r). Quelques bonus au plus : parcours simple. */
  touching(x: number, y: number, r: number, cfg: GameplayConfig): Pickup[] {
    const out: Pickup[] = [];
    const d = r + cfg.bonus.pickupRadius;
    for (const p of this.items.values()) if ((p.x - x) ** 2 + (p.y - y) ** 2 < d * d) out.push(p);
    return out;
  }
}

/** Hachage d'un échantillon de corps : les échantillons sont fixes dans le monde, donc les pics aussi. */
function sampleHash(x: number, y: number): number {
  let h = Math.imul(Math.round(x * 4), 0x27d4eb2d) ^ Math.imul(Math.round(y * 4), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * Pics du mode spike, de part et d'autre du corps (hors zone de tête).
 * `fn(ax, ay, tx, ty, ux, uy, base, arc)` : point d'ancrage sur le bord du corps, pointe,
 * tangente unitaire du corps, demi-largeur de la base, abscisse depuis la tête.
 */
export function forEachSpike(
  s: SnakeState,
  cfg: GameplayConfig,
  fn: (ax: number, ay: number, tx: number, ty: number, ux: number, uy: number, base: number, arc: number) => void,
): void {
  const c = cfg.bonus.spikes;
  const half = snakeWidth(s, cfg) / 2;
  const base = half * c.baseFactor;
  const p = s.path;
  let arc = 0;
  for (let i = 1; i < p.count() - 1; i++) {
    arc += Math.hypot(p.x(i) - p.x(i - 1), p.y(i) - p.y(i - 1));
    if (arc < half * 2) continue;
    const x = p.x(i);
    const y = p.y(i);
    const h = sampleHash(x, y);
    if (h % c.every !== 0) continue;
    let ux = p.x(i - 1) - p.x(i + 1);
    let uy = p.y(i - 1) - p.y(i + 1);
    const ul = Math.hypot(ux, uy);
    if (ul === 0) continue;
    ux /= ul;
    uy /= ul;
    for (let side = 1; side >= -1; side -= 2) {
      const u = ((h >>> (side > 0 ? 8 : 16)) & 255) / 255;
      const len = Math.max(c.minLen, half * (c.minLenFactor + (c.maxLenFactor - c.minLenFactor) * u));
      const nx = -uy * side;
      const ny = ux * side;
      fn(x + nx * half, y + ny * half, x + nx * (half + len), y + ny * (half + len), ux, uy, base, arc);
    }
  }
}
