import type { GameplayConfig } from '../config/gameplay';
import type { SnakePath } from './path';
import type { Rng } from './rng';
import { foodRadius } from './sizing';
import { SpatialGrid } from './spatialGrid';

export type Food = { id: number; x: number; y: number; value: number; r: number; color: string; natural: boolean };

const CELL = 64;

export class FoodStore {
  private readonly map = new Map<number, Food>();
  private readonly grid: SpatialGrid<Food>;
  private nextId = 1;
  private natural = 0;
  private maxR = 0;

  constructor(
    private readonly cfg: GameplayConfig,
    private readonly rng: Rng,
    private readonly palette: readonly string[],
  ) {
    this.grid = new SpatialGrid<Food>(cfg.world.width, cfg.world.height, CELL);
  }

  get items(): ReadonlyMap<number, Food> {
    return this.map;
  }

  naturalCount(): number {
    return this.natural;
  }

  add(x: number, y: number, value: number, natural: boolean): Food {
    const r = foodRadius(value, this.cfg);
    const color = this.palette[this.rng.int(this.palette.length)];
    const f: Food = { id: this.nextId++, x, y, value, r, color, natural };
    this.map.set(f.id, f);
    this.grid.insert(x, y, f);
    if (natural) this.natural++;
    if (r > this.maxR) this.maxR = r;
    return f;
  }

  remove(id: number): void {
    const f = this.map.get(id);
    if (!f) return;
    this.map.delete(id);
    this.grid.remove(f.x, f.y, f);
    if (f.natural) this.natural--;
  }

  spawnNatural(multiplier: number): Food | null {
    if (this.natural >= this.cfg.food.maxNatural) return null;
    const m = this.cfg.food.spawnMargin;
    const { width, height } = this.cfg.world;
    const value = this.rng.pickWeighted(this.cfg.food.values).value * multiplier;
    return this.add(this.rng.range(m, width - m), this.rng.range(m, height - m), value, true);
  }

  /** Ids de nourriture touchée par le cercle (x, y, r). */
  touching(x: number, y: number, r: number): number[] {
    const out: number[] = [];
    this.grid.query(x, y, r + this.maxR, (f) => {
      const d = r + f.r;
      const dx = f.x - x;
      const dy = f.y - y;
      if (dx * dx + dy * dy < d * d) out.push(f.id);
    });
    return out;
  }

  /** Traînée de mort : une boule tous les deathOrbSpacing le long du corps ; total = points. */
  dropTrail(path: SnakePath, points: number): Food[] {
    const total = Math.round(points);
    const len = path.length();
    const count = Math.max(1, Math.min(total, Math.floor(len / this.cfg.food.deathOrbSpacing)));
    const base = Math.floor(total / count);
    const out: Food[] = [];
    // Parcours du corps en abscisse curviligne, une boule au milieu de chaque tronçon.
    const step = len / count;
    let target = step / 2;
    let walked = 0;
    let i = 0;
    for (let k = 0; k < count; k++) {
      let x = path.x(0);
      let y = path.y(0);
      while (i < path.count() - 1) {
        const ax = path.x(i);
        const ay = path.y(i);
        const bx = path.x(i + 1);
        const by = path.y(i + 1);
        const seg = Math.hypot(bx - ax, by - ay);
        if (walked + seg >= target) {
          const t = seg > 0 ? (target - walked) / seg : 0;
          x = ax + (bx - ax) * t;
          y = ay + (by - ay) * t;
          break;
        }
        walked += seg;
        i++;
        x = bx;
        y = by;
      }
      const value = k === count - 1 ? total - base * (count - 1) : base;
      out.push(this.add(x, y, value, false));
      target += step;
    }
    return out;
  }
}
