import type { Vec } from './types';

const INITIAL_CAPACITY = 64;

/**
 * Corps d'un serpent : échantillons tête → queue dans une deque circulaire.
 * L'indice 0 est la tête courante (mise à jour en place) ; les suivants sont des
 * points fixes espacés de `spacing`. La queue ne bouge que lorsque `trimTo` la
 * raccourcit : c'est ce qui donne la croissance « par la queue » de la spec.
 */
export class SnakePath {
  private buf: Float32Array;
  private cap: number;
  private start = 0; // indice physique de la tête
  private n = 1;
  private fixedLen = 0; // longueur de l'échantillon 1 jusqu'à la queue

  constructor(private readonly spacing: number, head: Vec) {
    this.cap = INITIAL_CAPACITY;
    this.buf = new Float32Array(this.cap * 2);
    this.buf[0] = head.x;
    this.buf[1] = head.y;
  }

  reset(head: Vec): void {
    this.start = 0;
    this.n = 1;
    this.fixedLen = 0;
    this.buf[0] = head.x;
    this.buf[1] = head.y;
  }

  count(): number {
    return this.n;
  }

  x(i: number): number {
    return this.buf[2 * ((this.start + i) % this.cap)];
  }

  y(i: number): number {
    return this.buf[2 * ((this.start + i) % this.cap) + 1];
  }

  tail(): Vec {
    return { x: this.x(this.n - 1), y: this.y(this.n - 1) };
  }

  length(): number {
    if (this.n < 2) return 0;
    return Math.hypot(this.x(0) - this.x(1), this.y(0) - this.y(1)) + this.fixedLen;
  }

  moveHead(p: Vec): void {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return; // sinon la boucle ne s'arrête jamais
    if (this.n === 1) {
      // La position de départ devient le premier point fixe ; un grand premier saut
      // (tête distante reçue tard) est échantillonné comme les autres.
      this.pushFront(p.x, p.y);
    } else {
      this.set(0, p.x, p.y);
    }
    for (;;) {
      const ax = this.x(1);
      const ay = this.y(1);
      const d = Math.hypot(p.x - ax, p.y - ay);
      if (d < this.spacing) break;
      // Nouveau point fixe à `spacing` de l'ancien, sur le segment vers la tête.
      const k = this.spacing / d;
      this.pushFront(p.x, p.y);
      this.set(1, ax + (p.x - ax) * k, ay + (p.y - ay) * k);
      this.fixedLen += this.spacing;
    }
  }

  trimTo(maxLength: number): void {
    let excess = this.length() - maxLength;
    while (excess > 1e-9 && this.n >= 2) {
      const t = this.n - 1;
      const tx = this.x(t);
      const ty = this.y(t);
      const px = this.x(t - 1);
      const py = this.y(t - 1);
      const seg = Math.hypot(px - tx, py - ty);
      const fixedSeg = t >= 2; // le segment tête↔échantillon 1 n'est pas compté dans fixedLen
      if (seg <= excess) {
        this.n--;
        if (fixedSeg) this.fixedLen -= seg;
        excess -= seg;
      } else {
        const k = excess / seg;
        this.set(t, tx + (px - tx) * k, ty + (py - ty) * k);
        if (fixedSeg) this.fixedLen -= excess;
        excess = 0;
      }
    }
    if (this.n === 1) this.fixedLen = 0;
  }

  private set(i: number, x: number, y: number): void {
    const j = 2 * ((this.start + i) % this.cap);
    this.buf[j] = x;
    this.buf[j + 1] = y;
  }

  private pushFront(x: number, y: number): void {
    if (this.n === this.cap) this.grow();
    this.start = (this.start - 1 + this.cap) % this.cap;
    this.n++;
    this.set(0, x, y);
  }

  private grow(): void {
    const next = new Float32Array(this.cap * 4);
    for (let i = 0; i < this.n; i++) {
      next[2 * i] = this.x(i);
      next[2 * i + 1] = this.y(i);
    }
    this.buf = next;
    this.cap *= 2;
    this.start = 0;
  }
}
