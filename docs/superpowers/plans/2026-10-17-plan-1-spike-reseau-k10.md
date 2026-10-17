# Plan 1 — Spike réseau + rendu sur Lenovo K10 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prouver, sur les vraies tablettes Lenovo K10 de Thibault, que (1) des navigateurs Chrome Android sur le même Wi-Fi se découvrent et se connectent en WebRTC direct via PeerJS + IP publique, avec une latence compatible avec le jeu, et (2) le rendu Canvas 2D style néon d'une scène réaliste tient le framerate. Produire un rapport chiffré qui conditionne les plans 2 et 3.

**Architecture:** Projet Vite + TypeScript multi-pages déployé sur GitHub Pages (HTTPS obligatoire pour WebRTC hors localhost). Deux pages de test jetables : `spike-network.html` (hôte/rejoindre/mesures) et `spike-render.html` (banc FPS). La logique pure (identifiants, codes, stats, lecture des stats WebRTC) est testée en Vitest ; le reste est validé à la main sur les tablettes.

**Tech Stack:** Node ≥ 18, Vite 5.4.10, TypeScript 5.6.3, Vitest 2.1.4, PeerJS 1.5.4, GitHub Pages + GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-17-snakopouille-design.md` (lire §2 « Plateforme et architecture » et §7 avant de commencer).

## Global Constraints

- Code (identifiants, fichiers) en anglais ; textes affichés et docs en français.
- Aucun framework UI : DOM natif + Canvas 2D.
- Dépendance runtime unique pour ce plan : `peerjs@1.5.4`. Pas d'autre lib.
- Build Vite avec `base: './'` (le site doit marcher sous `https://<user>.github.io/<repo>/` quel que soit le nom du repo).
- Préfixe de tous les identifiants PeerJS : `snakopouille-`.
- IP publique lue via `https://api.ipify.org?format=json` (IPv4 uniquement, volontairement : évite que deux tablettes d'une même box aient des IPv6 différentes).
- Interdit dans une boucle de rendu : `ctx.shadowBlur` (sauf dans le mode de comparaison explicite du banc).
- Le code de ce plan vit sous `src/spike/` et sera **supprimé ou ignoré** par les plans suivants ; seuls `roomId.ts`, `code.ts`, `stats.ts`, `candidate.ts` pourront être déplacés dans `src/net/` au plan 3.

## Review Focus

1. **Box qui renvoie une IP publique différente selon l'appareil ou qui change en cours de route** → la découverte ne trouve rien ; le code de secours doit alors marcher. Test : `code.test.ts` couvre la normalisation de la saisie ; protocole manuel (Task 6) étape « rejoindre par code ».
2. **ipify injoignable / bloqué** → la page ne doit pas planter : afficher « IP publique indisponible — utilisez le code » et proposer quand même héberger/rejoindre par code. Test : `roomId.test.ts::fetchPublicIp rejects on network error`.
3. **Slot déjà pris par une autre partie du même Wi-Fi** → l'hôte doit prendre le slot suivant (1→4) et échouer proprement si les 4 sont pris. Test : `slots.test.ts`.
4. **Connexion établie mais via relais / srflx au lieu de local** → le rapport doit l'afficher clairement (c'est un résultat, pas un crash). Test : `candidate.test.ts` (cas host, srflx, relay, absence de paire sélectionnée).
5. **Saisie de code en minuscules, avec espaces, ou avec caractères ambigus (0/O, 1/I)** → doit être normalisée ou refusée avec message. Test : `code.test.ts`.

---

## Fichiers

```
package.json, tsconfig.json, vite.config.ts, .gitignore
index.html                         # menu : liens vers les deux spikes
spike-network.html
spike-render.html
.github/workflows/pages.yml
src/spike/net/roomId.ts            # IP publique -> roomId -> peerId
src/spike/net/code.ts              # codes de secours 4 caractères
src/spike/net/slots.ts             # réservation de slot hôte (logique pure + adaptateur PeerJS)
src/spike/net/stats.ts             # résumé statistique (latence)
src/spike/net/candidate.ts         # type de connexion depuis getStats()
src/spike/net/protocol.ts          # types des messages du spike
src/spike/net/main.ts              # UI + câblage PeerJS de spike-network.html
src/spike/render/scene.ts          # génération de la scène de test
src/spike/render/main.ts           # banc FPS de spike-render.html
tests/spike/*.test.ts
docs/spikes/2026-10-17-resultats-spike.md   # rapport (Task 6)
```

---

### Task 1: Socle projet + déploiement GitHub Pages

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `index.html`, `spike-network.html`, `spike-render.html`, `.github/workflows/pages.yml`, `tests/spike/smoke.test.ts`

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `test` (`vitest run`), `preview`; pages HTML qui chargent respectivement `src/spike/net/main.ts` et `src/spike/render/main.ts` (fichiers vides avec `export {}` pour l'instant).

- [ ] **Step 1:** `git init`, branche `main`. `.gitignore` : `node_modules/`, `dist/`, `.superpowers/`, `.codegraph/`.
- [ ] **Step 2:** `npm init -y` puis `npm i peerjs@1.5.4` et `npm i -D vite@5.4.10 typescript@5.6.3 vitest@2.1.4`. `tsconfig.json` : `strict: true`, `target: ES2020`, `module: ESNext`, `moduleResolution: Bundler`, `lib: ["ES2020","DOM","DOM.Iterable"]`.
- [ ] **Step 3:** `vite.config.ts` : `base: './'`, `build.rollupOptions.input` = les 3 HTML. `test.environment: 'node'`.
- [ ] **Step 4:** `index.html` : titre « Snakopouille — spikes », deux gros liens tactiles vers les deux pages. Les 3 pages ont `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`.
- [ ] **Step 5:** Test fumée `tests/spike/smoke.test.ts` : `expect(1 + 1).toBe(2)`. Run `npm test` → PASS. Run `npm run build` → `dist/` contient les 3 HTML.
- [ ] **Step 6:** `.github/workflows/pages.yml` : sur push `main`, `actions/checkout@v4`, `actions/setup-node@v4` (node 20), `npm ci`, `npm test`, `npm run build`, `actions/upload-pages-artifact@v3` (path `dist`), puis job `deploy` avec `actions/deploy-pages@v4` (permissions `pages: write`, `id-token: write`).
- [ ] **Step 7:** Commit `chore: scaffold vite project and pages deploy`.
- [ ] **Step 8 (action humaine — DEMANDER à Thibault avant) :** créer le repo GitHub (proposer `gh repo create snakopouille --public --source . --push`, public requis pour Pages gratuit) et activer Pages en mode « GitHub Actions » (Settings → Pages → Source). Vérifier que `https://<user>.github.io/snakopouille/` affiche le menu.

### Task 2: Identifiants de salon, slots et codes de secours

**Files:**
- Create: `src/spike/net/roomId.ts`, `src/spike/net/code.ts`, `src/spike/net/slots.ts`
- Test: `tests/spike/roomId.test.ts`, `tests/spike/code.test.ts`, `tests/spike/slots.test.ts`

**Interfaces:**
- Produces:
  - `fetchPublicIp(fetchFn?: typeof fetch): Promise<string>` — GET ipify, retourne `json.ip` ; rejette si réseau KO, statut ≠ 200 ou `ip` absent.
  - `roomIdFromIp(ip: string): Promise<string>` — 8 premiers caractères hex minuscules de SHA-256(`"snakopouille:" + ip`) via `crypto.subtle`.
  - `SLOTS: readonly number[] = [1, 2, 3, 4]`
  - `peerIdForSlot(roomId: string, slot: number): string` → `` `snakopouille-${roomId}-${slot}` ``
  - `CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'` (sans 0, O, 1, I, L)
  - `generateCode(rng?: () => number): string` — 4 caractères de `CODE_ALPHABET`.
  - `normalizeCode(input: string): string | null` — retire tous les espaces, met en majuscules, renvoie `null` si la longueur ≠ 4 ou si un caractère n'est pas dans `CODE_ALPHABET` (aucune substitution automatique).
  - `peerIdForCode(code: string): string` → `` `snakopouille-code-${code}` ``
  - `claimSlot(tryOpen: (peerId: string) => Promise<'ok' | 'taken'>, roomId: string): Promise<{ slot: number; peerId: string } | null>` — essaie les slots dans l'ordre, renvoie le premier `'ok'`, `null` si les 4 sont `'taken'`. Toute autre erreur de `tryOpen` est propagée.

- [ ] **Step 1: Tests**
```ts
// roomId.test.ts
test('roomIdFromIp is stable, 8 lowercase hex', async () => {
  const a = await roomIdFromIp('81.2.3.4');
  expect(a).toMatch(/^[0-9a-f]{8}$/);
  expect(await roomIdFromIp('81.2.3.4')).toBe(a);
  expect(await roomIdFromIp('81.2.3.5')).not.toBe(a);
});
test('peerIdForSlot format', () => expect(peerIdForSlot('ab12cd34', 2)).toBe('snakopouille-ab12cd34-2'));
test('fetchPublicIp returns ip', async () => {
  const f = async () => new Response(JSON.stringify({ ip: '81.2.3.4' }), { status: 200 });
  expect(await fetchPublicIp(f as typeof fetch)).toBe('81.2.3.4');
});
test('fetchPublicIp rejects on network error', async () => {
  const f = async () => { throw new TypeError('Failed to fetch'); };
  await expect(fetchPublicIp(f as typeof fetch)).rejects.toThrow();
});
test('fetchPublicIp rejects on missing ip', async () => {
  const f = async () => new Response('{}', { status: 200 });
  await expect(fetchPublicIp(f as typeof fetch)).rejects.toThrow();
});
// code.test.ts
test('generateCode uses alphabet, length 4', () => {
  for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/);
});
test('normalizeCode', () => {
  expect(normalizeCode(' k7qz ')).toBe('K7QZ');
  expect(normalizeCode('k7 qz')).toBe('K7QZ');
  expect(normalizeCode('K7Q')).toBeNull();
  expect(normalizeCode('K7Q0')).toBeNull(); // 0 hors alphabet
  expect(normalizeCode('K7QI')).toBeNull();
});
test('peerIdForCode', () => expect(peerIdForCode('K7QZ')).toBe('snakopouille-code-K7QZ'));
// slots.test.ts
test('claimSlot takes first free slot', async () => {
  const taken = new Set(['snakopouille-r-1', 'snakopouille-r-2']);
  const r = await claimSlot(async id => (taken.has(id) ? 'taken' : 'ok'), 'r');
  expect(r).toEqual({ slot: 3, peerId: 'snakopouille-r-3' });
});
test('claimSlot returns null when all taken', async () => {
  expect(await claimSlot(async () => 'taken', 'r')).toBeNull();
});
```
- [ ] **Step 2:** `npm test` → FAIL (modules absents).
- [ ] **Step 3:** Implémenter les trois fichiers selon les signatures.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(spike): room ids, slots and fallback codes`.

### Task 3: Statistiques de latence et type de connexion

**Files:**
- Create: `src/spike/net/stats.ts`, `src/spike/net/candidate.ts`
- Test: `tests/spike/stats.test.ts`, `tests/spike/candidate.test.ts`

**Interfaces:**
- Produces:
  - `type Summary = { count: number; min: number; avg: number; p50: number; p95: number; max: number }`
  - `summarize(samples: number[]): Summary` — percentiles par rang le plus proche (`sorted[ceil(p*n)-1]`) ; tableau vide → tous les champs à 0.
  - `type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown'`
  - `selectedCandidateType(stats: Iterable<any>): CandidateType` — pure, prend les valeurs d'un `RTCStatsReport`. Algorithme : trouver la paire via `transport.selectedCandidatePairId` ; sinon la `candidate-pair` avec `state === 'succeeded' && nominated` ; puis la `local-candidate` d'id `localCandidateId` et renvoyer son `candidateType`. Rien trouvé → `'unknown'`. **Interprétation pour le rapport : `host` = direct local ✅, `prflx`/`srflx` = direct via adresse réfléchie (OK si RTT bas), `relay` = relais.**
  - `readCandidateType(pc: RTCPeerConnection): Promise<CandidateType>` — `selectedCandidateType((await pc.getStats()).values())`.

- [ ] **Step 1: Tests**
```ts
test('summarize', () => {
  expect(summarize([5, 1, 3, 2, 4])).toEqual({ count: 5, min: 1, avg: 3, p50: 3, p95: 5, max: 5 });
  expect(summarize([])).toEqual({ count: 0, min: 0, avg: 0, p50: 0, p95: 0, max: 0 });
});
const report = (localType: string, viaTransport: boolean) => [
  ...(viaTransport ? [{ type: 'transport', selectedCandidatePairId: 'P1' }] : []),
  { type: 'candidate-pair', id: 'P0', state: 'failed', nominated: false, localCandidateId: 'L0' },
  { type: 'candidate-pair', id: 'P1', state: 'succeeded', nominated: true, localCandidateId: 'L1' },
  { type: 'local-candidate', id: 'L0', candidateType: 'relay' },
  { type: 'local-candidate', id: 'L1', candidateType: localType },
];
test('via transport', () => expect(selectedCandidateType(report('host', true))).toBe('host'));
test('via nominated pair', () => expect(selectedCandidateType(report('srflx', false))).toBe('srflx'));
test('relay', () => expect(selectedCandidateType(report('relay', true))).toBe('relay'));
test('nothing selected', () => expect(selectedCandidateType([{ type: 'local-candidate', id: 'L', candidateType: 'host' }])).toBe('unknown'));
```
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implémenter. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(spike): latency summary and candidate type`.

### Task 4: Page spike réseau (hôte / découverte / code / mesures)

**Files:**
- Create: `src/spike/net/protocol.ts`, `src/spike/net/main.ts`; Modify: `spike-network.html`

**Interfaces:**
- Consumes: tout Task 2 et Task 3.
- Produces (`protocol.ts`) :
```ts
export type Msg =
  | { t: 'hello'; name: string; role: 'host' | 'guest' }
  | { t: 'ping'; seq: number; ts: number }          // ts = performance.now() de l'émetteur
  | { t: 'pong'; seq: number; ts: number }          // renvoie le ts reçu tel quel
  | { t: 'heads'; seq: number; ts: number; data: number[] }; // 8 serpents × [x, y, angle, boost] = 32 nombres
```

Comportement à implémenter (aucun test auto : validé en Task 6) :

- [ ] **Step 1: UI** (gros boutons tactiles, texte ≥ 18 px, fond sombre) : champ pseudo, ligne d'état « IP publique : … / salon : … », boutons **Héberger**, **Chercher des parties**, champ code + **Rejoindre par code**, zone log (dernières 30 lignes), zone **Résultats**, bouton **Copier les résultats** (`navigator.clipboard.writeText`, repli : `<textarea>` sélectionné).
- [ ] **Step 2: Au chargement** : `fetchPublicIp()` puis `roomIdFromIp()`. En cas d'échec : afficher « IP publique indisponible — utilisez le code » ; « Chercher » désactivé, le reste actif.
- [ ] **Step 3: Héberger** : config PeerJS commune `{ debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } }` (serveur PeerJS cloud par défaut). `claimSlot` avec un `tryOpen` qui crée `new Peer(id, cfg)` et résout `'ok'` sur `open`, `'taken'` sur l'erreur `type === 'unavailable-id'` (puis `destroy()`), rejette sur toute autre erreur. En parallèle, créer un **second** `Peer` sous `peerIdForCode(generateCode())` (regénérer en cas de `unavailable-id`). Afficher « Slot N — code XXXX ». Sur `connection` : si `conn.metadata?.probe` → envoyer `hello` puis fermer après 500 ms ; sinon envoyer `hello`, lister l'invité, répondre `pong` à chaque `ping`, et démarrer l'envoi de `heads` à 20 Hz (positions fictives animées).
- [ ] **Step 4: Chercher** : `new Peer(cfg)` (id aléatoire) ; pour chaque slot, `peer.connect(peerIdForSlot(room, s), { metadata: { probe: true }, serialization: 'json' })` en parallèle avec un délai max de 4000 ms ; collecter les `hello` reçus → liste « Partie de <name> (slot N) — Rejoindre ». Ignorer les erreurs `peer-unavailable`.
- [ ] **Step 5: Rejoindre** (par slot ou par code via `normalizeCode`, message « Code invalide » si `null`) : ouvrir **deux** connexions vers l'hôte : `reliable` (`{ reliable: true, serialization: 'json' }`) et `fast` (`{ reliable: false, serialization: 'json' }`), chacune avec `metadata: { channel: 'reliable' | 'fast' }`. Mesurer le temps de connexion (clic → `open` des deux).
- [ ] **Step 6: Mesures (côté invité, automatiques après connexion)** : pendant 30 s sur `reliable` puis 30 s sur `fast`, envoyer `ping` à 20 Hz ; RTT = `performance.now() - pong.ts` ; pings sans réponse après 1000 ms = perdus. En parallèle, sur `fast`, mesurer l'écart entre deux `heads` reçus (gigue). Lire `readCandidateType(conn.peerConnection)` après `open`.
- [ ] **Step 7: Résultats** (texte copiable, une ligne par info) : date, user-agent, IP publique (masquée sauf 2 derniers octets) + salon, mode (slot/code), temps de connexion, type de candidat, RTT reliable (Summary), RTT fast (Summary), perte fast (%), gigue heads (Summary), erreurs rencontrées.
- [ ] **Step 8:** `npm run dev` puis test sur desktop avec deux onglets (Héberger / Chercher / Rejoindre / code) → résultats affichés, aucune erreur console. `npm test && npm run build` PASS.
- [ ] **Step 9:** Commit `feat(spike): network spike page`, push → déploiement Pages vert.

### Task 5: Page banc de rendu néon

**Files:**
- Create: `src/spike/render/scene.ts`, `src/spike/render/main.ts`; Modify: `spike-render.html`
- Test: `tests/spike/scene.test.ts`

**Interfaces:**
- Produces:
  - `type BenchSnake = { color: string; width: number; points: Float32Array }` (x, y alternés, coordonnées monde)
  - `buildScene(opts: { snakes: number; megaSamples: number; food: number; seed: number }): { snakes: BenchSnake[]; food: Float32Array /* x,y,r */ }` — monde 1600 × 1000 ; serpent 0 = « mega » de `megaSamples` échantillons espacés de 4 unités, épaisseur 120, qui serpente dans toute la map (sinusoïdes, rebond aux bords) ; les autres : 40 à 400 échantillons, épaisseur 4 à 30 ; tout point reste dans `[0,1600]×[0,1000]`. Déterministe pour un `seed` donné.

- [ ] **Step 1: Tests**
```ts
test('buildScene shape and bounds', () => {
  const s = buildScene({ snakes: 8, megaSamples: 3000, food: 500, seed: 1 });
  expect(s.snakes).toHaveLength(8);
  expect(s.snakes[0].points.length).toBe(6000);
  expect(s.food.length).toBe(1500);
  for (const sn of s.snakes) for (let i = 0; i < sn.points.length; i += 2) {
    expect(sn.points[i]).toBeGreaterThanOrEqual(0); expect(sn.points[i]).toBeLessThanOrEqual(1600);
    expect(sn.points[i + 1]).toBeGreaterThanOrEqual(0); expect(sn.points[i + 1]).toBeLessThanOrEqual(1000);
  }
});
test('buildScene deterministic', () => {
  const a = buildScene({ snakes: 3, megaSamples: 100, food: 10, seed: 7 });
  const b = buildScene({ snakes: 3, megaSamples: 100, food: 10, seed: 7 });
  expect(Array.from(a.snakes[1].points)).toEqual(Array.from(b.snakes[1].points));
});
```
- [ ] **Step 2:** FAIL → **Step 3:** implémenter `buildScene` → **Step 4:** PASS.
- [ ] **Step 5: `main.ts`** : canvas plein écran au ratio 16:10 avec bandes, `devicePixelRatio` plafonné à 1,5 (option « DPR 1 » pour comparer). Chaque frame : fond `#0b0e1f` ; décaler légèrement chaque serpent (le corps « avance » : rotation des échantillons) pour simuler le mouvement ; dessiner selon le mode choisi :
  - `plain` : un `stroke` par serpent (`lineCap/lineJoin = 'round'`).
  - `glow` : par serpent, un stroke large (`width × 1.8`, alpha 0.25) puis le stroke cœur — **mode cible du jeu**.
  - `shadow` : stroke avec `shadowBlur = 12` (comparaison seulement).
  - Nourriture : `drawImage` d'un sprite de halo pré-rendu sur canvas hors écran (un par couleur), jamais `arc` + `shadowBlur`.
  Boutons : mode (plain/glow/shadow), mega (600 / 3000 / 8000 échantillons), DPR (1 / 1,5), **Lancer 10 s**. Mesure sur 10 s : FPS moyen, 1 % low (via `summarize` des durées de frame), affichés + bouton **Copier**.
- [ ] **Step 6:** Vérifier sur desktop : les 3 modes s'affichent, mesures cohérentes. `npm test && npm run build` PASS.
- [ ] **Step 7:** Commit `feat(spike): neon render bench`, push.

### Task 6: Protocole sur les tablettes + rapport (avec Thibault)

**Files:**
- Create: `docs/spikes/2026-10-17-resultats-spike.md`

- [ ] **Step 1:** Fournir à Thibault l'URL Pages et ce protocole (à faire avec ≥ 2 K10, + 1 smartphone si dispo, tous sur le même Wi-Fi, Chrome à jour) :
  1. K10-A : Héberger. K10-B : Chercher → la partie de A apparaît ? → Rejoindre → attendre 60 s → Copier les résultats.
  2. Recommencer avec B qui rejoint **par code**.
  3. Lancer un second hôte sur une 3ᵉ tablette/le téléphone → il doit prendre le slot 2 et être visible.
  4. Sur K10 : page rendu, lancer `glow` avec mega 600, 3000, 8000 (DPR 1,5), puis `glow` 8000 en DPR 1, puis `shadow` 3000. Copier les résultats.
- [ ] **Step 2:** Remplir le rapport avec les résultats bruts collés + la grille de verdict :

| Critère | Seuil « OK » |
|---|---|
| Découverte automatique | la partie apparaît en < 5 s |
| Type de connexion | `host`, `prflx` ou `srflx` (pas `relay`) |
| RTT `fast` p95 | < 60 ms |
| Perte `fast` | < 3 % |
| Gigue `heads` p95 | < 80 ms |
| Rendu `glow` mega 3000, DPR 1,5 | ≥ 50 FPS moyen, 1 % low ≥ 30 |

- [ ] **Step 3:** Conclure dans le rapport : (a) réseau direct validé ou repli relais nécessaire (spec §2, repli validé par Thibault) ; (b) DPR et nombre max d'échantillons de corps à retenir pour le jeu (ex. : si 8000 rame, imposer un espacement d'échantillons qui grandit avec l'épaisseur). Ajouter les décisions prises dans `decisions.md` (section « Décisions prises »).
- [ ] **Step 4:** Commit `docs: spike results`.
