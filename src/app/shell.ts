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
  }

  /** Affiche la couche de jeu (true) ou les écrans d'accueil/salon (false). */
  showGame(on: boolean): void {
    document.body.classList.toggle('in-game', on);
    if (!on) this.hideEnd();
  }

  hideEnd(): void {
    this.endRoot.style.display = 'none';
  }
}
