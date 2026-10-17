export const WORLD_W = 1600;
export const WORLD_H = 1000;
const SPACING = 4;

export type BenchSnake = { color: string; width: number; points: Float32Array };

const COLORS = ['#ff4a6e', '#5dff8a', '#4af0ff', '#ffd84a', '#ff4af0', '#ff9a3d', '#9a7bff', '#f5f5f5'];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Marche sinueuse à pas constant qui rebondit sur les bords du monde. */
function wander(samples: number, rng: () => number, margin: number): Float32Array {
  const pts = new Float32Array(samples * 2);
  let x = margin + rng() * (WORLD_W - 2 * margin);
  let y = margin + rng() * (WORLD_H - 2 * margin);
  let a = rng() * Math.PI * 2;
  const freq = 0.01 + rng() * 0.03;
  const amp = 0.04 + rng() * 0.06;
  for (let i = 0; i < samples; i++) {
    pts[2 * i] = x;
    pts[2 * i + 1] = y;
    a += Math.sin(i * freq) * amp;
    let nx = x + Math.cos(a) * SPACING;
    let ny = y + Math.sin(a) * SPACING;
    if (nx < margin || nx > WORLD_W - margin) {
      a = Math.PI - a;
      nx = x;
    }
    if (ny < margin || ny > WORLD_H - margin) {
      a = -a;
      ny = y;
    }
    x = nx;
    y = ny;
  }
  return pts;
}

export function buildScene(opts: { snakes: number; megaSamples: number; food: number; seed: number }): {
  snakes: BenchSnake[];
  food: Float32Array;
} {
  const rng = mulberry32(opts.seed);
  const snakes: BenchSnake[] = [];
  for (let i = 0; i < opts.snakes; i++) {
    const mega = i === 0;
    const width = mega ? 120 : 4 + Math.floor(rng() * 27);
    const samples = mega ? opts.megaSamples : 40 + Math.floor(rng() * 361);
    snakes.push({ color: COLORS[i % COLORS.length], width, points: wander(samples, rng, width / 2) });
  }
  const food = new Float32Array(opts.food * 3);
  for (let i = 0; i < opts.food; i++) {
    food[3 * i] = rng() * WORLD_W;
    food[3 * i + 1] = rng() * WORLD_H;
    food[3 * i + 2] = 3 + rng() * 5;
  }
  return { snakes, food };
}
