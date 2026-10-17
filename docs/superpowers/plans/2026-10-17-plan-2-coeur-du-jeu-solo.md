# Plan 2 — Cœur du jeu en solo local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une partie complète de 3 minutes jouable sur **une seule tablette** : ton serpent piloté au doigt ou à la souris, plus des serpents « mannequins » de debug pour tester les collisions. On y trouve toutes les règles de la spec §4 (taille, croissance par la queue, accélérateur, nourriture, fever, collisions avant/côté, bords glissants, mort/traînée/réapparition, score, couronne), le rendu néon, le HUD et l'écran de fin.

**Architecture:** La simulation pure vit sous `src/game/` : sans DOM, déterministe à `dt` et graine fixés, testée en Vitest. Elle est **découpée selon la frontière d'autorité du plan 3** :
- `snakeMotion.ts` : le mouvement de **son** serpent et sa mort tête contre corps. Ce sera du code client.
- `hostRules.ts` : la nourriture, les points, les têtes à tête, le chrono, le fever, les scores et la réapparition. Ce sera du code hôte.
- `match.ts` : il orchestre les deux en local.

Le rendu (`src/render/`), les entrées (`src/input/`) et l'interface DOM (`src/ui/`) consomment l'état en lecture seule. La simulation tourne en pas fixe de 1/60 s, et le rendu suit `requestAnimationFrame`.

**Tech Stack:** TypeScript 5.6.3 strict, Vite 5.4.10, Vitest 2.1.4, Canvas 2D. Pas de nouvelle dépendance.

**Spec:** `docs/superpowers/specs/2026-10-17-snakopouille-design.md` (§4, §5, §6, §7). **Prérequis :** plan 1 exécuté. Avant de commencer, lire `docs/spikes/2026-10-17-resultats-spike.md` et `decisions.md` : ils peuvent imposer `render.maxDpr` et un plafond d'échantillons de corps. Si c'est le cas, reporter ces valeurs dans `src/config/render.ts` (Task 10).

## Global Constraints

- Tous les nombres de gameplay sont dans `src/config/gameplay.ts` (spec §6). La simulation les reçoit en paramètre (`cfg: GameplayConfig`) : **pas d'import direct de `GAMEPLAY` dans `src/game/`**, ce qui permet aux tests d'injecter leurs valeurs.
- Monde : 1600 × 1000 unités, origine en haut à gauche, angle 0 = vers +x, sens horaire positif (y vers le bas).
- Pas de simulation fixe : `SIM_DT = 1/60`. Au plus 5 pas par frame, au-delà on abandonne le retard.
- Hasard : uniquement via `Rng` (Task 1). Jamais `Math.random()` dans `src/game/`.
- Aucun `shadowBlur` dans la boucle de rendu. Le halo se fait par double trait ou par sprite pré-rendu.
- Collisions et nourriture passent par `SpatialGrid` (Task 4), jamais de double boucle sur tous les échantillons.
- Les textes de l'UI sont en français.
- `src/spike/` n'est ni importé ni modifié.

## Valeurs de départ (copiées dans `gameplay.ts`, Task 1)

```ts
export const GAMEPLAY = {
  world: { width: 1600, height: 1000 },
  match: { durationS: 180, feverLastS: 60, feverMultiplier: 5, respawnDelayS: 5 },
  snake: {
    startPoints: 10, minPoints: 10,
    speed: 120,                 // unités/s
    boostMultiplier: 2,
    turnRateRad: 4.0,           // rad/s max
    minWidth: 4,                // épaisseur à 10 points
    widthExponent: 0.45,        // ×30 à 20 000 points
    lengthBase: 60,             // longueur à 10 points
    lengthExponent: 0.6,
    sampleSpacing: 4,           // distance entre échantillons du corps
    headFrontHalfAngleDeg: 45,  // cône « avant de tête » ±45°
    steerDeadZone: 2,           // cible à moins de 2 unités de la tête : on garde le cap
  },
  boost: { lossCoef: 0.18, lossExponent: 0.87, dropIntervalS: 0.2 },
  food: {
    spawnIntervalS: 0.25,
    values: [ { value: 5, weight: 0.6 }, { value: 10, weight: 0.37 }, { value: 50, weight: 0.03 } ],
    maxNatural: 600,            // nourriture « naturelle » max au sol
    initialNatural: 300,        // posée au début de partie
    deathOrbSpacing: 20,        // une boule de traînée tous les 20 unités de corps
    radiusBase: 2, radiusPerSqrtValue: 0.8,  // r = 2 + 0.8·√valeur
    spawnMargin: 20,
  },
  spawn: { gridCols: 16, gridRows: 10, margin: 60 },
  maxPlayers: 8,
} as const;
export type GameplayConfig = typeof GAMEPLAY;
```

## Review Focus

1. **Serpent très gros (≥ 20 000 points, corps de plusieurs milliers d'échantillons) avec l'accélérateur et des collisions** : la frame doit rester fluide et la perte de points ne doit jamais passer sous 10. Test : `boost.test.ts::never below minPoints` + `perf.test.ts::tick with 20k snake under budget` (Task 8).
2. **Doigt posé exactement sur la tête, ou cible derrière le serpent** : pas de tremblement, pas de demi-tour instantané. Test : `snakeMotion.test.ts::dead zone keeps heading` et `::turn is rate-limited`.
3. **Serpent coincé dans un coin, la cible hors map** : il glisse sans sortir et sans trembler. Test : `snakeMotion.test.ts::corner clamp`.
4. **Deux serpents qui meurent dans le même tick l'un sur l'autre** (face-à-face, ou A meurt sur B pendant que B meurt sur A) : aucun double comptage, et les deux traînées sont posées. Test : `match.test.ts::simultaneous deaths`.
5. **Fin de partie pendant une réapparition ou pendant un accélérateur** : l'état se fige proprement, et le résumé compte les bons morts et le bon max. Test : `match.test.ts::end freezes state`.

---

## Fichiers

```
src/config/gameplay.ts      # GAMEPLAY + type GameplayConfig
src/config/render.ts        # RENDER (DPR max, couleurs, palette joueurs)
src/game/types.ts           # types partagés de l'état
src/game/math.ts            # vecteurs, angles
src/game/rng.ts             # Rng déterministe
src/game/sizing.ts          # épaisseur, longueur cible, coût du boost, rayon de nourriture
src/game/path.ts            # SnakePath : échantillons du corps
src/game/snakeMotion.ts     # pilotage, déplacement, bords, croissance/rétrécissement
src/game/spatialGrid.ts     # grille spatiale générique
src/game/food.ts            # FoodStore : apparition, consommation, traînées
src/game/boost.ts           # perte de points et dépôts derrière la queue
src/game/collision.ts       # tête/corps, tête/tête (avant/côté)
src/game/spawn.ts           # point de réapparition le plus éloigné
src/game/hostRules.ts       # autorité « hôte »
src/game/match.ts           # orchestration locale
src/debug/dummies.ts        # serpents mannequins (debug, PAS les bots)
src/view/viewport.ts        # monde ↔ écran, 16:10, bandes
src/input/controls.ts       # doigt/souris/clavier → SnakeInput
src/render/sprites.ts       # sprites pré-rendus (halo nourriture, fond)
src/render/renderer.ts      # dessin d'une frame
src/ui/hud.ts               # chrono, classements, fever, compte à rebours
src/ui/screens.ts           # écran de fin, message portrait
src/main.ts                 # boucle de jeu
index.html                  # page du jeu (remplace le menu des spikes)
tests/game/*.test.ts
```

---

### Task 1: Config, types, maths, hasard, formules de taille

**Files:**
- Create: `src/config/gameplay.ts`, `src/game/types.ts`, `src/game/math.ts`, `src/game/rng.ts`, `src/game/sizing.ts`
- Test: `tests/game/sizing.test.ts`, `tests/game/math.test.ts`, `tests/game/rng.test.ts`

**Interfaces:**
- Produces:
  - `GAMEPLAY`, `GameplayConfig` (valeurs ci-dessus, exactes).
  - `types.ts` :
```ts
export type SnakeId = string;
export type Vec = { x: number; y: number };
export type SnakeInput = { target: Vec | null; boost: boolean };
export type Player = { id: SnakeId; name: string; color: string };
export type DeathCause = 'body' | 'head-on' | 'head-side';
export type MatchEvent =
  | { type: 'death'; victim: SnakeId; killer: SnakeId | null; cause: DeathCause }
  | { type: 'eat'; snake: SnakeId; foodId: number; value: number }
  | { type: 'respawn'; snake: SnakeId }
  | { type: 'fever-start' }
  | { type: 'end' };
```
  - `math.ts` : `normalizeAngle(a: number): number` (dans ]-π, π]), `angleDiff(from: number, to: number): number` (signé, ]-π, π]), `rotateToward(current: number, target: number, maxStep: number): number`, `dist2(a: Vec, b: Vec): number`, `clamp(v: number, min: number, max: number): number`.
  - `rng.ts` : `class Rng { constructor(seed: number); next(): number /* [0,1) */; range(min: number, max: number): number; int(maxExclusive: number): number; pickWeighted<T extends { weight: number }>(items: readonly T[]): T }` (mulberry32).
  - `sizing.ts` (tous prennent `cfg: GameplayConfig`) :
    - `widthFor(points, cfg)` = `minWidth × (max(points, minPoints)/10)^widthExponent`
    - `targetLengthFor(points, cfg)` = `lengthBase × (max(points, minPoints)/10)^lengthExponent`
    - `boostLossPerSecond(points, cfg)` = `lossCoef × points^lossExponent`
    - `foodRadius(value, cfg)` = `radiusBase + radiusPerSqrtValue × √value`

- [ ] **Step 1: Tests**
```ts
test('width x30 at 20000 points (±3%)', () => {
  const r = widthFor(20000, GAMEPLAY) / widthFor(10, GAMEPLAY);
  expect(r).toBeGreaterThan(29.1); expect(r).toBeLessThan(30.9);
});
test('width floor at minPoints', () => expect(widthFor(3, GAMEPLAY)).toBe(GAMEPLAY.snake.minWidth));
test('length grows without cap', () => expect(targetLengthFor(100000, GAMEPLAY)).toBeGreaterThan(targetLengthFor(20000, GAMEPLAY)));
test('boost calibration from spec', () => {
  expect(boostLossPerSecond(20000, GAMEPLAY)).toBeGreaterThan(900);
  expect(boostLossPerSecond(20000, GAMEPLAY)).toBeLessThan(1100);
  expect(boostLossPerSecond(100, GAMEPLAY)).toBeGreaterThan(9);
  expect(boostLossPerSecond(100, GAMEPLAY)).toBeLessThan(11);
});
test('angleDiff wraps', () => expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2));
test('rotateToward clamps step', () => expect(rotateToward(0, 1, 0.25)).toBeCloseTo(0.25));
test('rotateToward reaches target', () => expect(rotateToward(0, 0.1, 0.25)).toBeCloseTo(0.1));
test('rng deterministic', () => {
  const a = new Rng(42), b = new Rng(42);
  expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
});
test('pickWeighted respects weights roughly', () => {
  const r = new Rng(1); let c = 0;
  for (let i = 0; i < 10000; i++) if (r.pickWeighted(GAMEPLAY.food.values).value === 50) c++;
  expect(c).toBeGreaterThan(200); expect(c).toBeLessThan(400);
});
```
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implémenter. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(game): gameplay config, math, rng, sizing`.

### Task 2: SnakePath — échantillons du corps

**Files:**
- Create: `src/game/path.ts` · Test: `tests/game/path.test.ts`

**Interfaces:**
- Produces :
```ts
export class SnakePath {
  constructor(spacing: number, head: Vec);
  /** Déplace la tête ; ajoute des échantillons tous les `spacing` le long du trajet. */
  moveHead(p: Vec): void;
  /** Supprime des échantillons côté queue tant que length() > maxLength. Ne rallonge jamais. */
  trimTo(maxLength: number): void;
  length(): number;                 // longueur réelle tête → queue
  count(): number;                  // nb d'échantillons, tête incluse
  /** i = 0 : tête ; i = count()-1 : queue. */
  x(i: number): number; y(i: number): number;
  tail(): Vec;
  reset(head: Vec): void;
}
```
Stockage : deque circulaire sur `Float32Array` dont la capacité double quand elle est pleine. L'index 0 est toujours la tête courante : la tête est mise à jour en place, et un nouvel échantillon est inséré derrière elle dès que la distance à l'échantillon précédent atteint `spacing`. `trimTo` coupe proprement : le dernier échantillon est raccourci par interpolation pour que `length()` vaille exactement `maxLength`.

**C'est ce mécanisme qui produit la croissance par la queue (spec §4)** : si on appelle `trimTo(cible)` avec une cible qui grandit, la queue reste immobile pendant que la tête avance.

- [ ] **Step 1: Tests**
```ts
test('tail stays while growing', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 40; x++) { p.moveHead({ x, y: 0 }); p.trimTo(1000); }
  expect(p.tail()).toEqual({ x: 0, y: 0 });
  expect(p.length()).toBeCloseTo(40);
});
test('trim keeps exact length and moves tail', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 40; x++) { p.moveHead({ x, y: 0 }); p.trimTo(20); }
  expect(p.length()).toBeCloseTo(20); expect(p.tail().x).toBeCloseTo(20);
});
test('samples spaced', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 100; x++) p.moveHead({ x, y: 0 });
  expect(p.count()).toBeGreaterThanOrEqual(25); expect(p.count()).toBeLessThanOrEqual(27);
});
test('grows past initial capacity', () => {
  const p = new SnakePath(4, { x: 0, y: 0 });
  for (let x = 1; x <= 40000; x++) p.moveHead({ x: x % 1600, y: Math.floor(x / 1600) * 10 });
  expect(p.count()).toBeGreaterThan(9000);
});
```
- [ ] **Step 2–4:** FAIL → implémenter → PASS. **Step 5:** Commit `feat(game): snake path with tail-anchored growth`.

### Task 3: Mouvement du serpent (snakeMotion)

**Files:**
- Create: `src/game/snakeMotion.ts` · Test: `tests/game/snakeMotion.test.ts`

**Interfaces:**
- Consumes : `SnakePath`, `sizing`, `math`, `types`.
- Produces :
```ts
export type SnakeState = {
  id: SnakeId; color: string; name: string;
  alive: boolean; respawnAt: number;     // temps de match (s)
  points: number;                        // ÉCRIT UNIQUEMENT PAR hostRules
  angle: number; boosting: boolean;
  path: SnakePath;
};
export function createSnake(p: Player, head: Vec, angle: number, cfg: GameplayConfig): SnakeState;
/** Pilotage + déplacement + bords + trimTo(targetLengthFor(points)). N'écrit jamais `points`. */
export function stepMotion(s: SnakeState, input: SnakeInput, dt: number, cfg: GameplayConfig): void;
export function headRadius(s: SnakeState, cfg: GameplayConfig): number; // = widthFor(points)/2
```
Règles :
- **Pilotage** : si `target` est non nul et à plus de `steerDeadZone` de la tête, l'angle visé est `atan2` de la cible, et `angle = rotateToward(angle, visé, turnRateRad × dt)`. Si `target` est nul, ou dans la zone morte, l'angle ne change pas.
- **Accélérateur** : `boosting = input.boost && points > minPoints`. La vitesse vaut `speed × (boosting ? boostMultiplier : 1)`.
- **Bords** : on calcule la nouvelle tête, puis on la contraint à `[r, W−r] × [r, H−r]` (`r = headRadius`). L'angle reste celui du pilotage. Résultat : le serpent glisse le long du mur, et il reste immobile dans un coin si la cible est dehors.
- Ne rien faire si `!alive`.

- [ ] **Step 1: Tests** (cfg = `GAMEPLAY`, `dt = 1/60`, sauf mention contraire)
```ts
test('goes straight without input', () => { /* angle 0, 60 pas, target null → angle 0, head.x augmente de 120 ±1 */ });
test('turn is rate-limited', () => { /* cible derrière (angle visé π), 1 pas → |angle| ≈ 4/60 */ });
test('dead zone keeps heading', () => { /* target = tête + (1,1) → angle inchangé */ });
test('boost doubles speed', () => { /* points 100, boost, 60 pas → Δx ≈ 240 */ });
test('no boost speed at minPoints', () => { /* points 10, boost → Δx ≈ 120, boosting false */ });
test('slides along wall', () => { /* tête près de y=0, angle -π/4 (haut-droite), 60 pas → y == r, x a augmenté ≈ 120·cos(π/4) */ });
test('corner clamp', () => { /* coin (r,r), cible (-100,-100), 60 pas → tête reste (r,r) à 1e-6, aucun NaN */ });
test('growth anchors tail', () => { /* points 1000, 120 pas → path.tail() inchangé tant que length < targetLengthFor(1000) */ });
```
(L'implémenteur écrit le corps de chaque test selon le commentaire, avec ces valeurs exactes.)
- [ ] **Step 2–4:** FAIL → implémenter → PASS. **Step 5:** Commit `feat(game): snake steering, speed, wall sliding`.

### Task 4: Grille spatiale + nourriture

**Files:**
- Create: `src/game/spatialGrid.ts`, `src/game/food.ts` · Test: `tests/game/spatialGrid.test.ts`, `tests/game/food.test.ts`

**Interfaces:**
- Produces :
```ts
export class SpatialGrid<T> {
  constructor(width: number, height: number, cellSize: number);
  clear(): void;
  insert(x: number, y: number, item: T): void;
  /** Appelle fn pour chaque item des cellules couvrant le carré [x±r, y±r]. Le test précis de distance est à la charge de l'appelant. */
  query(x: number, y: number, r: number, fn: (item: T) => void): void;
}
export type Food = { id: number; x: number; y: number; value: number; r: number; color: string; natural: boolean };
export class FoodStore {
  constructor(cfg: GameplayConfig, rng: Rng, palette: readonly string[]);
  readonly items: ReadonlyMap<number, Food>;
  naturalCount(): number;
  add(x: number, y: number, value: number, natural: boolean): Food;  // r = foodRadius(value)
  remove(id: number): void;
  spawnNatural(multiplier: number): Food | null;   // null si naturalCount() >= maxNatural ; valeur = pickWeighted × multiplier ; position aléatoire dans la marge
  /** Ids de nourriture touchée par un cercle (tête). */
  touching(x: number, y: number, r: number): number[];
  /** Traînée de mort : une boule tous les deathOrbSpacing le long du corps, valeur totale = points, reste sur la dernière. */
  dropTrail(path: SnakePath, points: number): Food[];
}
```
Les deux structures utilisent une grille de cellule 64. `FoodStore` tient la sienne à jour à chaque `add` et `remove`.

- [ ] **Step 1: Tests**
```ts
test('grid query finds near, skips far cells', () => { /* insert (10,10) et (900,900); query(12,12,5) → seulement le premier */ });
test('spawnNatural respects cap', () => { /* cfg avec maxNatural 3 → 4e appel renvoie null */ });
test('fever multiplies spawned values', () => { /* multiplier 5 → valeur ∈ {25,50,250} */ });
test('touching uses circle overlap', () => { /* food r=4 à (100,100); touching(108,100,3.9) → []; touching(107,100,3.1) → [id] */ });
test('dropTrail conserves total value', () => {
  /* path rectiligne de longueur 400, points 1234 → 20 boules (400/20), somme des valeurs == 1234, natural=false, positions sur le corps */
});
test('dropTrail on tiny body gives one orb', () => { /* longueur 5, points 10 → 1 boule de 10 */ });
```
- [ ] **Step 2–4:** FAIL → implémenter → PASS. **Step 5:** Commit `feat(game): spatial grid and food store`.

### Task 5: Accélérateur — perte et dépôts

**Files:**
- Create: `src/game/boost.ts` · Test: `tests/game/boost.test.ts`

**Interfaces:**
- Produces :
```ts
export type BoostAccumulator = { pending: number; sinceDrop: number };
export function newBoostAcc(): BoostAccumulator;
/** Calcule la perte du pas (sans descendre sous minPoints), l'ajoute à `pending`, et tous les dropIntervalS
 *  renvoie une valeur entière à déposer (floor(pending)) ; le reste fractionnaire est conservé. */
export function stepBoost(points: number, boosting: boolean, acc: BoostAccumulator, dt: number, cfg: GameplayConfig):
  { newPoints: number; drop: number /* 0 si rien à déposer */ };
```
`hostRules` dépose `drop` en une boule `natural: false` à `path.tail()`.

- [ ] **Step 1: Tests**
```ts
test('20k for 5s loses ~4000-5000', () => { /* boucle 300 pas → perte totale entre 3800 et 5000 (décroissance) */ });
test('100 for 5s loses ~35-50', () => { /* idem → entre 35 et 50 */ });
test('never below minPoints', () => { /* points 11, 600 pas → newPoints ≥ 10 exactement 10 à la fin */ });
test('drops sum equals points lost', () => { /* somme des drop + pending final == perte totale à 1e-6 */ });
test('no loss when not boosting', () => { /* boosting false → newPoints inchangé, drop 0 */ });
```
- [ ] **Step 2–4:** FAIL → implémenter → PASS. **Step 5:** Commit `feat(game): boost cost and tail drops`.

### Task 6: Collisions

**Files:**
- Create: `src/game/collision.ts` · Test: `tests/game/collision.test.ts`

**Interfaces:**
- Produces :
```ts
export type BodyRef = { snake: SnakeId; i: number; halfWidth: number };
/** Remplit la grille avec tous les échantillons des serpents vivants, SAUF leur zone de tête
 *  (les échantillons d'indice i dont la distance à la tête le long du corps < halfWidth). */
export function buildBodyGrid(snakes: readonly SnakeState[], grid: SpatialGrid<BodyRef>, cfg: GameplayConfig): void;
/** Tête de `s` contre corps des AUTRES serpents ; renvoie l'id du propriétaire touché ou null.
 *  Contact si distance(tête, échantillon) < headRadius(s) + halfWidth. Les échantillons de `s` sont ignorés. */
export function headHitsBody(s: SnakeState, grid: SpatialGrid<BodyRef>, maxHalfWidth: number, cfg: GameplayConfig): SnakeId | null;
export type HeadClash = { a: SnakeId; b: SnakeId; aFront: boolean; bFront: boolean };
/** Pour chaque paire de têtes dont les cercles se touchent : aFront = l'angle entre le cap de a et (tête b − tête a) ≤ headFrontHalfAngleDeg. */
export function headClashes(snakes: readonly SnakeState[], cfg: GameplayConfig): HeadClash[];
/** Règles de la spec : les deux avant → les deux meurent, pas de tueur ; seul a avant → a meurt, tueur b ; seul b avant → b meurt, tueur a ; aucun avant → rien. */
export function resolveClash(c: HeadClash): { victim: SnakeId; killer: SnakeId | null; cause: DeathCause }[];
```
`headClashes` compare les têtes deux à deux, ce qui est permis : il y a au plus 8 têtes.

- [ ] **Step 1: Tests**
```ts
test('self body never kills', () => { /* serpent enroulé sur lui-même → headHitsBody == null */ });
test('head into other body kills', () => { /* tête de A posée sur le milieu du corps de B → 'B' */ });
test('touching other head zone is not body hit', () => { /* tête de A au contact de la tête de B uniquement → headHitsBody null, headClashes 1 paire */ });
test('front vs front', () => { /* A en (100,100) cap 0, B en (100+rA+rB-1,100) cap π → aFront & bFront ; resolve → 2 morts, killer null, cause 'head-on' */ });
test('front vs side', () => { /* A cap 0 vers B, B cap π/2 (perpendiculaire) → aFront true, bFront false ; resolve → victim A, killer B, cause 'head-side' */ });
test('side by side brush', () => { /* A et B côte à côte même cap 0, têtes qui se frôlent en y → aucun avant ; resolve → [] */ });
test('front cone boundary 45°', () => { /* direction de contact à 44° → front ; à 46° → side */ });
```
- [ ] **Step 2–4:** FAIL → implémenter → PASS. **Step 5:** Commit `feat(game): body and head-to-head collisions`.

### Task 7: Point de réapparition

**Files:**
- Create: `src/game/spawn.ts` · Test: `tests/game/spawn.test.ts`

**Interfaces:**
- Produces : `findSpawnPoint(snakes: readonly SnakeState[], cfg: GameplayConfig, rng: Rng): { pos: Vec; angle: number }`
  - Les candidats sont les centres d'une grille `gridCols × gridRows` placée à l'intérieur de `margin`.
  - Pour chaque candidat, on calcule la distance minimale au corps des serpents **vivants**, en prenant un échantillon sur 4 plus la tête.
  - On choisit le candidat qui **maximise cette distance minimale**. En cas d'égalité, on tire au sort parmi les ex aequo avec `rng`.
  - S'il n'y a aucun serpent vivant, on prend un candidat au hasard.
  - `angle` pointe vers le centre de la map.

- [ ] **Step 1: Tests**
```ts
test('spawns far from the only snake', () => { /* serpent recroquevillé dans le coin haut-gauche → pos.x > 1200 && pos.y > 700 */ });
test('angle faces center', () => { /* vérifier que cos(angle - atan2(500-pos.y, 800-pos.x)) > 0.999 */ });
test('inside margin', () => { /* pos dans [60,1540]×[60,940] */ });
test('ignores dead snakes', () => { /* seul serpent mort au centre → n'influence pas : comportement identique à aucun serpent (pos ∈ candidats) */ });
```
- [ ] **Step 2–4:** FAIL → implémenter → PASS. **Step 5:** Commit `feat(game): farthest respawn point`.

### Task 8: Règles hôte + orchestration du match

**Files:**
- Create: `src/game/hostRules.ts`, `src/game/match.ts` · Test: `tests/game/match.test.ts`, `tests/game/perf.test.ts`

**Interfaces:**
- Consumes : tout ce qui précède.
- Produces :
```ts
// hostRules.ts — tout ce que l'hôte possède au plan 3
export type PlayerStats = { score: number; deaths: number; maxPoints: number };
export type HostState = {
  time: number; ended: boolean; fever: boolean;
  food: FoodStore; stats: Map<SnakeId, PlayerStats>;
  boostAcc: Map<SnakeId, BoostAccumulator>; spawnTimer: number;
};
export function createHost(players: readonly Player[], cfg: GameplayConfig, rng: Rng, palette: readonly string[]): HostState;
export function leaderId(snakes: readonly SnakeState[]): SnakeId | null; // plus de points parmi les vivants ; égalité → aucun

// match.ts
export class Match {
  constructor(players: readonly Player[], cfg: GameplayConfig, seed: number, palette: readonly string[]);
  readonly snakes: SnakeState[]; readonly host: HostState; readonly cfg: GameplayConfig;
  /** Un pas de simulation de dt (= SIM_DT). Renvoie les événements du pas. */
  tick(dt: number, inputs: ReadonlyMap<SnakeId, SnakeInput>): MatchEvent[];
  ranking(): { id: SnakeId; name: string; color: string; score: number; points: number; deaths: number; maxPoints: number }[];
}
export const SIM_DT = 1 / 60;
```
Ordre d'un `tick` (le respecter, les tests en dépendent) :
1. Si la partie est terminée (`ended`), renvoyer `[]`. Sinon, avancer `time += dt`. Si `time ≥ durationS − feverLastS` et que le fever n'est pas encore actif, l'activer et émettre `fever-start`.
2. Réapparitions : chaque serpent mort dont `respawnAt ≤ time` repart avec `findSpawnPoint`, `points = startPoints`, `path.reset`, et émet `respawn`.
3. Pour chaque serpent vivant : appliquer `stepBoost`. Le dépôt éventuel tombe à la queue. Puis `stepMotion`.
4. Reconstruire la grille des corps. Calculer les morts **en regroupant d'abord tous les cas** :
   - tête contre corps : la victime est `s`, le tueur est le propriétaire du corps, la cause est `body` ;
   - tête contre tête : via `headClashes` puis `resolveClash`.
   Dédoublonner par victime, en gardant le premier cas trouvé (ordre : d'abord les collisions tête contre corps, puis les têtes à tête). Appliquer ensuite toutes les morts : traînée (`dropTrail`), `alive = false`, `respawnAt = time + respawnDelayS`, `deaths++`, `score++` pour le tueur s'il y en a un **et s'il n'est pas mort dans ce même pas par face-à-face avec cette même victime**. Émettre les événements `death`.
5. Nourriture : pour chaque serpent vivant, `touching` avec `headRadius`. On retire la nourriture, `points += value`, et on émet `eat`. Si deux têtes touchent la même boule, c'est le premier serpent dans l'ordre de `snakes` qui l'emporte.
6. Apparitions : `spawnTimer += dt`. Tant que `spawnTimer ≥ spawnIntervalS`, appeler `spawnNatural(fever ? feverMultiplier : 1)`.
7. Mettre à jour `maxPoints`. Si `time ≥ durationS`, passer `ended = true` et émettre `end`.

Le constructeur place chaque serpent l'un après l'autre avec `findSpawnPoint` et pose `initialNatural` nourritures. `ranking()` trie par score décroissant, puis par points décroissants (spec §3).

- [ ] **Step 1: Tests**
```ts
test('fever starts at 120s and multiplies natural spawns', () => { /* durée 180 ; avancer jusqu'à 120s → 1 seul 'fever-start' ; les naturels apparus ensuite ont valeur ∈ {25,50,250} */ });
test('match ends at 180s and freezes', () => { /* 'end' émis une fois ; tick suivant → [] et positions inchangées */ });
test('end freezes state', () => { /* fin pendant qu'un serpent est mort → stats.deaths inchangé après fin ; maxPoints = max observé */ });
test('body kill credits owner and drops trail', () => { /* scénario forcé : A de 500 pts foncé dans le corps de B → event death {victim A, killer B, cause body}; B.score 1; somme des valeurs des boules non naturelles ajoutées == 500 */ });
test('respawn after 5s at 10 points', () => { /* après mort, 'respawn' émis entre 5.0 et 5.0+dt ; points 10 */ });
test('simultaneous deaths', () => { /* face-à-face forcé → 2 morts, aucun score ; A meurt sur corps de B et B meurt sur corps de A au même pas → chacun +1, 2 morts, pas de doublon */ });
test('eating adds value, first snake wins tie', () => { /* nourriture de 10 sous deux têtes → seul snakes[0] +10, 1 event eat */ });
test('crown leader', () => { /* points 50/80/80 → leaderId null ; 50/80/90 → id du 90 */ });
test('ranking order', () => { /* score desc puis points desc */ });
// perf.test.ts
test('tick with 20k snake under budget', () => {
  /* 8 serpents dont un à 20000 pts (corps déjà à sa longueur cible), 600 nourritures ;
     mesurer 120 ticks avec boost actif sur le gros → moyenne < 2 ms par tick sur la machine de dev
     (seuil indicatif : sur K10 compter ~5× plus lent) */
});
```
Pour forcer un scénario, les tests peuvent écrire directement `snake.points`, `snake.angle` et `snake.path.reset(...)` avant d'appeler `tick`.
- [ ] **Step 2–4:** FAIL → implémenter → PASS.
- [ ] **Step 5:** Commit `feat(game): host rules and local match orchestration`.

### Task 9: Viewport et contrôles

**Files:**
- Create: `src/view/viewport.ts`, `src/input/controls.ts` · Test: `tests/game/viewport.test.ts`

**Interfaces:**
- Produces :
```ts
export type Viewport = { scale: number; offsetX: number; offsetY: number; cssWidth: number; cssHeight: number };
/** Ajuste le monde 16:10 dans l'écran avec des bandes (centré). */
export function fitViewport(cssW: number, cssH: number, worldW: number, worldH: number): Viewport;
export function screenToWorld(v: Viewport, sx: number, sy: number): Vec;
export function isPortrait(cssW: number, cssH: number): boolean;   // cssH > cssW

export class Controls {
  constructor(canvas: HTMLCanvasElement, boostButton: HTMLElement, getViewport: () => Viewport);
  read(): SnakeInput;   // état courant
  dispose(): void;
}
```
Comportement de `Controls` :
- Pointer Events sur le canvas, avec `touch-action: none` et le menu contextuel désactivé.
- Le premier pointeur posé sur le canvas devient le **pointeur de pilotage**, jusqu'à ce qu'il se lève (`pointerup` ou `pointercancel`) : la cible devient alors `null`.
- Pendant ce temps, chaque `pointermove` met la cible à jour (via `screenToWorld`), sans la contraindre au monde.
- Souris : la cible n'existe que bouton gauche enfoncé (`buttons & 1`). Le clic droit maintenu active l'accélérateur.
- Accélérateur : appui sur `boostButton` (ses pointeurs ne pilotent jamais), ou touche **Espace** maintenue.
- Multi-touch : un doigt pilote pendant que l'autre accélère.

- [ ] **Step 1: Tests**
```ts
test('fit wider screen → side bands', () => { /* 2000×1000 css → scale 1, offsetX 200, offsetY 0 */ });
test('fit taller → top/bottom bands', () => { /* 1600×1200 → scale 1, offsetY 100 */ });
test('screenToWorld inverse', () => { /* fit 2000×1000 ; (1000,500) → (800,500) */ });
test('isPortrait', () => { expect(isPortrait(800, 1280)).toBe(true); expect(isPortrait(1280, 800)).toBe(false); });
```
- [ ] **Step 2–4:** FAIL → implémenter → PASS. (`Controls` est validé à la main, Task 11.)
- [ ] **Step 5:** Commit `feat: viewport and touch/mouse/keyboard controls`.

### Task 10: Rendu néon

**Files:**
- Create: `src/config/render.ts`, `src/render/sprites.ts`, `src/render/renderer.ts`

**Interfaces:**
- Produces :
```ts
// render.ts
export const RENDER = {
  maxDpr: 1.5,                                  // ajuster selon docs/spikes
  background: '#0b0e1f', gridLine: '#1b2140', gridCell: 24,
  playerColors: ['#5dff8a', '#ff4a6e', '#4af0ff', '#ffd84a', '#ff4af0', '#ff9a3d', '#9a7bff', '#f5f5f5'],
  foodColors: ['#ffd84a', '#4af0ff', '#ff4af0', '#5dff8a'],
  glowWidthFactor: 1.8, glowAlpha: 0.25,
  crownColor: '#ffd84a',
} as const;
// renderer.ts
export class Renderer {
  constructor(canvas: HTMLCanvasElement);
  resize(cssW: number, cssH: number): Viewport;          // applique DPR ≤ maxDpr, refait le fond en cache
  draw(match: Match, ownId: SnakeId): void;
}
```
Règles de dessin (spec §5, style néon, maquette A) :
- **Fond** : canvas hors écran pré-rendu à chaque `resize`, avec le fond uni, le motif losange `gridLine` dans la zone du monde et le noir dans les bandes. Chaque frame commence par un seul `drawImage` de ce cache.
- **Nourriture** : `drawImage` d'un sprite de halo pré-rendu, mis en cache par (couleur, rayon arrondi à l'entier). Le sprite fait 3× le rayon, avec un dégradé radial du cœur plein vers la transparence. La couleur d'une boule est stable (choisie à sa création, champ `color` de `Food`).
- **Serpents** : on dessine les serpents vivants, du plus gros au plus petit, et **le sien en dernier**. Pour chacun, on trace un chemin `moveTo`/`lineTo` sur tous les échantillons, avec `lineCap` et `lineJoin` à `round`. On le dessine deux fois : un stroke halo (`width × glowWidthFactor`, alpha `glowAlpha`), puis un stroke cœur (`width`). La tête est un disque plein de rayon `width/2 × 1.1`, avec deux yeux blancs orientés selon `angle`.
- **Son serpent** : un anneau pointillé blanc-couleur autour de la tête (rayon `headRadius + 6`), plus l'étiquette « Toi » à côté de la tête, dans une police au moins égale à 12 px écran.
- **Couronne** : sur la tête de `leaderId`, trois pointes dorées au-dessus de la tête (côté opposé au cap), à l'échelle de la tête mais avec une taille minimale de 10 px écran.
- Le reste se dessine en coordonnées monde via `ctx.setTransform(scale·dpr, 0, 0, scale·dpr, offsetX·dpr, offsetY·dpr)`.

- [ ] **Step 1:** Implémenter. Vérifier qu'aucun `shadowBlur` n'apparaît dans `src/render/` (`grep -r shadowBlur src/render` → aucun résultat).
- [ ] **Step 2:** `npm run build` PASS. Commit `feat(render): neon renderer`.

### Task 11: HUD, écrans, boucle, mannequins, validation sur K10

**Files:**
- Create: `src/ui/hud.ts`, `src/ui/screens.ts`, `src/debug/dummies.ts`, `src/main.ts` · Modify: `index.html` (devient la page du jeu ; les spikes restent accessibles via `spike-network.html` / `spike-render.html`)

**Interfaces:**
- Consumes : `Match`, `Renderer`, `Controls`, `fitViewport`, `isPortrait`, `leaderId`.
- Produces :
  - `class Hud { constructor(root: HTMLElement); update(match: Match, ownId: SnakeId): void }` — mise à jour du DOM **au plus 5 fois par seconde**. Contenu :
    - le chrono `m:ss` en haut au centre (en fever, il passe en magenta `#ff4af0` avec le badge « FEVER ×5 ») ;
    - à gauche, le panneau « POINTS » : top 5 par points, plus sa propre ligne si on n'y figure pas, et la couronne 👑 devant le leader ;
    - à droite, le panneau « SCORE » : top 5 par score ;
    - sa propre ligne en gras dans sa couleur ;
    - si on est mort, au centre : « Réapparition dans N s ».
  - `showEndScreen(root: HTMLElement, ranking: ReturnType<Match['ranking']>, onReplay: () => void): void`. C'est un tableau avec les colonnes : rang, pseudo (dans sa couleur), score, points, morts, taille max. Il propose un bouton **Rejouer**.
  - `bindPortraitOverlay(root: HTMLElement): void` : affiche « Tourne ta tablette ↻ » en portrait.
  - `dummyInput(s: SnakeState, time: number, rng: Rng): SnakeInput` : la cible change toutes les 2 s, elle est tirée au hasard dans la map, et l'accélérateur est actif 10 % du temps. **C'est un outil de debug pour tester les collisions, pas la fonctionnalité « bots » du `decisions.md`.**
- `main.ts` :
  - **Paramètres d'URL** : `?dummies=N` (défaut 3, maximum `maxPlayers − 1`), `?seed=` (défaut `Date.now()`), `?name=` (défaut « Toi »), `?duration=` (secondes, pour tester, défaut `GAMEPLAY.match.durationS`), `?fps=1` (affiche FPS et ms de simulation en bas à gauche).
  - **Boucle** : on cumule le temps de frame réel, on exécute `match.tick(SIM_DT, inputs)` autant de fois que nécessaire (5 au maximum), puis `renderer.draw` et `hud.update`.
  - **Fin de partie** : à l'événement `end`, on affiche l'écran de fin. **Rejouer** recrée un `Match` avec une nouvelle graine.
  - **Écran** : `resize` réagit à `resize` et `orientationchange`. Le jeu demande le plein écran au premier toucher (`requestFullscreen`, en ignorant l'erreur s'il est refusé).
- [ ] **Step 1:** Implémenter.
- [ ] **Step 2:** `npm test && npm run build` PASS. Sur desktop, `npm run dev` puis ouvrir `/?dummies=3&fps=1&duration=70`. Vérifier :
  - le pilotage souris : bouton enfoncé, la tête suit la souris, et bouton relâché, le serpent va tout droit ;
  - l'accélérateur à la touche Espace : vitesse ×2, perte de points, boules qui tombent derrière la queue ;
  - la croissance : la queue reste immobile pendant que le serpent grandit ;
  - le glissement contre les bords ;
  - les collisions contre les mannequins (corps, avant contre côté, face-à-face) ;
  - la traînée laissée à la mort, puis la réapparition après 5 s ;
  - le fever à 0:60 restant (avec `duration=70`, il démarre à 10 s) ;
  - la couronne et l'écran de fin, puis Rejouer.
- [ ] **Step 3:** Commit `feat: playable solo match with HUD and end screen`, push → déploiement Pages.
- [ ] **Step 4 (avec Thibault, sur K10) :** ouvrir `https://<user>.github.io/snakopouille/?dummies=7&fps=1`. Vérifier que le pilotage au doigt et le bouton accélérateur fonctionnent en même temps (deux doigts), et noter les FPS au début et au bout de 2 min. Pour tester un gros serpent, ajouter le paramètre de debug `?startPoints=20000`, qui écrase `startPoints` du serpent du joueur uniquement (l'ajouter dans `main.ts`). **Seuil : ≥ 50 FPS moyen.** Consigner le résultat dans `docs/spikes/2026-10-17-resultats-spike.md` (section « Plan 2 »), et dans `decisions.md` tout réglage modifié.
- [ ] **Step 5:** Commit `docs: plan 2 K10 validation`.
