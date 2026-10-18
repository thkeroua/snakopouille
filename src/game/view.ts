import type { GameplayConfig } from '../config/gameplay';
import type { Pickup } from './bonus';
import type { Food } from './food';
import type { RankingRow } from './ranking';
import type { SnakeState } from './snakeMotion';

/** Ce que le rendu et le HUD lisent : une partie solo (Match) ou le miroir d'un client réseau. */
export interface GameView {
  readonly cfg: GameplayConfig;
  readonly snakes: readonly SnakeState[];
  readonly food: ReadonlyMap<number, Food>;
  /** Demandée par le client, pas encore confirmée par l'hôte : on ne la dessine plus. */
  readonly hiddenFood: ReadonlySet<number>;
  /** Bonus à ramasser. */
  readonly pickups: ReadonlyMap<number, Pickup>;
  /** Chrono de partie (s). */
  readonly time: number;
  readonly fever: boolean;
  readonly ended: boolean;
  ranking(): RankingRow[];
}
