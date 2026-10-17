// Tout ce que l'HÔTE possède au plan 3 : nourriture, points, têtes à tête, chrono,
// fever, scores, réapparitions.
import type { GameplayConfig } from '../config/gameplay';
import { newBoostAcc, stepBoost, type BoostAccumulator } from './boost';
import { buildBodyGrid, headClashes, headHitsBody, resolveClash, type BodyRef } from './collision';
import { FoodStore } from './food';
import type { Rng } from './rng';
import { headRadius, type SnakeState } from './snakeMotion';
import { findSpawnPoint } from './spawn';
import { SpatialGrid } from './spatialGrid';
import type { DeathCause, MatchEvent, Player, SnakeId, SnakeInput } from './types';

export type PlayerStats = { score: number; deaths: number; maxPoints: number };
export type HostState = {
  time: number;
  ended: boolean;
  fever: boolean;
  food: FoodStore;
  stats: Map<SnakeId, PlayerStats>;
  boostAcc: Map<SnakeId, BoostAccumulator>;
  spawnTimer: number;
};

type Death = { victim: SnakeId; killer: SnakeId | null; cause: DeathCause };

const BODY_CELL = 64;

export function createHost(players: readonly Player[], cfg: GameplayConfig, rng: Rng, palette: readonly string[]): HostState {
  const stats = new Map<SnakeId, PlayerStats>();
  const boostAcc = new Map<SnakeId, BoostAccumulator>();
  for (const p of players) {
    stats.set(p.id, { score: 0, deaths: 0, maxPoints: cfg.snake.startPoints });
    boostAcc.set(p.id, newBoostAcc());
  }
  return { time: 0, ended: false, fever: false, food: new FoodStore(cfg, rng, palette), stats, boostAcc, spawnTimer: 0 };
}

/** Plus de points parmi les vivants ; égalité en tête → aucun. */
export function leaderId(snakes: readonly SnakeState[]): SnakeId | null {
  let best: SnakeState | null = null;
  let tie = false;
  for (const s of snakes) {
    if (!s.alive) continue;
    if (!best || s.points > best.points) {
      best = s;
      tie = false;
    } else if (s.points === best.points) {
      tie = true;
    }
  }
  return best && !tie ? best.id : null;
}

export class HostRules {
  private readonly bodyGrid: SpatialGrid<BodyRef>;
  private readonly bodyPool: BodyRef[] = [];

  constructor(
    readonly state: HostState,
    private readonly cfg: GameplayConfig,
    private readonly rng: Rng,
  ) {
    this.bodyGrid = new SpatialGrid<BodyRef>(cfg.world.width, cfg.world.height, BODY_CELL);
  }

  /** Avance le chrono ; émet fever-start au passage du seuil. */
  clock(dt: number, events: MatchEvent[]): void {
    const st = this.state;
    st.time += dt;
    if (!st.fever && st.time >= this.cfg.match.durationS - this.cfg.match.feverLastS - 1e-9) {
      st.fever = true;
      events.push({ type: 'fever-start' });
    }
  }

  respawns(snakes: readonly SnakeState[], events: MatchEvent[]): void {
    for (const s of snakes) {
      if (s.alive || s.respawnAt > this.state.time + 1e-9) continue;
      const { pos, angle } = findSpawnPoint(snakes, this.cfg, this.rng);
      s.alive = true;
      s.points = this.cfg.snake.startPoints;
      s.angle = angle;
      s.boosting = false;
      s.path.reset(pos);
      s.prevX = pos.x;
      s.prevY = pos.y;
      this.state.boostAcc.set(s.id, newBoostAcc());
      events.push({ type: 'respawn', snake: s.id });
    }
  }

  /** Perte d'accélérateur (avant le déplacement) ; le dépôt tombe à la queue. */
  boost(s: SnakeState, input: SnakeInput, dt: number): void {
    if (!s.alive) return;
    const boosting = input.boost && s.points > this.cfg.snake.minPoints;
    const r = stepBoost(s.points, boosting, this.state.boostAcc.get(s.id)!, dt, this.cfg);
    s.points = r.newPoints;
    if (r.drop > 0) {
      const t = s.path.tail();
      this.state.food.add(t.x, t.y, r.drop, false);
    }
  }

  /**
   * Morts du pas. Les têtes à tête passent en premier : un face-à-face ne doit pas être
   * requalifié en « tête contre corps » à cause du cou de l'adversaire. Viennent ensuite les
   * morts tête contre corps signalées par les clients (réseau), puis, en solo seulement,
   * la détection locale tête contre corps.
   */
  deaths(
    snakes: readonly SnakeState[],
    events: MatchEvent[],
    reported: readonly { victim: SnakeId; killer: SnakeId }[] = [],
    detectBody = true,
  ): void {
    const byId = new Map(snakes.map((s) => [s.id, s]));
    const found = new Map<SnakeId, Death>();
    for (const c of headClashes(snakes, this.cfg)) {
      for (const d of resolveClash(c)) if (!found.has(d.victim)) found.set(d.victim, d);
    }
    for (const r of reported) {
      if (!byId.get(r.victim)?.alive || found.has(r.victim)) continue;
      found.set(r.victim, { victim: r.victim, killer: r.killer, cause: 'body' });
    }
    if (detectBody) {
      const maxHalf = buildBodyGrid(snakes, this.bodyGrid, this.cfg, this.bodyPool);
      for (const s of snakes) {
        if (!s.alive || found.has(s.id)) continue;
        const owner = headHitsBody(s, this.bodyGrid, maxHalf, this.cfg);
        if (owner !== null) found.set(s.id, { victim: s.id, killer: owner, cause: 'body' });
      }
    }
    for (const d of found.values()) {
      const s = byId.get(d.victim)!;
      const st = this.state.stats.get(s.id)!;
      st.maxPoints = Math.max(st.maxPoints, s.points);
      this.state.food.dropTrail(s.path, s.points);
      s.alive = false;
      s.boosting = false;
      s.respawnAt = this.state.time + this.cfg.match.respawnDelayS;
      st.deaths++;
      if (d.killer !== null) {
        const ks = this.state.stats.get(d.killer);
        if (ks) ks.score++;
      }
      events.push({ type: 'death', victim: d.victim, killer: d.killer, cause: d.cause });
    }
  }

  /** Nourriture sous les têtes ; à égalité, le premier serpent de la liste l'emporte. */
  eat(snakes: readonly SnakeState[], events: MatchEvent[]): void {
    const food = this.state.food;
    for (const s of snakes) {
      if (!s.alive) continue;
      for (const id of food.touching(s.path.x(0), s.path.y(0), headRadius(s, this.cfg))) {
        const f = food.items.get(id)!;
        food.remove(id);
        s.points += f.value;
        events.push({ type: 'eat', snake: s.id, foodId: id, value: f.value });
      }
    }
  }

  /** Demande de nourriture d'un client (réseau) : seuls les ids encore au sol sont crédités. */
  eatRequest(s: SnakeState, ids: readonly number[], events: MatchEvent[]): void {
    if (!s.alive) return;
    const food = this.state.food;
    for (const id of ids) {
      const f = food.items.get(id);
      if (!f) continue;
      food.remove(id);
      s.points += f.value;
      events.push({ type: 'eat', snake: s.id, foodId: id, value: f.value });
    }
  }

  spawnFood(dt: number): void {
    const st = this.state;
    st.spawnTimer += dt;
    const mult = st.fever ? this.cfg.match.feverMultiplier : 1;
    while (st.spawnTimer >= this.cfg.food.spawnIntervalS) {
      st.spawnTimer -= this.cfg.food.spawnIntervalS;
      st.food.spawnNatural(mult);
    }
  }

  finish(snakes: readonly SnakeState[], events: MatchEvent[]): void {
    for (const s of snakes) {
      if (!s.alive) continue;
      const st = this.state.stats.get(s.id)!;
      st.maxPoints = Math.max(st.maxPoints, s.points);
    }
    if (this.state.time >= this.cfg.match.durationS - 1e-9) {
      this.state.ended = true;
      events.push({ type: 'end' });
    }
  }
}
