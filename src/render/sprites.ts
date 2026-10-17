import { RENDER } from '../config/render';
import type { Viewport } from '../view/viewport';

const foodCache = new Map<string, HTMLCanvasElement>();

/** Halo de nourriture pré-rendu : cœur plein puis dégradé vers la transparence (3× le rayon). */
export function foodSprite(color: string, radiusPx: number): HTMLCanvasElement {
  const r = Math.max(1, Math.round(radiusPx));
  const key = `${color}|${r}`;
  let s = foodCache.get(key);
  if (!s) {
    const size = r * 6;
    s = document.createElement('canvas');
    s.width = s.height = size;
    const g = s.getContext('2d')!;
    const c = size / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, color);
    grad.addColorStop(0.32, color);
    grad.addColorStop(0.36, `${color}66`);
    grad.addColorStop(1, `${color}00`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    foodCache.set(key, s);
  }
  return s;
}

/** Fond complet (bandes + monde + motif losange) en pixels réels du canvas. */
export function renderBackground(width: number, height: number, v: Viewport, dpr: number, worldW: number, worldH: number): HTMLCanvasElement {
  const bg = document.createElement('canvas');
  bg.width = width;
  bg.height = height;
  const g = bg.getContext('2d')!;
  g.fillStyle = RENDER.band;
  g.fillRect(0, 0, width, height);
  g.setTransform(v.scale * dpr, 0, 0, v.scale * dpr, v.offsetX * dpr, v.offsetY * dpr);
  g.fillStyle = RENDER.background;
  g.fillRect(0, 0, worldW, worldH);
  g.strokeStyle = RENDER.gridLine;
  g.lineWidth = 1 / v.scale;
  const c = RENDER.gridCell;
  g.beginPath();
  for (let y = 0; y < worldH; y += c) {
    for (let x = 0; x < worldW; x += c) {
      g.moveTo(x, y + c / 2);
      g.lineTo(x + c / 2, y);
      g.lineTo(x + c, y + c / 2);
      g.lineTo(x + c / 2, y + c);
      g.closePath();
    }
  }
  g.stroke();
  return bg;
}
