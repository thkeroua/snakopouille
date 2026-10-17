import type { PlayerStats } from './hostRules';
import type { SnakeState } from './snakeMotion';
import type { SnakeId } from './types';

export type RankingRow = {
  id: SnakeId;
  name: string;
  color: string;
  score: number;
  points: number;
  deaths: number;
  maxPoints: number;
};

const NO_STATS: PlayerStats = { score: 0, deaths: 0, maxPoints: 0 };

/** Score décroissant, puis points décroissants. Un serpent mort affiche 0 point. */
export function buildRanking(snakes: readonly SnakeState[], stats: ReadonlyMap<SnakeId, PlayerStats>): RankingRow[] {
  return snakes
    .map((s) => {
      const st = stats.get(s.id) ?? NO_STATS;
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
