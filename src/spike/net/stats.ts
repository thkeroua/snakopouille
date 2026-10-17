export type Summary = { count: number; min: number; avg: number; p50: number; p95: number; max: number };

export function summarize(samples: number[]): Summary {
  const n = samples.length;
  if (n === 0) return { count: 0, min: 0, avg: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.max(0, Math.ceil(p * n) - 1)];
  const avg = sorted.reduce((s, v) => s + v, 0) / n;
  return { count: n, min: sorted[0], avg, p50: rank(0.5), p95: rank(0.95), max: sorted[n - 1] };
}
