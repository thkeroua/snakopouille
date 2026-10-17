// Salon d'attente : joueurs et couleurs ; l'hôte lance la partie.
import { RENDER } from '../config/render';
import type { ClientSession } from '../net/clientSession';
import { colorPicker } from './home';

export function showLobby(root: HTMLElement, session: ClientSession, opts: { isHost: boolean; onStart(): void; onLeave(): void }): void {
  root.replaceChildren();
  root.style.display = '';
  const box = document.createElement('div');
  box.className = 'screen-box';
  root.appendChild(box);

  const h1 = document.createElement('h1');
  h1.textContent = session.code ? `Salon — code ${session.code}` : 'Salon';
  box.appendChild(h1);

  const list = document.createElement('ul');
  list.className = 'players';
  for (const p of session.lobby) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = RENDER.playerColors[p.color] ?? '#fff';
    li.appendChild(dot);
    const name = document.createElement('span');
    name.textContent = `${p.name}${p.host ? ' (hôte)' : ''}${p.id === session.you ? ' — toi' : ''}`;
    name.style.color = RENDER.playerColors[p.color] ?? '#fff';
    li.appendChild(name);
    list.appendChild(li);
  }
  box.appendChild(list);

  const me = session.lobby.find((p) => p.id === session.you);
  if (me) {
    const taken = new Set(session.lobby.filter((p) => p.id !== me.id).map((p) => p.color));
    colorPicker(box, me.color, taken, (c) => session.setColor(c));
  }

  if (opts.isHost) {
    const start = document.createElement('button');
    start.className = 'primary';
    start.textContent = 'Lancer la partie';
    start.addEventListener('click', opts.onStart);
    box.appendChild(start);
  } else {
    const wait = document.createElement('p');
    wait.className = 'status';
    wait.textContent = "En attente du lancement par l'hôte…";
    box.appendChild(wait);
  }

  const leave = document.createElement('button');
  leave.className = 'secondary';
  leave.textContent = 'Quitter';
  leave.addEventListener('click', opts.onLeave);
  box.appendChild(leave);
}
