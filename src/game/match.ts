// Orchestration locale : en solo, la même machine joue le client (snakeMotion) et l'hôte (hostRules).
import type { GameplayConfig } from '../config/gameplay';
import { HostRules, createHost, type HostState } from './hostRules';
import { Rng } from './rng';
import { createSnake, stepMotion, type SnakeState } from './snakeMotion';
import { findSpawnPoint } from './spawn';
import type { MatchEvent, Player, SnakeId, SnakeInput } from './types';

export const SIM_DT = 1 / 60;
const NO_INPUT: SnakeInput = { target: null, boost: false };

export type RankingRow = {
  id: SnakeId;
  name: string;
  color: string;
  score: number;
  points: number;
  deaths: number;
  maxPoints: number;
};

export class Match {
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
    for (const s of this.snakes) {
      const input = inputs.get(s.id) ?? NO_INPUT;
      this.rules.boost(s, input, dt);
      stepMotion(s, input, dt, this.cfg);
    }
    this.rules.deaths(this.snakes, events);
    this.rules.eat(this.snakes, events);
    this.rules.spawnFood(dt);
    this.rules.finish(this.snakes, events);
    return events;
  }

  /** Score décroissant, puis points décroissants. */
  ranking(): RankingRow[] {
    return this.snakes
      .map((s) => {
        const st = this.host.stats.get(s.id)!;
        return {
          id: s.id,
          name: s.name,
          color: s.color,
          score: st.score,
          points: Math.floor(s.alive ? s.points : 0),
          deaths: st.deaths,
          maxPoints: Math.floor(st.maxPoints),
        };
      })
      .sort((a, b) => b.score - a.score || b.points - a.points);
  }
}
