import type { GameplayConfig } from '../config/gameplay';
import { RENDER } from '../config/render';
import { leaderId } from '../game/hostRules';
import { widthFor } from '../game/sizing';
import type { SnakeState } from '../game/snakeMotion';
import type { SnakeId } from '../game/types';
import type { GameView } from '../game/view';
import { fitViewport, type Viewport } from '../view/viewport';
import { foodSprite, renderBackground } from './sprites';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private halo: HTMLCanvasElement | null = null;
  private view: Viewport = fitViewport(1, 1, 1, 1);
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldW: number,
    private readonly worldH: number,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  /** Applique un DPR ≤ maxDpr et refait le fond en cache. */
  resize(cssW: number, cssH: number): Viewport {
    this.dpr = Math.min(window.devicePixelRatio || 1, RENDER.maxDpr);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.view = fitViewport(cssW, cssH, this.worldW, this.worldH);
    this.bg = renderBackground(this.canvas.width, this.canvas.height, this.view, this.dpr, this.worldW, this.worldH);
    if (RENDER.glowMode === 'half') {
      this.halo = document.createElement('canvas');
      this.halo.width = Math.ceil(this.canvas.width / 2);
      this.halo.height = Math.ceil(this.canvas.height / 2);
    }
    return this.view;
  }

  draw(view: GameView, ownId: SnakeId): void {
    const ctx = this.ctx;
    const { scale, offsetX, offsetY } = this.view;
    const k = scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(k, 0, 0, k, offsetX * this.dpr, offsetY * this.dpr);

    const hidden = view.hiddenFood;
    for (const f of view.food.values()) {
      if (hidden.size > 0 && hidden.has(f.id)) continue;
      const sprite = foodSprite(f.color, f.r * k);
      const half = sprite.width / 2 / k;
      ctx.drawImage(sprite, f.x - half, f.y - half, half * 2, half * 2);
    }

    const order = view.snakes
      .filter((s) => s.alive && s.id !== ownId)
      .sort((a, b) => b.points - a.points);
    const own = view.snakes.find((s) => s.id === ownId && s.alive);
    if (own) order.push(own);

    const cfg = view.cfg;
    if (RENDER.glowMode === 'half') this.drawHalfHalo(order, k, cfg);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of order) {
      const w = widthFor(s.points, cfg);
      this.tracePath(ctx, s);
      ctx.strokeStyle = s.color;
      if (RENDER.glowMode === 'stroke') {
        ctx.globalAlpha = RENDER.glowAlpha;
        ctx.lineWidth = w * RENDER.glowWidthFactor;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = w;
      ctx.stroke();
      this.drawHead(s, w / 2);
    }

    if (own) this.drawOwnMarker(own, widthFor(own.points, cfg) / 2);
    const leader = leaderId(view.snakes);
    const crowned = leader && view.snakes.find((s) => s.id === leader);
    if (crowned) this.drawCrown(crowned, widthFor(crowned.points, cfg) / 2);
  }

  private tracePath(c: CanvasRenderingContext2D, s: SnakeState) {
    const p = s.path;
    c.beginPath();
    c.moveTo(p.x(0), p.y(0));
    for (let i = 1; i < p.count(); i++) c.lineTo(p.x(i), p.y(i));
    if (p.count() === 1) c.lineTo(p.x(0) + 0.01, p.y(0));
  }

  private drawHalfHalo(order: SnakeState[], k: number, cfg: GameplayConfig) {
    const h = this.halo;
    if (!h) return;
    const g = h.getContext('2d')!;
    const { offsetX, offsetY } = this.view;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, h.width, h.height);
    g.setTransform(k / 2, 0, 0, k / 2, (offsetX * this.dpr) / 2, (offsetY * this.dpr) / 2);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const s of order) {
      this.tracePath(g, s);
      g.strokeStyle = s.color;
      g.lineWidth = widthFor(s.points, cfg) * RENDER.glowWidthFactor;
      g.stroke();
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = RENDER.glowAlpha;
    ctx.drawImage(h, 0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  private drawHead(s: SnakeState, r: number) {
    const ctx = this.ctx;
    const x = s.path.x(0);
    const y = s.path.y(0);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
    const ex = Math.cos(s.angle);
    const ey = Math.sin(s.angle);
    for (const side of [-1, 1]) {
      const cx = x + ex * r * 0.35 - ey * side * r * 0.5;
      const cy = y + ey * r * 0.35 + ex * side * r * 0.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0e1f';
      ctx.beginPath();
      ctx.arc(cx + ex * r * 0.12, cy + ey * r * 0.12, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawOwnMarker(s: SnakeState, r: number) {
    const ctx = this.ctx;
    const x = s.path.x(0);
    const y = s.path.y(0);
    const px = 1 / this.view.scale; // 1 px CSS en unités monde
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.1 + RENDER.ownRingGap, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const font = RENDER.minLabelPx * px;
    ctx.font = `bold ${font}px sans-serif`;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'bottom';
    ctx.fillText('Toi', x + r + RENDER.ownRingGap, y - r - RENDER.ownRingGap * 0.5);
    ctx.restore();
  }

  private drawCrown(s: SnakeState, r: number) {
    const ctx = this.ctx;
    const size = Math.max(r * 1.4, RENDER.minCrownPx / this.view.scale);
    // Posée du côté opposé au cap, centrée sur l'axe du serpent.
    const bx = -Math.cos(s.angle);
    const by = -Math.sin(s.angle);
    const cx = s.path.x(0) + bx * (r + size * 0.2);
    const cy = s.path.y(0) + by * (r + size * 0.2);
    // Rotation qui amène le « haut » de la couronne (0,-1) sur (bx, by).
    const ang = Math.atan2(bx, -by);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = RENDER.crownColor;
    ctx.beginPath();
    const w = size;
    const h = size * 0.8;
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w / 2, -h);
    ctx.lineTo(-w / 4, -h * 0.45);
    ctx.lineTo(0, -h);
    ctx.lineTo(w / 4, -h * 0.45);
    ctx.lineTo(w / 2, -h);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
