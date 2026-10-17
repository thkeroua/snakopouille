// Tous les réglages de gameplay (spec §6). La simulation les reçoit en paramètre :
// ne pas importer GAMEPLAY directement dans src/game/.

export interface GameplayConfig {
  readonly world: { readonly width: number; readonly height: number };
  readonly match: {
    readonly durationS: number;
    readonly feverLastS: number;
    readonly feverMultiplier: number;
    readonly respawnDelayS: number;
  };
  readonly snake: {
    readonly startPoints: number;
    readonly minPoints: number;
    readonly speed: number; // unités/s
    readonly boostMultiplier: number;
    readonly turnRateRad: number; // rad/s max
    readonly minWidth: number; // épaisseur à 10 points
    readonly widthExponent: number; // ×30 à 20 000 points
    readonly lengthBase: number; // longueur à 10 points
    readonly lengthExponent: number;
    readonly sampleSpacing: number; // distance entre échantillons du corps
    readonly headFrontHalfAngleDeg: number; // cône « avant de tête »
    readonly steerDeadZone: number; // cible trop proche de la tête : on garde le cap
  };
  readonly boost: { readonly lossCoef: number; readonly lossExponent: number; readonly dropIntervalS: number };
  readonly food: {
    readonly spawnIntervalS: number;
    readonly values: readonly { readonly value: number; readonly weight: number }[];
    readonly maxNatural: number; // nourriture « naturelle » max au sol
    readonly initialNatural: number; // posée au début de partie
    readonly deathOrbSpacing: number; // une boule de traînée tous les N unités de corps
    readonly radiusBase: number;
    readonly radiusPerSqrtValue: number; // r = base + k·√valeur
    readonly spawnMargin: number;
  };
  readonly spawn: { readonly gridCols: number; readonly gridRows: number; readonly margin: number };
  readonly maxPlayers: number;
}

export const GAMEPLAY: GameplayConfig = {
  world: { width: 1600, height: 1000 },
  match: { durationS: 180, feverLastS: 60, feverMultiplier: 5, respawnDelayS: 5 },
  snake: {
    startPoints: 10,
    minPoints: 10,
    speed: 120,
    boostMultiplier: 2,
    turnRateRad: 4.0,
    minWidth: 4,
    widthExponent: 0.45,
    lengthBase: 60,
    lengthExponent: 0.6,
    sampleSpacing: 4,
    headFrontHalfAngleDeg: 45,
    steerDeadZone: 2,
  },
  boost: { lossCoef: 0.18, lossExponent: 0.87, dropIntervalS: 0.2 },
  food: {
    spawnIntervalS: 0.25,
    values: [
      { value: 5, weight: 0.6 },
      { value: 10, weight: 0.37 },
      { value: 50, weight: 0.03 },
    ],
    maxNatural: 600,
    initialNatural: 300,
    deathOrbSpacing: 20,
    radiusBase: 2,
    radiusPerSqrtValue: 0.8,
    spawnMargin: 20,
  },
  spawn: { gridCols: 16, gridRows: 10, margin: 60 },
  maxPlayers: 8,
};

/** Copie de `base` avec des sections partiellement remplacées (tests, paramètres de debug). */
export function withConfig(
  base: GameplayConfig,
  patch: { [K in keyof GameplayConfig]?: Partial<GameplayConfig[K]> },
): GameplayConfig {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const cur = (base as unknown as Record<string, unknown>)[k];
    out[k] = typeof cur === 'object' && !Array.isArray(cur) ? { ...(cur as object), ...(v as object) } : v;
  }
  return out as unknown as GameplayConfig;
}
