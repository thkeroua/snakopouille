import type { Match } from '../game/match';
import { leaderId } from '../game/hostRules';
import type { SnakeId } from '../game/types';

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

  update(match: Match, ownId: SnakeId, force = false): void {
    const now = performance.now();
    if (!force && now - this.last < UPDATE_MS) return;
    this.last = now;
    const h = match.host;
    this.clock.textContent = formatClock(match.cfg.match.durationS - h.time);
    this.clock.classList.toggle('fever', h.fever);
    this.fever.style.display = h.fever ? '' : 'none';

    const rows = match.ranking();
    const leader = leaderId(match.snakes);
    const byPoints = [...rows].sort((a, b) => b.points - a.points);
    this.fill(this.points, 'POINTS', byPoints, ownId, (r) => r.points, leader);
    this.fill(this.score, 'SCORE', rows, ownId, (r) => r.score, null);

    const own = match.snakes.find((s) => s.id === ownId);
    if (own && !own.alive && !h.ended) {
      this.center.style.display = '';
      this.center.textContent = `Réapparition dans ${Math.max(1, Math.ceil(own.respawnAt - h.time))} s`;
    } else {
      this.center.style.display = 'none';
    }
  }

  private fill(
    panel: HTMLElement,
    title: string,
    rows: ReturnType<Match['ranking']>,
    ownId: SnakeId,
    value: (r: ReturnType<Match['ranking']>[number]) => number,
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
