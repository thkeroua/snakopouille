// Mouvement de SON serpent : code « client » au plan 3. N'écrit jamais `points`.
import type { GameplayConfig } from '../config/gameplay';
import { clamp, rotateToward } from './math';
import { SnakePath } from './path';
import { targetLengthFor, widthFor } from './sizing';
import type { Player, SnakeId, SnakeInput, Vec } from './types';

export type SnakeState = {
  id: SnakeId;
  color: string;
  name: string;
  alive: boolean;
  respawnAt: number; // temps de match (s)
  points: number; // ÉCRIT UNIQUEMENT PAR hostRules
  angle: number;
  boosting: boolean;
  path: SnakePath;
};

export function createSnake(p: Player, head: Vec, angle: number, cfg: GameplayConfig): SnakeState {
  return {
    id: p.id,
    color: p.color,
    name: p.name,
    alive: true,
    respawnAt: 0,
    points: cfg.snake.startPoints,
    angle,
    boosting: false,
    path: new SnakePath(cfg.snake.sampleSpacing, head),
  };
}

export function headRadius(s: SnakeState, cfg: GameplayConfig): number {
  return widthFor(s.points, cfg) / 2;
}

export function stepMotion(s: SnakeState, input: SnakeInput, dt: number, cfg: GameplayConfig): void {
  if (!s.alive) return;
  const c = cfg.snake;
  const hx = s.path.x(0);
  const hy = s.path.y(0);

  if (input.target) {
    const dx = input.target.x - hx;
    const dy = input.target.y - hy;
    if (dx * dx + dy * dy > c.steerDeadZone * c.steerDeadZone) {
      s.angle = rotateToward(s.angle, Math.atan2(dy, dx), c.turnRateRad * dt);
    }
  }

  s.boosting = input.boost && s.points > c.minPoints;
  const dist = c.speed * (s.boosting ? c.boostMultiplier : 1) * dt;
  // Bords : la tête est contrainte dans le monde, le cap est conservé → glissement.
  const r = headRadius(s, cfg);
  const nx = clamp(hx + Math.cos(s.angle) * dist, r, cfg.world.width - r);
  const ny = clamp(hy + Math.sin(s.angle) * dist, r, cfg.world.height - r);
  if (nx !== hx || ny !== hy) s.path.moveHead({ x: nx, y: ny });
  s.path.trimTo(targetLengthFor(s.points, cfg));
}
