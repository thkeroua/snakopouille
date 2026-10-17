import { summarize } from '../net/stats';
import { WORLD_H, WORLD_W, buildScene, type BenchSnake } from './scene';

type Mode = 'plain' | 'glow' | 'glow-half' | 'shadow';
const BENCH_MS = 10_000;
const FOOD_COLORS = ['#ffd84a', '#4af0ff', '#ff4af0', '#5dff8a'];

document.head.insertAdjacentHTML(
  'beforeend',
  `<style>
    html, body { margin: 0; height: 100%; background: #000; overflow: hidden; font: 16px sans-serif; color: #fff; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    #panel { position: absolute; left: 8px; top: 8px; display: flex; flex-wrap: wrap; gap: 6px; max-width: 70%; }
    #panel button { font: inherit; padding: 10px 12px; border: 0; border-radius: 8px; background: #1b2140cc; color: #9aa3d0; }
    #panel button.on { color: #5dff8a; outline: 2px solid #5dff8a; }
    #out { position: absolute; left: 8px; bottom: 8px; white-space: pre; background: #000c; padding: 8px; border-radius: 8px; font-size: 14px; }
  </style>`,
);
document.getElementById('app')!.innerHTML = `<canvas id="c"></canvas><div id="panel"></div><div id="out">Prêt.</div>`;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const panel = document.getElementById('panel')!;
const out = document.getElementById('out')!;

const settings = { mode: 'glow' as Mode, mega: 3000, dpr: 1.5 };
let scene = buildScene({ snakes: 8, megaSamples: settings.mega, food: 500, seed: 1 });
let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
const results: string[] = [];

function group(label: string, values: (string | number)[], get: () => string | number, set: (v: never) => void) {
  for (const v of values) {
    const b = document.createElement('button');
    b.textContent = `${label} ${v}`;
    const refresh = () => b.classList.toggle('on', get() === v);
    b.addEventListener('click', () => {
      set(v as never);
      for (const el of panel.querySelectorAll('button')) el.dispatchEvent(new Event('refresh'));
    });
    b.addEventListener('refresh', refresh);
    refresh();
    panel.appendChild(b);
  }
}
group('mode', ['plain', 'glow', 'glow-half', 'shadow'], () => settings.mode, (v: Mode) => (settings.mode = v));
group('mega', [600, 3000, 8000], () => settings.mega, (v: number) => {
  settings.mega = v;
  scene = buildScene({ snakes: 8, megaSamples: v, food: 500, seed: 1 });
});
group('DPR', [1, 1.5], () => settings.dpr, (v: number) => {
  settings.dpr = v;
  resize();
});
const runBtn = document.createElement('button');
runBtn.textContent = 'Lancer 10 s';
panel.appendChild(runBtn);
const copyBtn = document.createElement('button');
copyBtn.textContent = 'Copier';
panel.appendChild(copyBtn);

function resize() {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, settings.dpr);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const scale = Math.min(cssW / WORLD_W, cssH / WORLD_H);
  view = { scale, ox: (cssW - WORLD_W * scale) / 2, oy: (cssH - WORLD_H * scale) / 2, dpr };
  halo.width = Math.ceil(canvas.width / 2);
  halo.height = Math.ceil(canvas.height / 2);
}
// Calque halo en demi-résolution (mode glow-half), agrandi d'un seul drawImage.
const halo = document.createElement('canvas');
const hctx = halo.getContext('2d')!;
window.addEventListener('resize', resize);
resize();

const spriteCache = new Map<string, HTMLCanvasElement>();
function foodSprite(color: string, r: number): HTMLCanvasElement {
  const key = `${color}|${Math.round(r)}`;
  let s = spriteCache.get(key);
  if (!s) {
    const size = Math.ceil(r * 6);
    s = document.createElement('canvas');
    s.width = s.height = size;
    const g = s.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.33, color);
    grad.addColorStop(0.34, `${color}66`);
    grad.addColorStop(1, `${color}00`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    spriteCache.set(key, s);
  }
  return s;
}

function strokePath(c: CanvasRenderingContext2D, sn: BenchSnake, dx: number, dy: number) {
  const p = sn.points;
  c.beginPath();
  c.moveTo(p[0] + dx, p[1] + dy);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] + dx, p[i + 1] + dy);
}

function drawHalfResHalo(t: number) {
  const { scale, ox, oy, dpr } = view;
  hctx.setTransform(1, 0, 0, 1, 0, 0);
  hctx.clearRect(0, 0, halo.width, halo.height);
  hctx.setTransform((scale * dpr) / 2, 0, 0, (scale * dpr) / 2, (ox * dpr) / 2, (oy * dpr) / 2);
  hctx.lineCap = 'round';
  hctx.lineJoin = 'round';
  scene.snakes.forEach((sn, k) => {
    strokePath(hctx, sn, Math.sin(t / 400 + k) * 3, Math.cos(t / 500 + k) * 3);
    hctx.strokeStyle = sn.color;
    hctx.lineWidth = sn.width * 1.8;
    hctx.stroke();
  });
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.25;
  ctx.drawImage(halo, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function draw(t: number) {
  const { scale, ox, oy, dpr } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
  ctx.fillStyle = '#0b0e1f';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const f = scene.food;
  for (let i = 0; i < f.length; i += 3) {
    const sprite = foodSprite(FOOD_COLORS[(i / 3) % FOOD_COLORS.length], f[i + 2]);
    const half = sprite.width / 2;
    ctx.drawImage(sprite, f[i] - half, f[i + 1] - half);
  }

  if (settings.mode === 'glow-half') drawHalfResHalo(t);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  scene.snakes.forEach((sn, k) => {
    // Petit mouvement pour forcer un vrai redessin à chaque frame.
    const dx = Math.sin(t / 400 + k) * 3;
    const dy = Math.cos(t / 500 + k) * 3;
    strokePath(ctx, sn, dx, dy);
    ctx.strokeStyle = sn.color;
    if (settings.mode === 'glow') {
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = sn.width * 1.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (settings.mode === 'shadow') {
      ctx.shadowColor = sn.color;
      ctx.shadowBlur = 12;
    }
    ctx.lineWidth = sn.width;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

let bench: { start: number; last: number; frames: number[] } | null = null;

function frame(t: number) {
  draw(t);
  if (bench) {
    bench.frames.push(t - bench.last);
    bench.last = t;
    if (t - bench.start >= BENCH_MS) finishBench(t);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

runBtn.addEventListener('click', () => {
  const now = performance.now();
  bench = { start: now, last: now, frames: [] };
  out.textContent = 'Mesure en cours (10 s)…';
});

function finishBench(t: number) {
  const b = bench!;
  bench = null;
  const ft = b.frames.slice(1);
  const sorted = [...ft].sort((a, c) => a - c);
  const worst1pct = sorted.slice(Math.floor(sorted.length * 0.99));
  const low1 = worst1pct.length ? 1000 / (worst1pct.reduce((s, v) => s + v, 0) / worst1pct.length) : 0;
  const fps = (ft.length / (t - b.start)) * 1000;
  const s = summarize(ft);
  const line =
    `mode=${settings.mode} mega=${settings.mega} DPR=${view.dpr} canvas=${canvas.width}x${canvas.height} → ` +
    `FPS moy=${fps.toFixed(1)} 1%low=${low1.toFixed(1)} (frame p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)} max=${s.max.toFixed(1)} ms)`;
  results.push(line);
  out.textContent = [navigator.userAgent, ...results].join('\n');
}

copyBtn.addEventListener('click', async () => {
  const text = out.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
});
