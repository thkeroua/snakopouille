// Couche de jeu commune au solo et au réseau : canvas, contrôles, HUD, écran de fin.
// Créée une seule fois : les écouteurs DOM ne sont jamais dupliqués d'une partie à l'autre.
import { GAMEPLAY } from '../config/gameplay';
import { Controls } from '../input/controls';
import { Renderer } from '../render/renderer';
import { Hud } from '../ui/hud';
import type { Viewport } from '../view/viewport';

export class GameShell {
  readonly renderer: Renderer;
  readonly controls: Controls;
  readonly hud: Hud;
  readonly endRoot: HTMLElement;
  readonly fpsEl: HTMLElement;
  private view: Viewport;
  private readonly confirmRoot: HTMLElement;
  private exit: { onExit: () => void; warning?: string } | null = null;

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas, GAMEPLAY.world.width, GAMEPLAY.world.height);
    this.view = this.renderer.resize(window.innerWidth, window.innerHeight);
    const onResize = () => (this.view = this.renderer.resize(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.controls = new Controls(canvas, document.getElementById('boost')!, () => this.view);
    this.hud = new Hud(document.getElementById('hud')!);
    this.endRoot = document.getElementById('end')!;
    this.fpsEl = document.getElementById('fps')!;
    this.confirmRoot = document.getElementById('confirm')!;
    document.getElementById('menu')!.addEventListener('click', () => this.askExit());
  }

  /** Action du bouton « menu » (en bas à gauche) ; null : bouton sans effet. */
  setExit(onExit: (() => void) | null, warning?: string): void {
    this.exit = onExit ? { onExit, warning } : null;
    this.hideConfirm();
  }

  /** Demande confirmation avant de quitter : un tapotement par erreur ne doit pas couper la partie. */
  private askExit(): void {
    const exit = this.exit;
    if (!exit) return;
    const box = document.createElement('div');
    box.className = 'end-box';
    const h = document.createElement('h1');
    h.textContent = 'Retourner au menu ?';
    box.appendChild(h);
    if (exit.warning) {
      const p = document.createElement('p');
      p.className = 'end-note';
      p.textContent = exit.warning;
      box.appendChild(p);
    }
    const row = document.createElement('div');
    row.className = 'end-buttons';
    const button = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', onClick);
      row.appendChild(b);
    };
    button('Continuer', () => this.hideConfirm());
    button('Menu', () => {
      this.setExit(null);
      exit.onExit();
    });
    box.appendChild(row);
    this.confirmRoot.replaceChildren(box);
    this.confirmRoot.style.display = '';
  }

  private hideConfirm(): void {
    this.confirmRoot.style.display = 'none';
  }

  /** Affiche la couche de jeu (true) ou les écrans d'accueil/salon (false). */
  showGame(on: boolean): void {
    document.body.classList.toggle('in-game', on);
    if (!on) {
      this.hideEnd();
      this.setExit(null);
    }
  }

  hideEnd(): void {
    this.endRoot.style.display = 'none';
  }
}
