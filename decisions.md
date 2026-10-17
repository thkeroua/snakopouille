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
- **2026-10-17 — Frontière client/hôte pour le plan 3 (à appliquer).** Le client détecte sa mort tête
  contre corps et l'envoie avec `(tueur, indice de l'échantillon touché)`. **L'hôte a le dernier mot.**
  Si l'échantillon touché est dans le « cou » du tueur (abscisse depuis sa tête < demi-épaisseur du tueur
  + rayon de tête de la victime + 2 × distance max parcourue en un pas), l'hôte requalifie la collision en
  tête à tête et applique les règles avant/côté (`headClashes`/`resolveClash`) avec les deux têtes qu'il
  connaît. Ça préserve la règle « face-à-face : personne ne marque » malgré la latence. `hostRules` garde
  la détection tête contre tête ; la détection tête contre corps (`headHitsBody`) bascule côté client.
- **2026-10-17 — Rendu.** `src/config/render.ts` a `glowMode` (`stroke` double trait / `half` halo en
  demi-résolution / `none`) et `maxDpr`. Les valeurs définitives seront choisies d'après le banc K10.
- **2026-10-18 — Spike réseau (rapport `docs/spikes/2026-10-17-resultats-spike.md`).** Connexion directe
  locale validée (`host→host`, RTT p95 10 ms, 0 % de perte) : pas de relais pour la v1. L'émission de l'hôte
  est bridée à ~1 Hz quand sa page n'est plus active : Wake Lock écran pendant salon et partie, émission
  réseau cadencée par la boucle de jeu. Banc de rendu K10 reporté : `maxDpr`/`glowMode` restent par défaut.
