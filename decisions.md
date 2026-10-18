# Décisions & idées pour plus tard

## Reporté (après la v1)

- **Bots** : des serpents pilotés par l'ordinateur, en plus des joueurs réseau local. Ils seront calculés par l'hôte.
- **Malus attrapables** sur la map (à définir ; les bonus sont faits, voir 2026-10-18).

## Décisions prises

Voir `docs/superpowers/specs/2026-10-17-snakopouille-design.md`. Ajouts depuis :

- **2026-10-17 — Ordre de résolution des morts (plan 2).** Les collisions tête à tête passent **avant**
  les collisions tête contre corps. Le contact entre deux têtes est « balayé » sur le pas (distance minimale
  pendant le déplacement), et le côté « avant » se juge sur les positions **d'avant** le pas. Sans ça, deux
  petits serpents en boost se croisent en un seul pas et leur face-à-face est compté à tort comme deux morts
  contre le corps, avec un point pour chacun.
- **2026-10-18 — Frontière tête contre corps / tête à tête (plan 3, remplace la « requalification » du
  2026-10-17).** Le client détecte sa mort tête contre corps et l'annonce (`died`, avec le tueur), mais il
  ignore les échantillons situés dans le **cou** de l'autre : abscisse depuis sa tête < demi-épaisseur de
  l'autre + rayon de tête du client + `neckExtra` (`2 × speed × boostMultiplier × bonus.speed.multiplier / net.sendHz` = 48 depuis les bonus). Le cou
  relève uniquement de l'hôte (`headClashes`/`resolveClash` sur les têtes qu'il reçoit). Pas de
  requalification ni de « résurrection » d'un client mort à tort. Coût : un face-à-face que l'hôte rate à
  cause de la latence finit en mort contre le corps un peu plus loin.
- **2026-10-17 — Rendu.** `src/config/render.ts` a `glowMode` (`stroke` double trait / `half` halo en
  demi-résolution / `none`) et `maxDpr`. Les valeurs définitives seront choisies d'après le banc K10.
- **2026-10-18 — Spike réseau (rapport `docs/spikes/2026-10-17-resultats-spike.md`).** Connexion directe
  locale validée (`host→host`, RTT p95 10 ms, 0 % de perte) : pas de relais pour la v1. L'émission de l'hôte
  est bridée à ~1 Hz quand sa page n'est plus active : Wake Lock écran pendant salon et partie, émission
  réseau cadencée par la boucle de jeu. Banc de rendu K10 reporté : `maxDpr`/`glowMode` restent par défaut.
- **2026-10-18 — Synchro (plan 3).** Couleur de la nourriture = `palette[id % palette.length]` (pas
  transmise). Les serpents des autres sont interpolés sur l'horloge de l'émetteur (`offset = min(reçuÀ − ts)`,
  retard `net.interpDelayMs` = 100 ms) ; après le dernier échantillon on tient la position (pas
  d'extrapolation). Chaque réapparition incrémente la « vie » du serpent : l'hôte ignore `me`/`eat`/`died`
  d'une vie passée. Battement `beat` toutes les `net.beatIntervalS` (setInterval) dans les deux sens ; sans
  aucun message pendant `net.peerTimeoutS` = 10 s, le pair est considéré parti.
- **2026-10-18 — Retours de test.** Virage `turnRateRad` 4 → 6 rad/s. Aimant : la bouche porte à
  `headRadius + snake.magnetRange` (12) pour manger, chez l'hôte comme chez le client (la nourriture ne se
  déplace pas, elle est juste mangée de plus loin). **Super points** : l'hôte en pose un toutes les 5 à 20 s
  (tirage au hasard), 3 au plus sur la map, hors plafond de nourriture naturelle ; 100 (70 %) ou 200 (30 %),
  et en fièvre 100/200/500 (50/40/10 %) **sans** le multiplicateur de fièvre. Drapeau `isSuper` transmis
  (5ᵉ champ de `FoodWire`, `PROTOCOL_VERSION` 2) ; rendu cœur blanc + anneau doré qui pulse.
  Accélérateur sur iPhone : gestes iOS bloqués à la main (`touchstart`/`touchmove`/`gesturestart`) et le
  bouton suit aussi les `touch*`, car iOS annule les pointeurs quand un second doigt lance un geste système.
- **2026-10-18 — Bonus à ramasser.** L'hôte pose une icône toutes les 6 à 14 s (2 au plus sur la map, genres
  équiprobables), et détecte lui-même les prises sur les têtes qu'il connaît. Il diffuse `pickup` (nouvelle
  icône) et `bonus` (pris : serpent, genre, secondes restantes, id de l'icône) ; chaque appareil décompte
  ensuite les minuteurs (`SnakeState.bonus`) tout seul. Reprendre un bonus actif le remet à sa durée pleine ;
  des bonus différents se cumulent. Mort ou réapparition : tout s'efface. `PROTOCOL_VERSION` 3.
  - **Vitesse** (4 s) : ×2, cumulable avec l'accélérateur (×4).
  - **Fantôme** (7 s) : sa tête ignore les corps et son corps (pics compris) ne tue personne ; les têtes à tête
    restent jugées normalement. Une mort annoncée qui implique un fantôme est ignorée par l'hôte. Corps à 30 %.
  - **Obèse** (10 s) : épaisseur ×3 (tête, corps, collisions, portée de bouche), longueur inchangée.
  - **Pics** (5 s) : environ un échantillon de corps sur 3 porte une paire de pics, choisi par hachage de sa
    position (les échantillons sont fixes dans le monde, donc les pics ne glissent pas). Longueur au hasard
    entre 0,6 et 1,8 demi-épaisseur. Ils entrent dans la grille des corps (≤ 6 points par pic).
  Minuteurs du joueur en bas au centre du HUD (icône, secondes, barre qui se vide).
