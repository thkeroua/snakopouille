# Décisions & idées pour plus tard

## Reporté (après la v1)

- **Bots** : des serpents pilotés par l'ordinateur, en plus des joueurs réseau local. Ils seront calculés par l'hôte.
- **Bonus / malus attrapables** sur la map (à définir).

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
  l'autre + rayon de tête du client + `neckExtra` (`2 × speed × boostMultiplier / net.sendHz` = 24). Le cou
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
