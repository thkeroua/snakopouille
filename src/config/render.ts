// Réglages d'affichage (ajuster maxDpr / glowMode selon docs/spikes après le test K10).
export const RENDER = {
  maxDpr: 1.5,
  /** 'stroke' : double trait (halo large translucide + cœur) ; 'half' : halo en demi-résolution ; 'none'. */
  glowMode: 'stroke' as 'stroke' | 'half' | 'none',
  background: '#0b0e1f',
  band: '#000000',
  gridLine: '#1b2140',
  gridCell: 24,
  playerColors: ['#5dff8a', '#ff4a6e', '#4af0ff', '#ffd84a', '#ff4af0', '#ff9a3d', '#9a7bff', '#f5f5f5'],
  foodColors: ['#ffd84a', '#4af0ff', '#ff4af0', '#5dff8a'],
  glowWidthFactor: 1.8,
  glowAlpha: 0.25,
  crownColor: '#ffd84a',
  ownRingGap: 6,
  minLabelPx: 12,
  minCrownPx: 10,
} as const;
