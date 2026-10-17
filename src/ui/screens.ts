import type { RankingRow } from '../game/ranking';
import { isPortrait } from '../view/viewport';

export type EndScreenOptions = {
  title: string;
  buttons: { label: string; onClick: () => void }[];
  note?: string;
};

export function showEndScreen(root: HTMLElement, ranking: RankingRow[], opts: EndScreenOptions): void {
  root.replaceChildren();
  root.style.display = '';
  const box = document.createElement('div');
  box.className = 'end-box';
  const h = document.createElement('h1');
  h.textContent = opts.title;
  box.appendChild(h);

  const table = document.createElement('table');
  const head = table.insertRow();
  for (const label of ['#', 'Pseudo', 'Score', 'Points', 'Morts', 'Taille max']) {
    const th = document.createElement('th');
    th.textContent = label;
    head.appendChild(th);
  }
  ranking.forEach((r, i) => {
    const row = table.insertRow();
    const cells = [String(i + 1), r.name, String(r.score), r.points.toLocaleString('fr-FR'), String(r.deaths), r.maxPoints.toLocaleString('fr-FR')];
    cells.forEach((text, c) => {
      const td = row.insertCell();
      td.textContent = text;
      if (c === 1) td.style.color = r.color;
    });
  });
  box.appendChild(table);

  if (opts.note) {
    const p = document.createElement('p');
    p.className = 'end-note';
    p.textContent = opts.note;
    box.appendChild(p);
  }
  const row = document.createElement('div');
  row.className = 'end-buttons';
  for (const b of opts.buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.addEventListener('click', () => {
      root.style.display = 'none';
      b.onClick();
    });
    row.appendChild(btn);
  }
  box.appendChild(row);
  root.appendChild(box);
}

export function bindPortraitOverlay(root: HTMLElement): void {
  root.textContent = 'Tourne ta tablette ↻';
  const update = () => {
    root.style.display = isPortrait(window.innerWidth, window.innerHeight) ? '' : 'none';
  };
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  update();
}
