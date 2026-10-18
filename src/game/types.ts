import type { BonusKind } from './bonus';

export type SnakeId = string;
export type Vec = { x: number; y: number };
export type SnakeInput = { target: Vec | null; boost: boolean };
export type Player = { id: SnakeId; name: string; color: string };
export type DeathCause = 'body' | 'head-on' | 'head-side';
export type MatchEvent =
  | { type: 'death'; victim: SnakeId; killer: SnakeId | null; cause: DeathCause }
  | { type: 'eat'; snake: SnakeId; foodId: number; value: number }
  | { type: 'bonus'; snake: SnakeId; kind: BonusKind; pickupId: number }
  | { type: 'respawn'; snake: SnakeId }
  | { type: 'fever-start' }
  | { type: 'end' };
