import type { Vec } from '../game/types';

export type Viewport = { scale: number; offsetX: number; offsetY: number; cssWidth: number; cssHeight: number };

/** Ajuste le monde dans l'écran sans le déformer, centré, avec des bandes. */
export function fitViewport(cssW: number, cssH: number, worldW: number, worldH: number): Viewport {
  const scale = Math.min(cssW / worldW, cssH / worldH);
  return {
    scale,
    offsetX: (cssW - worldW * scale) / 2,
    offsetY: (cssH - worldH * scale) / 2,
    cssWidth: cssW,
    cssHeight: cssH,
  };
}

export function screenToWorld(v: Viewport, sx: number, sy: number): Vec {
  return { x: (sx - v.offsetX) / v.scale, y: (sy - v.offsetY) / v.scale };
}

export function isPortrait(cssW: number, cssH: number): boolean {
  return cssH > cssW;
}
