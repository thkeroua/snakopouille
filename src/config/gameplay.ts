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
    readonly magnetRange: number; // « champ magnétique » : portée de la bouche au-delà du rayon de tête
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
    /** Super points : un de temps en temps, à un endroit et un moment au hasard (hors plafond naturel). */
    readonly super: {
      readonly intervalMinS: number; // délai entre deux apparitions, tiré dans [min, max]
      readonly intervalMaxS: number;
      readonly maxOnMap: number;
      readonly values: readonly { readonly value: number; readonly weight: number }[];
      readonly feverValues: readonly { readonly value: number; readonly weight: number }[]; // pas multipliées par la fièvre
    };
  };
  /** Bonus à ramasser (icônes) : effet temporaire sur le serpent qui le prend. */
  readonly bonus: {
    readonly intervalMinS: number; // délai entre deux apparitions, tiré dans [min, max]
    readonly intervalMaxS: number;
    readonly maxOnMap: number;
    readonly pickupRadius: number;
    readonly spawnMargin: number;
    readonly speed: { readonly weight: number; readonly durationS: number; readonly multiplier: number }; // cumulable avec l'accélérateur
    readonly ghost: { readonly weight: number; readonly durationS: number }; // ni mort sur un corps, ni tueur par son corps
    readonly obese: { readonly weight: number; readonly durationS: number; readonly widthFactor: number }; // plus épais, pas plus long
    readonly spikes: {
      readonly weight: number;
      readonly durationS: number;
      readonly every: number; // ~1 échantillon de corps sur N porte une paire de pics
      readonly minLenFactor: number; // longueur du pic au-delà du corps, × demi-épaisseur
      readonly maxLenFactor: number;
      readonly minLen: number; // longueur minimale (petits serpents)
      readonly baseFactor: number; // demi-largeur de la base, × demi-épaisseur
    };
  };
  readonly spawn: { readonly gridCols: number; readonly gridRows: number; readonly margin: number };
  readonly maxPlayers: number;
  readonly net: {
    readonly sendHz: number; // têtes envoyées par seconde
    readonly interpDelayMs: number; // retard d'affichage des serpents des autres
    readonly peerTimeoutS: number; // sans aucun message : pair considéré parti
    readonly beatIntervalS: number;
    readonly probeTimeoutMs: number;
    readonly connectTimeoutMs: number;
  };
}

export const GAMEPLAY: GameplayConfig = {
  world: { width: 1600, height: 1000 },
  match: { durationS: 180, feverLastS: 60, feverMultiplier: 5, respawnDelayS: 5 },
  snake: {
    startPoints: 10,
    minPoints: 10,
    speed: 120,
    boostMultiplier: 2,
    turnRateRad: 6.0,
    minWidth: 4,
    widthExponent: 0.45,
    lengthBase: 60,
    lengthExponent: 0.6,
    sampleSpacing: 4,
    headFrontHalfAngleDeg: 45,
    steerDeadZone: 2,
    magnetRange: 12,
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
    super: {
      intervalMinS: 5,
      intervalMaxS: 20,
      maxOnMap: 3,
      values: [
        { value: 100, weight: 0.7 },
        { value: 200, weight: 0.3 },
      ],
      feverValues: [
        { value: 100, weight: 0.5 },
        { value: 200, weight: 0.4 },
        { value: 500, weight: 0.1 },
      ],
    },
  },
  bonus: {
    intervalMinS: 6,
    intervalMaxS: 14,
    maxOnMap: 2,
    pickupRadius: 12,
    spawnMargin: 60,
    speed: { weight: 1, durationS: 4, multiplier: 2 },
    ghost: { weight: 1, durationS: 7 },
    obese: { weight: 1, durationS: 10, widthFactor: 3 },
    spikes: { weight: 1, durationS: 5, every: 3, minLenFactor: 0.6, maxLenFactor: 1.8, minLen: 4, baseFactor: 0.5 },
  },
  spawn: { gridCols: 16, gridRows: 10, margin: 60 },
  maxPlayers: 8,
  net: { sendHz: 20, interpDelayMs: 100, peerTimeoutS: 10, beatIntervalS: 1, probeTimeoutMs: 4000, connectTimeoutMs: 15000 },
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
