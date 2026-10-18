import { RENDER } from '../config/render';
import type { Viewport } from '../view/viewport';

const foodCache = new Map<string, HTMLCanvasElement>();
const bonusCache = new Map<string, HTMLCanvasElement>();

/** Icône de bonus pré-rendue : disque sombre, anneau coloré, emoji au centre. */
export function bonusSprite(icon: string, color: string, radiusPx: number): HTMLCanvasElement {
  const r = Math.max(4, Math.round(radiusPx));
  const key = `${icon}|${r}`;
  let s = bonusCache.get(key);
  if (!s) {
    const size = r * 2 + 4;
    s = document.createElement('canvas');
    s.width = s.height = size;
    const g = s.getContext('2d')!;
    const c = size / 2;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fillStyle = '#0b0e1fdd';
    g.fill();
    g.lineWidth = Math.max(2, r * 0.14);
    g.strokeStyle = color;
    g.stroke();
    g.font = `${Math.round(r * 1.1)}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(icon, c, c + r * 0.06);
    bonusCache.set(key, s);
  }
  return s;
}

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
