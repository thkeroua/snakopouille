// Serpent des autres : le corps est reconstruit à partir des positions de tête reçues.
import type { GameplayConfig } from '../config/gameplay';
import { targetLengthFor } from './sizing';
import type { SnakeState } from './snakeMotion';

export function applyHead(
  s: SnakeState,
  x: number,
  y: number,
  angle: number,
  boosting: boolean,
  points: number,
  cfg: GameplayConfig,
): void {
  s.prevX = s.path.x(0);
  s.prevY = s.path.y(0);
  s.points = points;
  s.angle = angle;
  s.boosting = boosting;
  if (x !== s.prevX || y !== s.prevY) s.path.moveHead({ x, y });
  s.path.trimTo(targetLengthFor(points, cfg));
}
