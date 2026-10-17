import type { GameplayConfig } from '../config/gameplay';

export function widthFor(points: number, cfg: GameplayConfig): number {
  const s = cfg.snake;
  return s.minWidth * Math.pow(Math.max(points, s.minPoints) / 10, s.widthExponent);
}

export function targetLengthFor(points: number, cfg: GameplayConfig): number {
  const s = cfg.snake;
  return s.lengthBase * Math.pow(Math.max(points, s.minPoints) / 10, s.lengthExponent);
}

export function boostLossPerSecond(points: number, cfg: GameplayConfig): number {
  return cfg.boost.lossCoef * Math.pow(points, cfg.boost.lossExponent);
}

export function foodRadius(value: number, cfg: GameplayConfig): number {
  return cfg.food.radiusBase + cfg.food.radiusPerSqrtValue * Math.sqrt(value);
}
