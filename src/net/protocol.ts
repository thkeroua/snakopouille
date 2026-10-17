// Messages échangés entre l'hôte et les invités (JSON). Voie rapide = canal non fiable.
import type { RankingRow } from '../game/ranking';
import type { DeathCause, SnakeId } from '../game/types';

export const PROTOCOL_VERSION = 1;
/** Nourriture demandée en un seul 'eat' (quelques unités en pratique). */
export const MAX_EAT_IDS = 64;
export type ColorIndex = number; // indice dans RENDER.playerColors
export type LobbyPlayer = { id: SnakeId; name: string; color: ColorIndex; host: boolean };
export type FoodWire = [id: number, x: number, y: number, value: number];
export type SpawnWire = [id: SnakeId, life: number, x: number, y: number, angle: number];
export type HeadWire = [id: SnakeId, life: number, ts: number, x: number, y: number, angle: number, boost: 0 | 1, points: number];
export type StatsWire = [id: SnakeId, score: number, deaths: number, maxPoints: number];
export type RejectReason = 'full' | 'playing' | 'version';

export type Msg =
  // les deux sens
  | { t: 'beat' }
  | { t: 'bye' }
  // invité → hôte
  | { t: 'join'; v: number; name: string; color: ColorIndex }
  | { t: 'color'; color: ColorIndex }
  | { t: 'me'; life: number; ts: number; x: number; y: number; a: number; b: 0 | 1 } // voie rapide
  | { t: 'eat'; life: number; ids: number[] }
  | { t: 'died'; life: number; killer: SnakeId }
  // hôte → invité
  | { t: 'hello'; name: string; players: number; max: number; playing: boolean } // réponse aux sondes
  | { t: 'welcome'; you: SnakeId }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'lobby'; players: LobbyPlayer[]; code: string }
  | { t: 'start'; durationS: number; players: LobbyPlayer[]; spawns: SpawnWire[]; food: FoodWire[] }
  | { t: 'heads'; time: number; s: HeadWire[] } // voie rapide ; time = chrono de partie (s)
  | { t: 'food'; add: FoodWire[]; del: number[] }
  | { t: 'death'; victim: SnakeId; killer: SnakeId | null; cause: DeathCause; respawnAt: number }
  | { t: 'respawn'; spawn: SpawnWire }
  | { t: 'stats'; rows: StatsWire[] }
  | { t: 'left'; id: SnakeId }
  | { t: 'end'; ranking: RankingRow[] };
