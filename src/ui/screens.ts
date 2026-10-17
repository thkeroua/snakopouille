import type { RankingRow } from '../game/match';
import { isPortrait } from '../view/viewport';

export function showEndScreen(root: HTMLElement, ranking: RankingRow[], onReplay: () => void): void {
  root.replaceChildren();
  root.style.display = '';
  const box = document.createElement('div');
  box.className = 'end-box';
  const h = document.createElement('h1');
  h.textContent = 'Fin de partie';
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

  const btn = document.createElement('button');
  btn.textContent = 'Rejouer';
  btn.addEventListener('click', () => {
    root.style.display = 'none';
    onReplay();
  });
  box.appendChild(btn);
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
