import { angleDiff } from '../game/math';

type Sample = { ts: number; x: number; y: number; angle: number; boost: boolean };
export type HeadSample = { x: number; y: number; angle: number; boost: boolean };

const KEEP_MS = 1000;

/**
 * Têtes reçues d'un serpent distant, rejouées avec `delayMs` de retard sur l'horloge de
 * l'émetteur (offset = plus petit écart réception − émission vu). Après le dernier
 * échantillon, on tient la dernière position : un joueur en arrière-plan reste figé.
 */
export class HeadBuffer {
  private samples: Sample[] = [];
  private offset = Infinity;

  constructor(private readonly delayMs: number) {}

  push(ts: number, recvAt: number, x: number, y: number, angle: number, boost: boolean): void {
    const last = this.samples[this.samples.length - 1];
    if (last && ts <= last.ts) return;
    this.offset = Math.min(this.offset, recvAt - ts);
    this.samples.push({ ts, x, y, angle, boost });
  }

  sample(now: number): HeadSample | null {
    const s = this.samples;
    if (s.length === 0) return null;
    const t = now - this.offset - this.delayMs;
    // Élagage : on garde au moins l'échantillon juste avant t.
    let drop = 0;
    while (drop < s.length - 1 && s[drop + 1].ts <= t - KEEP_MS) drop++;
    if (drop > 0) s.splice(0, drop);

    if (t <= s[0].ts) return pick(s[0]);
    const lastS = s[s.length - 1];
    if (t >= lastS.ts) return pick(lastS);
    let i = 0;
    while (s[i + 1].ts < t) i++;
    const a = s[i];
    const b = s[i + 1];
    const k = (t - a.ts) / (b.ts - a.ts);
    return {
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      angle: a.angle + angleDiff(a.angle, b.angle) * k,
      boost: a.boost,
    };
  }

  clear(): void {
    this.samples = [];
    this.offset = Infinity;
  }

  size(): number {
    return this.samples.length;
  }
}

function pick(s: Sample): HeadSample {
  return { x: s.x, y: s.y, angle: s.angle, boost: s.boost };
}
