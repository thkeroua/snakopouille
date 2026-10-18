// Orchestration locale : en solo, la même machine joue le client (snakeMotion) et l'hôte (hostRules).
import type { GameplayConfig } from '../config/gameplay';
import type { Pickup } from './bonus';
import type { Food } from './food';
import { HostRules, createHost, type HostState } from './hostRules';
import { buildRanking, type RankingRow } from './ranking';
import { Rng } from './rng';
import { createSnake, stepMotion, type SnakeState } from './snakeMotion';
import { findSpawnPoint } from './spawn';
import type { MatchEvent, Player, SnakeId, SnakeInput } from './types';
import type { GameView } from './view';

export type { RankingRow } from './ranking';

export const SIM_DT = 1 / 60;
const NO_INPUT: SnakeInput = { target: null, boost: false };

const NO_HIDDEN: ReadonlySet<number> = new Set();

export class Match implements GameView {
  readonly snakes: SnakeState[] = [];
  readonly host: HostState;
  private readonly rules: HostRules;

  constructor(
    players: readonly Player[],
    readonly cfg: GameplayConfig,
    seed: number,
    palette: readonly string[],
  ) {
    const rng = new Rng(seed);
    this.host = createHost(players, cfg, rng, palette);
    this.rules = new HostRules(this.host, cfg, rng);
    for (const p of players) {
      const { pos, angle } = findSpawnPoint(this.snakes, cfg, rng);
      this.snakes.push(createSnake(p, pos, angle, cfg));
    }
    for (let i = 0; i < cfg.food.initialNatural; i++) this.host.food.spawnNatural(1);
  }

  tick(dt: number, inputs: ReadonlyMap<SnakeId, SnakeInput>): MatchEvent[] {
    if (this.host.ended) return [];
    const events: MatchEvent[] = [];
    this.rules.clock(dt, events);
    this.rules.respawns(this.snakes, events);
    this.rules.tickBonuses(this.snakes, dt);
    for (const s of this.snakes) {
      const input = inputs.get(s.id) ?? NO_INPUT;
      this.rules.boost(s, input, dt);
      stepMotion(s, input, dt, this.cfg);
    }
    this.rules.deaths(this.snakes, events);
    this.rules.eat(this.snakes, events);
    this.rules.takePickups(this.snakes, events);
    this.rules.spawnFood(dt);
    this.rules.spawnPickup(dt);
    this.rules.finish(this.snakes, events);
    return events;
  }

  get food(): ReadonlyMap<number, Food> {
    return this.host.food.items;
  }
  get pickups(): ReadonlyMap<number, Pickup> {
    return this.host.pickups.items;
  }
  get hiddenFood(): ReadonlySet<number> {
    return NO_HIDDEN;
  }
  get time(): number {
    return this.host.time;
  }
  get fever(): boolean {
    return this.host.fever;
  }
  get ended(): boolean {
    return this.host.ended;
  }

  /** Score décroissant, puis points décroissants. */
  ranking(): RankingRow[] {
    return buildRanking(this.snakes, this.host.stats);
  }
}
