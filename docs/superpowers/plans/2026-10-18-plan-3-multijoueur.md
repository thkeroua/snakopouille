# Plan 3 — Multijoueur en réseau local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Mode choisi par Thibault : « d'une traite » (executing-plans).**

**Goal:** Jouer à plusieurs sur le même Wi-Fi : accueil (pseudo, couleur), découverte des parties ou code, salon, partie synchronisée de 3 min, résumé, rejouer ; le solo reste disponible en « Entraînement ».

**Architecture:** Topologie en étoile. Une **`HostSession`** (logique hôte pure) et une **`ClientSession`** par joueur (logique client pure) se parlent par un `Channel` abstrait (deux voies : fiable ordonnée + rapide non fiable). L'hôte est un joueur comme les autres : sa propre `ClientSession` parle à sa `HostSession` par un canal mémoire (`memoryChannelPair`). Les invités utilisent un `Channel` WebRTC (PeerJS + canal brut négocié, validé par le spike). Toute la logique se teste sans réseau avec des canaux mémoire ; seuls `peerNet.ts` et l'UI se valident à la main.

**Tech Stack:** TypeScript 5.6 strict, Vite 5, Vitest 2, Canvas 2D, PeerJS 1.5.4 (déjà en dépendance).

**Spec:** `docs/superpowers/specs/2026-10-17-snakopouille-design.md` (§2 répartition de l'autorité, §3 parcours, §4 règles). À lire aussi : `decisions.md` (l'emporte sur la spec), `docs/spikes/2026-10-17-resultats-spike.md` (réseau direct validé, bridage des timers en arrière-plan).

## Global Constraints

- Cible : Lenovo Tab K10, Chrome Android. Pas de `shadowBlur`, pas d'O(n²) sur les corps, pas d'allocation par échantillon de corps à chaque pas.
- Tous les réglages de gameplay **et réseau** dans `src/config/gameplay.ts` (spec §6 « fréquence réseau »). Pas de nombre magique de gameplay ailleurs.
- Code/identifiants en anglais, textes affichés en français.
- Aucune nouvelle dépendance.
- Max **8 joueurs** (hôte compris), **pas d'arrivée en cours de partie**.
- Une couleur par joueur, non partageable (8 couleurs = `RENDER.playerColors`).
- Si l'hôte quitte : « L'hôte a quitté la partie », puis le résumé connu, puis retour au menu.
- Le client fait autorité sur son mouvement et sa mort tête contre corps ; l'hôte sur nourriture, points, têtes à tête, chrono, fever, scores, réapparitions, début/fin.
- Les données venant d'autres joueurs (pseudos) s'affichent par `textContent`, jamais `innerHTML`.
- TDD pour `src/net/` (hors `peerNet.ts`) et `src/game/`.

## Décisions de ce plan (à reporter dans `decisions.md` en Task 3)

1. **Frontière tête contre corps / tête à tête (remplace la décision « requalification » du 2026-10-17).** Le client ignore, dans sa détection tête contre corps, les échantillons situés dans le **cou** de l'autre serpent : abscisse depuis sa tête < demi-épaisseur de l'autre + rayon de tête du client + `neckExtra`, avec `neckExtra = 2 × speed × boostMultiplier / net.sendHz` (= 24). Le cou relève **uniquement** de l'hôte (`headClashes`/`resolveClash` sur les têtes qu'il reçoit). Plus besoin de requalifier ni de « ressusciter » un client mort à tort. Coût : un face-à-face que l'hôte rate (latence) se termine en mort contre le corps un peu plus loin.
2. **Couleur de la nourriture = `palette[id % palette.length]`** : on ne transmet pas la couleur.
3. **Interpolation sur l'horloge de l'émetteur** : chaque tête porte le `ts` (ms, `performance.now()` de l'émetteur). Le récepteur estime `offset = min(reçuÀ − ts)` et affiche les autres à `now − offset − interpDelayMs`. Au-delà du dernier échantillon : **on tient la dernière position** (pas d'extrapolation) → un joueur en arrière-plan est figé chez les autres.
4. **« Vies »** : chaque réapparition incrémente `life` du serpent. Tout message `me`/`eat`/`died` d'une ancienne vie est ignoré par l'hôte.
5. **Battement** : chaque côté envoie `{t:'beat'}` (fiable) toutes les `net.beatIntervalS` via `setInterval` (survit au bridage) ; sans aucun message pendant `net.peerTimeoutS` = 10 s, le pair est considéré parti.

## Review Focus

1. Deux joueurs passent sur la même nourriture au même moment : un seul est crédité, elle disparaît chez les deux, personne ne garde une nourriture « cachée » à vie.
2. Un invité ferme son onglet en pleine partie : son serpent disparaît chez tous (traînée lâchée), la partie continue, il reste dans le résumé final.
3. Messages en retard d'une vie précédente (`me`, `eat`, `died` arrivés après la mort) : ignorés, pas de double mort, pas de nourriture créditée à un mort.
4. L'hôte disparaît (fermeture propre, canal coupé, ou silence) au salon ou en partie : les invités voient « L'hôte a quitté la partie » en ≤ 10 s.
5. Deux invités arrivent avec la même couleur préférée / un 9ᵉ joueur / un joueur pendant une partie : le second reçoit la première couleur libre, le 9ᵉ et le retardataire sont refusés avec un message clair.

---

## File Structure

| Fichier | Rôle |
|---|---|
| `src/config/gameplay.ts` (mod.) | + section `net` |
| `src/net/protocol.ts` | types des messages, `PROTOCOL_VERSION` |
| `src/net/channel.ts` | interface `Channel` + `memoryChannelPair` |
| `src/net/roomId.ts`, `code.ts`, `slots.ts` | **déplacés** depuis `src/spike/net/` (le spike les importe depuis là) |
| `src/net/interp.ts` | `HeadBuffer` (interpolation) |
| `src/game/collision.ts` (mod.) | `BodyRef.arc`, `headHitsBody(..., neckExtra?)` |
| `src/game/food.ts` (mod.) | couleur par id, `insert`, journal des changements |
| `src/game/hostRules.ts` (mod.) | `deaths(..., reported, detectBody)`, `eatRequest` |
| `src/game/ranking.ts` | `buildRanking` (partagé solo / réseau) |
| `src/game/view.ts` | interface `GameView` lue par le rendu et le HUD |
| `src/game/remote.ts` | `applyHead` (corps reconstruit depuis la tête) |
| `src/net/hostSession.ts` | logique hôte (salon + partie) |
| `src/net/clientSession.ts` | logique client (salon + partie) |
| `src/net/peerNet.ts` | PeerJS : héberger, chercher, se connecter → `Channel` |
| `src/ui/home.ts`, `src/ui/lobby.ts` | écrans accueil et salon |
| `src/ui/screens.ts` (mod.) | écran de fin paramétrable |
| `src/app/solo.ts` | l'ancien `src/main.ts` (entraînement) |
| `src/app/online.ts` | boucle de partie réseau |
| `src/app/wakeLock.ts` | garder l'écran allumé |
| `src/main.ts` | routeur : accueil → solo / héberger / rejoindre |

---

### Task 1: Config réseau, protocole, canal mémoire, déplacement des utilitaires réseau

**Files:**
- Modify: `src/config/gameplay.ts`
- Create: `src/net/protocol.ts`, `src/net/channel.ts`
- Move (`git mv`): `src/spike/net/{roomId,code,slots}.ts` → `src/net/`, `tests/spike/{roomId,code,slots}.test.ts` → `tests/net/`; mettre à jour les imports de `src/spike/net/main.ts` et des tests.
- Test: `tests/net/channel.test.ts`

**Interfaces:**
- Produces:
  - `GameplayConfig.net: { sendHz: 20; interpDelayMs: 100; peerTimeoutS: 10; beatIntervalS: 1; probeTimeoutMs: 4000; connectTimeoutMs: 15000 }` (champs `readonly number`).
  - `src/net/protocol.ts` (exact) :

```ts
import type { RankingRow } from '../game/ranking';
import type { DeathCause, SnakeId } from '../game/types';

export const PROTOCOL_VERSION = 1;
export type ColorIndex = number; // indice dans RENDER.playerColors
export type LobbyPlayer = { id: SnakeId; name: string; color: ColorIndex; host: boolean };
export type FoodWire = [id: number, x: number, y: number, value: number];
export type SpawnWire = [id: SnakeId, life: number, x: number, y: number, angle: number];
export type HeadWire = [id: SnakeId, life: number, ts: number, x: number, y: number, angle: number, boost: 0 | 1, points: number];
export type StatsWire = [id: SnakeId, score: number, deaths: number, maxPoints: number];
export type RejectReason = 'full' | 'playing' | 'version';

export type Msg =
  // les deux sens
  | { t: 'beat' }
  | { t: 'bye' }
  // invité → hôte
  | { t: 'join'; v: number; name: string; color: ColorIndex }
  | { t: 'color'; color: ColorIndex }
  | { t: 'me'; life: number; ts: number; x: number; y: number; a: number; b: 0 | 1 } // voie rapide
  | { t: 'eat'; life: number; ids: number[] }
  | { t: 'died'; life: number; killer: SnakeId }
  // hôte → invité
  | { t: 'hello'; name: string; players: number; max: number; playing: boolean } // réponse aux sondes
  | { t: 'welcome'; you: SnakeId }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'lobby'; players: LobbyPlayer[]; code: string }
  | { t: 'start'; durationS: number; players: LobbyPlayer[]; spawns: SpawnWire[]; food: FoodWire[] }
  | { t: 'heads'; time: number; s: HeadWire[] } // voie rapide ; time = chrono de partie (s)
  | { t: 'food'; add: FoodWire[]; del: number[] }
  | { t: 'death'; victim: SnakeId; killer: SnakeId | null; cause: DeathCause; respawnAt: number }
  | { t: 'respawn'; spawn: SpawnWire }
  | { t: 'stats'; rows: StatsWire[] }
  | { t: 'left'; id: SnakeId }
  | { t: 'end'; ranking: RankingRow[] };
```

  - `src/net/channel.ts` :
    - `interface Channel { sendReliable(m: Msg): void; sendFast(m: Msg): void; onMessage(fn: (m: Msg) => void): void; onClose(fn: () => void): void; close(): void; }` — un seul abonné par événement suffit (le dernier enregistré remplace le précédent).
    - `memoryChannelPair(opts?: { dropFast?: () => boolean }): [Channel, Channel]` : livraison **synchrone** ; `sendFast` est abandonné si `dropFast?.()` renvoie vrai ; après `close()` d'un côté, les deux `onClose` sont appelés une fois et les envois suivants sont ignorés.
- Note : `RankingRow` déménage dans `src/game/ranking.ts` en Task 3. En Task 1, créer `src/game/ranking.ts` avec seulement `export type { RankingRow } from './match';` ; la Task 3 inverse le sens.

- [ ] **Step 1: Tests du canal mémoire** (`tests/net/channel.test.ts`)

```ts
test('memory channel delivers both lanes synchronously', () => {
  const [a, b] = memoryChannelPair();
  const got: Msg[] = [];
  b.onMessage((m) => got.push(m));
  a.sendReliable({ t: 'beat' });
  a.sendFast({ t: 'bye' });
  expect(got).toEqual([{ t: 'beat' }, { t: 'bye' }]);
});
test('dropFast drops only the fast lane', () => {
  const [a, b] = memoryChannelPair({ dropFast: () => true });
  const got: Msg[] = [];
  b.onMessage((m) => got.push(m));
  a.sendFast({ t: 'beat' });
  a.sendReliable({ t: 'bye' });
  expect(got).toEqual([{ t: 'bye' }]);
});
test('close notifies both ends once and mutes further sends', () => {
  const [a, b] = memoryChannelPair();
  let ca = 0, cb = 0;
  a.onClose(() => ca++); b.onClose(() => cb++);
  const got: Msg[] = [];
  b.onMessage((m) => got.push(m));
  a.close(); a.close(); b.close();
  a.sendReliable({ t: 'beat' });
  expect([ca, cb, got.length]).toEqual([1, 1, 0]);
});
```

- [ ] **Step 2:** `npx vitest run tests/net/channel.test.ts` → FAIL (module introuvable).
- [ ] **Step 3:** Écrire `net` dans la config, `protocol.ts`, `channel.ts`, le ré-export de `ranking.ts`, faire les `git mv` et corriger les imports.
- [ ] **Step 4:** `npm test` → tout vert (les tests déplacés passent sans changement de contenu hors imports) ; `npx tsc --noEmit` → 0 erreur.
- [ ] **Step 5:** Commit `feat(net): protocol, memory channel, net config`.

---

### Task 2: Interpolation des têtes distantes

**Files:**
- Create: `src/net/interp.ts`
- Test: `tests/net/interp.test.ts`

**Interfaces:**
- Produces: `class HeadBuffer { constructor(delayMs: number); push(ts: number, recvAt: number, x: number, y: number, angle: number, boost: boolean): void; sample(now: number): { x: number; y: number; angle: number; boost: boolean } | null; clear(): void; size(): number }`
  - `push` ignore un `ts` ≤ au dernier reçu (doublons renvoyés par l'hôte). `offset = min(recvAt − ts)` sur tous les échantillons depuis le dernier `clear`.
  - `sample(now)` : `t = now − offset − delayMs` ; vide → `null` ; avant le 1ᵉʳ → le 1ᵉʳ ; après le dernier → le dernier (tenu) ; sinon interpolation linéaire des positions et de l'angle par le plus court chemin (`angleDiff` de `src/game/math.ts`), `boost` = celui de l'échantillon le plus ancien des deux. Les échantillons plus vieux que `t − 1000` sont jetés en gardant au moins celui juste avant `t`.

- [ ] **Step 1: Tests**

```ts
const buf = () => new HeadBuffer(100);
test('empty buffer samples null', () => expect(buf().sample(0)).toBeNull());
test('interpolates on the sender clock with the delay', () => {
  const b = buf();
  b.push(1000, 5000, 0, 0, 0, false); // offset = 4000
  b.push(1050, 5070, 10, 0, 0, false); // arrivé en retard : offset reste 4000
  expect(b.sample(5125)!.x).toBeCloseTo(5, 6); // t = 1025
});
test('holds the last sample instead of extrapolating', () => {
  const b = buf();
  b.push(0, 0, 0, 0, 0, false); b.push(50, 50, 10, 20, 1, true);
  expect(b.sample(10_000)).toEqual({ x: 10, y: 20, angle: 1, boost: true });
});
test('ignores duplicate or older timestamps', () => {
  const b = buf();
  b.push(50, 50, 1, 1, 0, false); b.push(50, 60, 9, 9, 0, false); b.push(40, 70, 9, 9, 0, false);
  expect(b.size()).toBe(1);
});
test('angle interpolates along the shortest arc', () => {
  const b = buf();
  b.push(0, 0, 0, 0, Math.PI - 0.1, false); b.push(100, 100, 0, 0, -Math.PI + 0.1, false);
  expect(Math.abs(b.sample(150)!.angle)).toBeCloseTo(Math.PI, 6);
});
test('old samples are pruned', () => {
  const b = buf();
  for (let i = 0; i < 200; i++) b.push(i * 50, i * 50, i, 0, 0, false);
  b.sample(200 * 50);
  expect(b.size()).toBeLessThan(30);
});
```

- [ ] **Step 2:** `npx vitest run tests/net/interp.test.ts` → FAIL.
- [ ] **Step 3:** Implémenter `HeadBuffer` (tableau simple, le nombre d'échantillons est petit).
- [ ] **Step 4:** Même commande → PASS.
- [ ] **Step 5:** Commit `feat(net): head interpolation buffer`.

---

### Task 3: Préparer la simulation pour le réseau

**Files:**
- Modify: `src/game/collision.ts`, `src/game/food.ts`, `src/game/hostRules.ts`, `src/game/match.ts`, `src/game/ranking.ts`, `decisions.md`
- Create: `src/game/view.ts`, `src/game/remote.ts`
- Modify: `src/render/renderer.ts`, `src/ui/hud.ts`, `src/ui/screens.ts` (lisent un `GameView`)
- Test: `tests/game/collision.test.ts`, `tests/game/food.test.ts`, `tests/game/hostRules.test.ts` (nouveau), `tests/game/remote.test.ts` (nouveau), `tests/game/match.test.ts`

**Interfaces:**
- Produces:
  - `BodyRef` gagne `arc: number` (abscisse depuis la tête de son serpent, déjà calculée dans `buildBodyGrid`).
  - `headHitsBody(s, grid, maxHalfWidth, cfg, neckExtra?: number): SnakeId | null` — avec `neckExtra`, ignore les refs dont `arc < b.halfWidth + headRadius(s) + neckExtra`.
  - `neckExtra(cfg: GameplayConfig): number` dans `collision.ts` = `2 * cfg.snake.speed * cfg.snake.boostMultiplier / cfg.net.sendHz`.
  - `FoodStore` : couleur = `palette[id % palette.length]` (plus de tirage) ; `insert(id, x, y, value): Food` (miroir client, met à jour `nextId = max(nextId, id + 1)`) ; `trackChanges = true` active un journal ; `drainChanges(): { add: FoodWire[]; del: number[] }` vide le journal (une nourriture ajoutée puis retirée dans le même intervalle n'apparaît dans aucune des deux listes).
  - `HostRules.deaths(snakes, events, reported: readonly { victim: SnakeId; killer: SnakeId }[] = [], detectBody = true): void` — ordre : têtes à tête, puis `reported` (cause `'body'`, ignorés si la victime est déjà morte ou trouvée), puis détection corps si `detectBody`.
  - `HostRules.eatRequest(s: SnakeState, ids: readonly number[], events): void` — crédite chaque id encore présent, ignore les autres et ignore tout si `s` est mort.
  - `src/game/ranking.ts` : `type RankingRow` (déplacé ici depuis `match.ts`, qui le ré-exporte) et `buildRanking(snakes: readonly SnakeState[], stats: ReadonlyMap<SnakeId, PlayerStats>): RankingRow[]` (tri score ↓ puis points ↓ ; un mort affiche 0 point ; un id sans stats compte 0).
  - `src/game/view.ts` :

```ts
export interface GameView {
  readonly cfg: GameplayConfig;
  readonly snakes: readonly SnakeState[];
  readonly food: ReadonlyMap<number, Food>;
  readonly hiddenFood: ReadonlySet<number>; // demandée par le client, pas encore confirmée
  readonly time: number; // chrono de partie (s)
  readonly fever: boolean;
  readonly ended: boolean;
  ranking(): RankingRow[];
}
```
  - `Match implements GameView` (getters sur `host`, `hiddenFood` = ensemble vide). `Renderer.draw(view: GameView, ownId)` et `Hud.update(view: GameView, ownId, force?)` remplacent leur paramètre `Match`. Le rendu saute les ids de `hiddenFood`.
  - `src/game/remote.ts` : `applyHead(s: SnakeState, x: number, y: number, angle: number, boosting: boolean, points: number, cfg: GameplayConfig): void` — `prevX/prevY` = tête actuelle, `points`, `angle`, `boosting` mis à jour, `path.moveHead` si la position change, puis `path.trimTo(targetLengthFor(points))`.
  - `showEndScreen(root, ranking, opts: { title: string; buttons: { label: string; onClick: () => void }[]; note?: string })` — le solo passe `{ title: 'Fin de partie', buttons: [{ label: 'Rejouer', onClick }] }`. Un clic masque l'écran puis appelle `onClick`.

- [ ] **Step 1: Tests (rouges)**

```ts
// collision.test.ts
test('neckExtra = 2 × boosted speed / sendHz', () => expect(neckExtra(GAMEPLAY)).toBe(24));
test('client-side check ignores the other snake neck', () => {
  const b = snake('B', [{ x: 100, y: 500 }, { x: 400, y: 500 }], 0, 1000);
  const near = snake('A', [{ x: 390, y: 560 }, { x: 390, y: 501 }], -Math.PI / 2); // 10 u derrière la tête de B
  const far = snake('C', [{ x: 250, y: 560 }, { x: 250, y: 501 }], -Math.PI / 2);
  const g = grid([b, near, far]);
  expect(headHitsBody(near, g, 20, GAMEPLAY, neckExtra(GAMEPLAY))).toBeNull();
  expect(headHitsBody(near, g, 20, GAMEPLAY)).toBe('B');
  expect(headHitsBody(far, g, 20, GAMEPLAY, neckExtra(GAMEPLAY))).toBe('B');
});
// food.test.ts
test('food color derives from id', () => { /* deux FoodStore de graines différentes : même couleur pour le même id */ });
test('insert keeps the given id and advances nextId', () => { /* insert(42,…) puis add() → id 43 */ });
test('drainChanges reports adds and dels, and cancels add+del in the same window', () => {
  /* trackChanges=true ; add a, add b, remove a, remove un id antérieur c → { add: [b], del: [c] } ; 2ᵉ drain vide */
});
// hostRules.test.ts
test('reported body death scores the killer and drops a trail', () => { /* deaths(snakes, ev, [{victim:'A',killer:'B'}], false) */ });
test('reported death of an already dead snake is ignored', () => { /* deaths count reste 1, score killer 1 */ });
test('detectBody=false does not run local body detection', () => { /* A en plein dans le corps de B, aucun reported → personne ne meurt */ });
test('eatRequest credits only present food and ignores dead snakes', () => { /* ids [présent, absent] → +valeur une fois ; snake mort → rien */ });
// remote.test.ts
test('applyHead grows from the tail and trims to target length', () => { /* 200 têtes en ligne à 1000 points → path.length() ≈ min(distance, targetLengthFor(1000)) */ });
test('applyHead records the previous head for swept clashes', () => { /* prevX = ancienne tête */ });
// match.test.ts
test('Match exposes GameView fields', () => { /* time, fever, ended, food === host.food.items, hiddenFood.size === 0 */ });
```

  Les tests marqués `/* … */` s'écrivent avec les assertions décrites ; les valeurs exactes viennent des fonctions de `sizing.ts`.
- [ ] **Step 2:** `npm test` → les nouveaux tests échouent, les anciens passent.
- [ ] **Step 3:** Implémenter les changements listés dans Interfaces. `Match.tick` continue d'appeler `deaths(this.snakes, events)` et `eat` (solo inchangé). Mettre `src/main.ts` à jour pour la nouvelle signature de `showEndScreen`.
- [ ] **Step 4:** `npm test` et `npx tsc --noEmit` → tout vert.
- [ ] **Step 5:** Dans `decisions.md`, remplacer le paragraphe « Frontière client/hôte pour le plan 3 (à appliquer) » par la décision n°1 de ce plan (datée 2026-10-18), et ajouter les décisions 2 à 5.
- [ ] **Step 6:** Commit `refactor(game): network-ready rules, GameView, neck-aware body check`.

---

### Task 4: HostSession — salon

**Files:**
- Create: `src/net/hostSession.ts`
- Test: `tests/net/hostSession.lobby.test.ts`

**Interfaces:**
- Consumes: `Channel`, `memoryChannelPair`, `Msg`, `PROTOCOL_VERSION`, `GameplayConfig`.
- Produces:

```ts
export type HostPhase = 'lobby' | 'playing' | 'ended';
export class HostSession {
  constructor(cfg: GameplayConfig, opts: { seed: number; now: () => number; colorCount: number });
  code: string;                         // affiché dans le salon, fixé par l'appli après openHost
  get phase(): HostPhase;
  connectLocal(): Channel;              // canal mémoire ; le côté hôte est enregistré comme joueur « host: true »
  addGuest(ch: Channel): void;          // canal d'un invité ; attend son 'join'
  lobbyPlayers(): LobbyPlayer[];
  probeInfo(): Extract<Msg, { t: 'hello' }>; // name = pseudo du joueur hôte (ou 'Hôte' avant son join)
  start(): void;                        // Task 5
  tick(dt: number): void;               // Task 5 ; vérifie aussi les délais
  beat(): void;                         // envoie {t:'beat'} à tous et vérifie les délais
  close(): void;                        // 'bye' à tous puis ferme tous les canaux
}
```

  Règles du salon :
  - `join` : `v !== PROTOCOL_VERSION` → `reject 'version'` puis `close` ; phase `playing` → `reject 'playing'` ; déjà 8 joueurs (`cfg.maxPlayers`) → `reject 'full'`. Sinon id `p1`, `p2`… (jamais réutilisé dans une session), pseudo coupé à 16 caractères et vide → `Joueur N`, couleur demandée si libre sinon la première libre, `welcome` à lui, puis `lobby` à tous.
  - `color` : appliquée seulement si libre (sinon ignorée) ; `lobby` à tous.
  - `bye` ou `onClose` ou aucun message depuis `net.peerTimeoutS` : retrait du joueur, `lobby` à tous (en partie : Task 5).
  - Le joueur hôte (via `connectLocal`) a `host: true`.

- [ ] **Step 1: Tests**

```ts
// helper : const guest = (h) => { const [a, b] = memoryChannelPair(); h.addGuest(b); const got: Msg[] = []; a.onMessage(m => got.push(m)); return { ch: a, got }; };
test('join gets welcome and everyone gets the lobby');
test('same preferred color: the second gets the first free color');
test('color change to a taken color is ignored');
test('9th player is rejected with full');
test('wrong protocol version is rejected and closed');
test('guest closing its channel leaves the lobby');
test('silent guest is dropped after peerTimeoutS (now() avancée de 10,5 s puis beat())');
test('probeInfo reports host name, player count and phase');
test('empty or long names are cleaned up');
```

  Chaque test vérifie le dernier `lobby` reçu (ids, couleurs, `host`) ou le `reject.reason`.
- [ ] **Step 2:** `npx vitest run tests/net/hostSession.lobby.test.ts` → FAIL.
- [ ] **Step 3:** Implémenter le salon.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(net): host lobby`.

---

### Task 5: HostSession — partie

**Files:**
- Modify: `src/net/hostSession.ts`
- Test: `tests/net/hostSession.match.test.ts`

**Interfaces:**
- Consumes: `HostRules`, `createHost`, `findSpawnPoint`, `createSnake`, `applyHead`, `buildRanking`, `FoodStore.drainChanges`, `neckExtra` n'est pas utilisé côté hôte.
- Produces (comportement de `start()` et `tick(dt)`) :
  - `start()` (phase `lobby` ou `ended`, ≥ 1 joueur) : nouvelle graine (`seed` puis LCG comme `src/main.ts`), `createHost`, `trackChanges = true`, un `SnakeState` par joueur placé par `findSpawnPoint` l'un après l'autre, `life = 1`, `initialNatural` nourritures, `drainChanges()` vidé, puis `start` à tous avec `durationS = cfg.match.durationS`. Phase `playing`.
  - Réception en `playing` :
    - `me` (vie courante et serpent vivant) : mis en file pour le prochain `tick`.
    - `eat` (vie courante) : `rules.eatRequest`.
    - `died` (vie courante) : mis en file comme mort signalée `{ victim, killer }`.
    - messages d'une autre vie : ignorés.
  - `tick(dt)` en `playing`, dans cet ordre :
    1. `rules.clock` ;
    2. `rules.respawns` (pour chaque événement `respawn` : `life++`, `respawn` à tous avec la position) ;
    3. pour chaque serpent vivant : `prevX/prevY` = tête, puis `applyHead` pour chaque `me` en file (dans l'ordre), dernier `b` retenu comme état de boost ; puis `rules.boost(s, { target: null, boost }, dt)` ;
    4. `rules.deaths(snakes, events, signalées, false)` → pour chaque mort : `death` à tous (avec `respawnAt`), puis `stats` à tous ;
    5. `rules.spawnFood(dt)` ;
    6. `drainChanges()` non vide → `food` à tous ;
    7. toutes les `1 / net.sendHz` s : `heads` (voie rapide) à tous, avec `time` et une entrée par serpent vivant **ayant déjà envoyé un `me` dans sa vie courante** (`ts` = dernier `ts` reçu de ce joueur, points arrondis à l'entier inférieur) ;
    8. `rules.finish` → si `end` : `food`/`stats` en attente envoyés, puis `end` avec `buildRanking`, phase `ended`.
  - Départ d'un joueur en `playing` : s'il est vivant, mort sans tueur (traînée, `death` puis `food`), plus jamais de réapparition (`respawnAt = Infinity`), `left` à tous ; il reste dans le classement final.
  - Hôte : sa propre `ClientSession` passe par `connectLocal`, il n'y a aucun cas particulier côté `HostSession`.

- [ ] **Step 1: Tests** (2 invités mémoire qui envoient leurs `join`, puis `start()`)

```ts
test('start sends spawns, initial food and duration to everyone');
test('me messages move the snake on the host and are relayed in heads at sendHz'); // 60 tick(1/60) → 20 heads
test('eat credits the first request only; the food del is broadcast once');       // Review Focus 1
test('died from the current life kills, scores the killer, drops a trail, sends death then food then stats');
test('messages from a previous life are ignored');                                 // Review Focus 3
test('head-on decided by the host kills both, nobody scores');
test('respawn after respawnDelayS increments life and broadcasts the spawn');
test('a guest leaving mid-match dies once, never respawns, stays in the final ranking'); // Review Focus 2
test('end after durationS sends the ranking and allows start() again with scores reset');
test('join during a match is rejected with playing');                              // Review Focus 5
```

- [ ] **Step 2:** `npx vitest run tests/net/hostSession.match.test.ts` → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** → PASS ; `npm test` vert.
- [ ] **Step 5:** Commit `feat(net): host match loop`.

---

### Task 6: ClientSession

**Files:**
- Create: `src/net/clientSession.ts`
- Test: `tests/net/clientSession.test.ts`

**Interfaces:**
- Consumes: `Channel`, `Msg`, `HeadBuffer`, `stepMotion`, `createSnake`, `applyHead`, `buildBodyGrid`, `headHitsBody`, `neckExtra`, `FoodStore.insert`, `buildRanking`, `GameView`.
- Produces:

```ts
export type ClientPhase = 'connecting' | 'lobby' | 'playing' | 'ended' | 'closed';
export type CloseReason = 'host-left' | RejectReason;
export class ClientSession implements GameView {
  constructor(ch: Channel, name: string, color: ColorIndex, cfg: GameplayConfig, opts: { now: () => number; palette: readonly string[] });
  phase: ClientPhase; you: SnakeId | null; lobby: LobbyPlayer[]; code: string;
  closeReason: CloseReason | null; endRanking: RankingRow[] | null;
  onChange: (what: 'lobby' | 'start' | 'end' | 'closed') => void; // no-op par défaut
  setColor(c: ColorIndex): void;
  leave(): void;                         // 'bye' puis close ; phase 'closed', closeReason null
  beat(): void;                          // 'beat' à l'hôte + vérifie le délai de l'hôte
  tick(dt: number, input: SnakeInput): void;
  // GameView : cfg (durée reçue dans 'start'), snakes, food, hiddenFood, time, fever, ended, ranking()
}
```

  Comportement :
  - Le constructeur envoie `join` avec `PROTOCOL_VERSION`. `welcome` → `you` ; `lobby` → phase `lobby`, `onChange('lobby')` ; `reject` → phase `closed`, `closeReason = reason`, `onChange('closed')`.
  - `start` : `cfg = withConfig(cfg, { match: { durationS } })`, serpents créés aux spawns (couleur = `palette` de l'appli via `LobbyPlayer.color`), nourriture insérée, état remis à zéro (stats, `hiddenFood`, buffers, `endRanking`), phase `playing`, `onChange('start')`.
  - `tick(dt, input)` en `playing` :
    1. Son serpent vivant : `stepMotion`.
    2. Nourriture touchée par sa tête (`food.touching`) et pas déjà dans `hiddenFood` → ajout à `hiddenFood`, un seul `eat` groupé.
    3. Corps des autres : `buildBodyGrid` (pool réutilisé) puis `headHitsBody(own, grid, maxHalf, cfg, neckExtra(cfg))`. Touché → `own.alive = false` tout de suite, `died` envoyé une fois.
    4. Toutes les `1 / sendHz` s, si vivant : `me` (voie rapide), avec `ts = now()`.
    5. Serpents distants vivants : `HeadBuffer.sample(now())` → `applyHead`.
  - `heads` : `time` mémorisé avec l'instant de réception, `time` exposé = dernier `time` + écoulé depuis, sans jamais reculer. Pour chaque entrée : son serpent → seulement `points` ; un autre → `HeadBuffer.push` si `life` = vie connue (un buffer par serpent).
  - `food` : `insert` des ajouts, `remove` + retrait de `hiddenFood` des suppressions.
  - `death` : serpent mort, `respawnAt` mémorisé. `respawn` : `life` mis à jour, `path.reset`, `angle`, `points = startPoints`, `alive = true`, buffer vidé. `stats` → table de stats. `left` → serpent mort, `respawnAt = Infinity`.
  - `end` : `endRanking`, phase `ended`, `onChange('end')`.
  - `fever` = `time ≥ durationS − feverLastS`. `ended` = phase `ended`.
  - Hôte parti (`bye`, `onClose`, ou aucun message depuis `peerTimeoutS`, vérifié dans `tick` et `beat`) → phase `closed`, `closeReason = 'host-left'`, `onChange('closed')`, une seule fois.

- [ ] **Step 1: Tests** (la `ClientSession` face à un faux hôte : l'autre bout d'un `memoryChannelPair` qui enregistre et envoie des messages à la main)

```ts
test('sends join with the protocol version and reaches lobby on welcome+lobby');
test('reject closes with the reason');
test('start builds snakes and food; own snake moves locally with input');
test('sends me at sendHz only while alive');
test('touching food hides it and sends a single eat; del confirms and unhides');
test('body hit outside the neck kills locally and sends died once');
test('remote snake follows interpolated heads; stale life is ignored');
test('own points come from heads and the tail trims to them');
test('time follows heads and never goes backwards; fever after durationS - feverLastS');
test('host bye / channel close / silence → closed host-left exactly once');    // Review Focus 4
test('end stores the ranking and a new start resets everything');
```

- [ ] **Step 2:** `npx vitest run tests/net/clientSession.test.ts` → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(net): client session`.

---

### Task 7: Intégration hôte + clients sans réseau

**Files:**
- Test: `tests/net/integration.test.ts`

**Interfaces:**
- Consumes: `HostSession` (`connectLocal`, `addGuest`, `start`, `tick`), `ClientSession`, `memoryChannelPair`.

- [ ] **Step 1: Tests** (hôte + 2 invités, partie de 20 s via `withConfig`, horloge factice avancée de 1/60 s par pas ; chaque pas : `host.tick` puis chaque `client.tick`)

```ts
test('all clients see the same snakes, food and ranking at the end');
// → même liste d'ids de nourriture chez les 3 au dernier pas ; endRanking identiques ; ids et couleurs uniques
test('two clients racing for the same food: exactly one credited, none left hidden'); // Review Focus 1
test('a guest that steers into another body dies on every screen, killer scores 1');
test('fast lane with 30 % loss still converges (positions within 30 u of the owner)');
test('host-side guest close mid-match: remaining players finish and the leaver is in the ranking');
```

- [ ] **Step 2:** `npx vitest run tests/net/integration.test.ts` → FAIL ou PASS selon les tâches précédentes. Un test qui passe du premier coup est acceptable ici (test d'intégration de comportements déjà construits). Un échec révèle un bug de Task 4 à 6 : le corriger à la source, avec un test unitaire rouge→vert dans la tâche concernée.
- [ ] **Step 3:** `npm test` vert.
- [ ] **Step 4:** Commit `test(net): host/client integration over memory channels`.

---

### Task 8: PeerJS → Channel (héberger, chercher, rejoindre)

**Files:**
- Create: `src/net/peerNet.ts`

**Interfaces:**
- Consumes: `fetchPublicIp`, `roomIdFromIp`, `peerIdForSlot`, `SLOTS`, `claimSlot`, `generateCode`, `peerIdForCode`, `normalizeCode`, `Channel`, `Msg`, `cfg.net`.
- Produces:

```ts
export type GameInfo = { peerId: string; slot: number; name: string; players: number; max: number; playing: boolean };
export function getRoomId(): Promise<string | null>; // ipify + hash ; null si échec (3 s max)
export function openHost(
  roomId: string | null,
  probeInfo: () => Msg,
  onGuest: (ch: Channel) => void,
): Promise<{ slot: number | null; code: string; destroy(): void }>;
export function findGames(roomId: string, timeoutMs: number): Promise<GameInfo[]>; // trié par slot
export function connectToHost(peerId: string, timeoutMs: number): Promise<Channel>;  // rejette avec Error('timeout'|'unavailable'|…)
```

  Reprendre du spike (`src/spike/net/main.ts`) : `PEER_OPTIONS` (STUN Google), `openPeer` (`unavailable-id` → pris), les sondes (`metadata: { probe: true }`, réponse `hello` puis fermeture après 500 ms), le canal brut négocié (`negotiated: true, id: 7, ordered: false, maxRetransmits: 0`) créé des deux côtés sur `conn.peerConnection`. **Une seule** `DataConnection` fiable (`reliable: true, serialization: 'json'`) par invité ; `sendReliable` → `conn.send`, `sendFast` → canal brut (`JSON.stringify`) ; `onClose` déclenché par `conn` `close`/`error` ou `iceConnectionState` `failed`/`closed`. Le `Channel` n'est livré qu'une fois la connexion **et** le canal brut ouverts. Code : 5 essais de `generateCode` au maximum ; `code` vide si aucun.

- [ ] **Step 1:** Implémenter (pas de test unitaire : réseau réel, validé en Task 9).
- [ ] **Step 2:** `npx tsc --noEmit` → 0 erreur ; `npm test` vert.
- [ ] **Step 3:** Commit `feat(net): PeerJS transport`.

---

### Task 9: Écrans et boucle réseau

**Files:**
- Create: `src/app/solo.ts` (contenu de l'actuel `src/main.ts`, exporté en `startSolo(params: URLSearchParams, onExit: () => void)`), `src/app/online.ts`, `src/app/wakeLock.ts`, `src/ui/home.ts`, `src/ui/lobby.ts`
- Modify: `src/main.ts` (routeur), `index.html` (conteneurs `#home`, `#lobby` + styles), `src/ui/screens.ts`
- Test: `tests/ui/prefs.test.ts` (pseudo et couleur mémorisés)

**Interfaces:**
- Produces:
  - `src/ui/home.ts` : `loadPrefs(storage?: Storage): { name: string; color: ColorIndex }` et `savePrefs(p, storage?)` — clés `snk-name`, `snk-color`, chaque accès dans un `try/catch`, couleur hors [0, 7] → 0 ; `showHome(root, handlers: { onHost(name, color); onJoin(peerId, name, color); onSolo(); findGames(): Promise<GameInfo[]> ; error?: string })`.
  - `src/ui/lobby.ts` : `showLobby(root, session: ClientSession, opts: { isHost: boolean; onStart(): void; onLeave(): void })`, mis à jour à chaque `onChange('lobby')`.
  - `src/app/online.ts` : `runOnline(session: ClientSession, host: HostSession | null, onExit: (message?: string) => void): void` — boucle à pas fixe `SIM_DT` (max 5 pas par frame) : `host?.tick(SIM_DT)` puis `session.tick(SIM_DT, controls.read())` ; rendu `Renderer.draw(session, session.you)` et `Hud.update` ; `setInterval` de `net.beatIntervalS` pour `host?.beat()` et `session.beat()`.
  - `src/app/wakeLock.ts` : `keepAwake(): void` / `releaseAwake(): void` — `navigator.wakeLock?.request('screen')`, redemandé à `visibilitychange` visible, erreurs ignorées.
- Textes (exacts) :
  - Accueil : titre `Snakopouille`, champ `Ton pseudo`, `Créer une partie`, `Parties sur ce Wi-Fi`, `Recherche…`, `Aucune partie trouvée sur ce Wi-Fi.`, `Actualiser`, bouton de partie `Partie de {nom} — {n}/{max}` + `Rejoindre` (désactivé avec `en cours` si `playing`), `Rejoindre avec un code`, `Code à 4 caractères`, `Code invalide`, `Entraînement solo`, `Connexion…`, `Connexion impossible`.
  - Refus : `full` → `La partie est complète (8 joueurs).`, `playing` → `La partie a déjà commencé.`, `version` → `Version différente : rechargez la page.`
  - Salon : `Salon — code {code}` (ou `Salon` sans code), `(hôte)`, `Lancer la partie`, `En attente du lancement par l'hôte…`, `Quitter`.
  - Fin : hôte → boutons `Rejouer` et `Menu` ; invité → note `En attente de l'hôte…` et bouton `Menu` ; hôte parti → titre `L'hôte a quitté la partie`, bouton `Menu`, classement = `session.ranking()` du moment.
- Routeur `src/main.ts` :
  - `?solo=1` (avec les paramètres actuels `dummies`, `fps`, `startPoints`, `duration`, `seed`) → solo direct ; sinon accueil. `?duration=` s'applique aussi à la partie hébergée.
  - Héberger : `HostSession` + `openHost(roomId, () => host.probeInfo(), (ch) => host.addGuest(ch))`, `host.code = code`, `ClientSession` sur `host.connectLocal()`, salon.
  - Rejoindre : `connectToHost(peerId, connectTimeoutMs)` → `ClientSession` → salon ; échec → accueil avec `Connexion impossible`.
  - `onChange('start')` → `runOnline` ; `'end'` → écran de fin ; `'closed'` → message de refus ou écran « hôte parti ».
  - Quitter / Menu : `leave()` ou `host.close()` + `destroy()`, `releaseAwake()`, retour accueil.
  - `keepAwake()` en entrant dans le salon.
  - La surcouche portrait et le plein écran au premier toucher restent actifs partout.

- [ ] **Step 1:** Test `tests/ui/prefs.test.ts` avec un faux `Storage` : valeurs par défaut (`''`, 0), aller-retour, couleur invalide → 0, `storage` qui lève → valeurs par défaut sans exception. Lancer : FAIL.
- [ ] **Step 2:** Implémenter `loadPrefs`/`savePrefs` → PASS.
- [ ] **Step 3:** Implémenter écrans, routeur, boucle, wake lock.
- [ ] **Step 4:** `npm test`, `npm run build` → verts.
- [ ] **Step 5:** Vérification navigateur (Chrome headless via playwright-core s'il est disponible dans le scratchpad, sinon deux onglets à la main) sur `npm run dev` :
  - onglet A crée la partie ;
  - onglet B la trouve dans la liste, puis rejoint aussi **par code** ;
  - B change de couleur, la couleur prise est grisée chez A ;
  - A lance la partie, les deux serpents bougent chez les deux ;
  - partie `?duration=20` jusqu'au résumé, puis `Rejouer` ;
  - fermeture de A → B affiche « L'hôte a quitté la partie » en ≤ 10 s ;
  - aucune erreur dans la console.
- [ ] **Step 6:** Commit `feat: home, lobby and online match`.

---

### Task 10: Documentation et test sur tablettes (avec Thibault)

**Files:**
- Modify: `CLAUDE.md` (feuille de route : plan 3 fait, URL solo `?solo=1&…`), `docs/spikes/2026-10-17-resultats-spike.md` (URL du test FPS 5 → `?solo=1&dummies=7&fps=1&startPoints=20000`)

- [ ] **Step 1:** Mettre la documentation à jour, commit `docs: plan 3 status`, push sur `main` (déploiement Pages).
- [ ] **Step 2 (Thibault) :** partie à 2+ tablettes sur le même Wi-Fi :
  - découverte, rejoindre par code ;
  - couleurs ;
  - partie complète, rejouer ;
  - l'hôte quitte.

  Noter tout ce qui gêne (latence ressentie, saccades des autres serpents, morts injustes).
