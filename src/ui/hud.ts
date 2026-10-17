import { leaderId } from '../game/hostRules';
import type { RankingRow } from '../game/ranking';
import type { SnakeId } from '../game/types';
import type { GameView } from '../game/view';

const UPDATE_MS = 200; // ≤ 5 mises à jour DOM par seconde
const TOP = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  private readonly clock: HTMLDivElement;
  private readonly fever: HTMLDivElement;
  private readonly points: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly center: HTMLDivElement;
  private last = -Infinity;

  constructor(root: HTMLElement) {
    const top = el('div', 'hud-top', root);
    this.clock = el('div', 'hud-clock', top);
    this.fever = el('div', 'hud-fever', top);
    this.fever.textContent = 'FEVER ×5';
    this.points = el('div', 'hud-panel hud-left', root);
    this.score = el('div', 'hud-panel hud-right', root);
    this.center = el('div', 'hud-center', root);
  }

  update(view: GameView, ownId: SnakeId, force = false): void {
    const now = performance.now();
    if (!force && now - this.last < UPDATE_MS) return;
    this.last = now;
    this.clock.textContent = formatClock(view.cfg.match.durationS - view.time);
    this.clock.classList.toggle('fever', view.fever);
    this.fever.style.display = view.fever ? '' : 'none';

    const rows = view.ranking();
    const leader = leaderId(view.snakes);
    const byPoints = [...rows].sort((a, b) => b.points - a.points);
    this.fill(this.points, 'POINTS', byPoints, ownId, (r) => r.points, leader);
    this.fill(this.score, 'SCORE', rows, ownId, (r) => r.score, null);

    const own = view.snakes.find((s) => s.id === ownId);
    if (own && !own.alive && !view.ended && Number.isFinite(own.respawnAt)) {
      this.center.style.display = '';
      this.center.textContent = `Réapparition dans ${Math.max(1, Math.ceil(own.respawnAt - view.time))} s`;
    } else {
      this.center.style.display = 'none';
    }
  }

  private fill(
    panel: HTMLElement,
    title: string,
    rows: RankingRow[],
    ownId: SnakeId,
    value: (r: RankingRow) => number,
    leader: SnakeId | null,
  ) {
    panel.replaceChildren();
    const t = el('div', 'hud-title', panel);
    t.textContent = title;
    const shown = rows.slice(0, TOP);
    const ownIndex = rows.findIndex((r) => r.id === ownId);
    if (ownIndex >= TOP) shown.push(rows[ownIndex]);
    for (const r of shown) {
      const line = el('div', r.id === ownId ? 'hud-row own' : 'hud-row', panel);
      line.style.color = r.color;
      const rank = rows.indexOf(r) + 1;
      line.textContent = `${r.id === leader ? '👑' : `${rank}.`} ${r.name}  ${value(r).toLocaleString('fr-FR')}`;
    }
  }
}
