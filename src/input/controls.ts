import type { SnakeInput, Vec } from '../game/types';
import { screenToWorld, type Viewport } from '../view/viewport';

/**
 * Doigt / souris / clavier → SnakeInput.
 * Le premier pointeur posé sur le canvas pilote jusqu'à ce qu'il se lève ; la tête vise
 * sa position courante. Le bouton accélérateur (et Espace, et le clic droit) accélère ;
 * ses pointeurs ne pilotent jamais.
 */
export class Controls {
  private steerId: number | null = null;
  private target: Vec | null = null;
  private boostPointers = new Set<number>();
  private keyBoost = false;
  private rightBoost = false;
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    boostButton: HTMLElement,
    private readonly getViewport: () => Viewport,
  ) {
    canvas.style.touchAction = 'none';
    boostButton.style.touchAction = 'none';
    this.on(canvas, 'pointerdown', (e) => this.onDown(e as PointerEvent));
    this.on(canvas, 'pointermove', (e) => this.onMove(e as PointerEvent));
    this.on(canvas, 'pointerup', (e) => this.onUp(e as PointerEvent));
    this.on(canvas, 'pointercancel', (e) => this.onUp(e as PointerEvent));
    this.on(canvas, 'contextmenu', (e) => e.preventDefault());
    this.on(boostButton, 'pointerdown', (e) => {
      const pe = e as PointerEvent;
      pe.preventDefault();
      pe.stopPropagation();
      this.boostPointers.add(pe.pointerId);
      boostButton.setPointerCapture?.(pe.pointerId);
    });
    const releaseBoost = (e: Event) => this.boostPointers.delete((e as PointerEvent).pointerId);
    this.on(boostButton, 'pointerup', releaseBoost);
    this.on(boostButton, 'pointercancel', releaseBoost);
    this.on(boostButton, 'contextmenu', (e) => e.preventDefault());
    this.on(window, 'keydown', (e) => {
      if ((e as KeyboardEvent).code === 'Space') {
        e.preventDefault();
        this.keyBoost = true;
      }
    });
    this.on(window, 'keyup', (e) => {
      if ((e as KeyboardEvent).code === 'Space') this.keyBoost = false;
    });
    this.on(window, 'blur', () => {
      this.keyBoost = this.rightBoost = false;
      this.boostPointers.clear();
      this.release();
    });
  }

  read(): SnakeInput {
    return { target: this.target, boost: this.keyBoost || this.rightBoost || this.boostPointers.size > 0 };
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }

  private on(el: EventTarget, type: string, fn: (e: Event) => void) {
    el.addEventListener(type, fn, { passive: false });
    this.off.push(() => el.removeEventListener(type, fn));
  }

  private onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (e.button === 2) {
        this.rightBoost = true;
        return;
      }
      if (e.button !== 0) return;
    }
    if (this.steerId !== null) return;
    this.steerId = e.pointerId;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.aim(e);
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId !== this.steerId) return;
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      this.release();
      return;
    }
    this.aim(e);
  }

  private onUp(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button === 2) this.rightBoost = false;
    if (e.pointerId === this.steerId) this.release();
  }

  private release() {
    this.steerId = null;
    this.target = null;
  }

  private aim(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.target = screenToWorld(this.getViewport(), e.clientX - rect.left, e.clientY - rect.top);
  }
}
