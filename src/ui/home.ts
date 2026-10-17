// Accueil : pseudo, couleur, créer / rejoindre (détection ou code), entraînement solo.
import { RENDER } from '../config/render';
import { normalizeCode, peerIdForCode } from '../net/code';
import type { GameInfo } from '../net/peerNet';
import type { Prefs } from './prefs';

export type HomeHandlers = {
  prefs: Prefs;
  onHost(p: Prefs): void;
  onJoin(peerId: string, p: Prefs): void;
  onSolo(p: Prefs): void;
  /** null : pas de salon (IP publique introuvable). */
  findGames(): Promise<GameInfo[] | null>;
  message?: string;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

export function colorPicker(
  parent: HTMLElement,
  selected: number,
  taken: ReadonlySet<number>,
  onPick: (c: number) => void,
): void {
  const row = el('div', parent, 'swatches');
  RENDER.playerColors.forEach((color, i) => {
    const b = el('button', row, i === selected ? 'swatch selected' : 'swatch');
    b.style.background = color;
    b.setAttribute('aria-label', `Couleur ${i + 1}`);
    b.disabled = taken.has(i) && i !== selected;
    b.addEventListener('click', () => onPick(i));
  });
}

export function showHome(root: HTMLElement, h: HomeHandlers): void {
  const prefs: Prefs = { ...h.prefs };
  root.replaceChildren();
  root.style.display = '';
  const box = el('div', root, 'screen-box');
  el('h1', box, '', 'Snakopouille');

  const name = el('input', box, 'name-input');
  name.placeholder = 'Ton pseudo';
  name.maxLength = 16;
  name.value = prefs.name;
  name.addEventListener('input', () => (prefs.name = name.value.trim()));

  const colors = el('div', box);
  const drawColors = () => {
    colors.replaceChildren();
    colorPicker(colors, prefs.color, new Set(), (c) => {
      prefs.color = c;
      drawColors();
    });
  };
  drawColors();

  const status = el('p', box, 'status', h.message ?? '');
  const busy = (text: string) => {
    status.textContent = text;
    for (const b of box.querySelectorAll('button')) (b as HTMLButtonElement).disabled = true;
  };

  const host = el('button', box, 'primary', 'Créer une partie');
  host.addEventListener('click', () => {
    busy('Création de la partie…');
    h.onHost(prefs);
  });

  el('h2', box, '', 'Parties sur ce Wi-Fi');
  const list = el('div', box, 'games');
  const refresh = el('button', box, '', 'Actualiser');
  const search = () => {
    list.textContent = 'Recherche…';
    refresh.disabled = true;
    void h.findGames().then((games) => {
      refresh.disabled = false;
      list.replaceChildren();
      if (games === null) {
        list.textContent = "Recherche impossible (pas d'internet ?) : rejoins avec un code.";
        return;
      }
      if (games.length === 0) list.textContent = 'Aucune partie trouvée sur ce Wi-Fi.';
      for (const g of games) {
        const line = el('div', list, 'game-line');
        el('span', line, '', `Partie de ${g.name} — ${g.players}/${g.max}`);
        const join = el('button', line, '', g.playing ? 'en cours' : 'Rejoindre');
        join.disabled = g.playing || g.players >= g.max;
        join.addEventListener('click', () => {
          busy('Connexion…');
          h.onJoin(g.peerId, prefs);
        });
      }
    });
  };
  refresh.addEventListener('click', search);
  search();

  el('h2', box, '', 'Rejoindre avec un code');
  const codeRow = el('div', box, 'code-row');
  const code = el('input', codeRow, 'code-input');
  code.placeholder = 'Code à 4 caractères';
  code.maxLength = 6;
  code.autocapitalize = 'characters';
  const joinCode = el('button', codeRow, '', 'Rejoindre');
  joinCode.addEventListener('click', () => {
    const c = normalizeCode(code.value);
    if (!c) {
      status.textContent = 'Code invalide';
      code.focus();
      return;
    }
    busy('Connexion…');
    h.onJoin(peerIdForCode(c), prefs);
  });

  const solo = el('button', box, 'secondary', 'Entraînement solo');
  solo.addEventListener('click', () => h.onSolo(prefs));
}

export function hideScreen(root: HTMLElement): void {
  root.style.display = 'none';
  root.replaceChildren();
}
