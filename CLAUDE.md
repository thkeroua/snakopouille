# Snakopouille

Jeu navigateur 2D façon slither.io, multijoueur **en réseau local** (WebRTC direct entre tablettes), pour jouer en famille. Une tablette héberge, les autres rejoignent. La map entière est visible, figée, identique pour tous. Les parties durent 3 min.

## À lire avant toute ligne de code

1. `docs/superpowers/specs/2026-10-17-snakopouille-design.md` : **le design validé**, la source de vérité des règles et de l'architecture.
2. `decisions.md` : les décisions prises après le design et les idées reportées (bots, bonus/malus). En cas de contradiction, `decisions.md` l'emporte sur le design.
3. Le plan en cours dans `docs/superpowers/plans/` (voir la feuille de route ci-dessous).
4. `docs/spikes/` : les résultats mesurés sur les tablettes (ils contraignent le rendu et le réseau).

## Feuille de route

| Plan | Contenu | État |
|---|---|---|
| 1 | Spike réseau + banc de rendu sur Lenovo K10 (`plans/2026-10-17-plan-1-spike-reseau-k10.md`) | fait : réseau direct validé (`docs/spikes/2026-10-17-resultats-spike.md`) ; reste : banc de rendu K10 (reporté par Thibault) |
| 2 | Cœur du jeu en solo local : config gameplay, simulation, rendu néon, HUD, pilotage doigt/souris (`plans/2026-10-17-plan-2-coeur-du-jeu-solo.md`) | fait et relu ; reste : validation FPS sur K10 (`?solo=1&dummies=7&fps=1&startPoints=20000`, reportée) |
| 3 | Multijoueur : accueil (pseudo/couleur), découverte/code, salon, synchro (hôte = nourriture/points/têtes-à-tête/chrono, clients = leur serpent), fin de partie, rejouer (`plans/2026-10-18-plan-3-multijoueur.md`) | fait et relu ; reste : partie à plusieurs tablettes avec Thibault (Task 10 step 2) |
| plus tard | Bots, bonus/malus (voir `decisions.md`) | — |

Chaque plan s'écrit avec le skill `superpowers:writing-plans` à partir du design. **Mode d'exécution choisi par Thibault : « d'une traite »**, avec `superpowers:executing-plans` : un seul agent exécute toutes les tâches, puis une relecture complète à la fin. On respecte les étapes « action humaine / avec Thibault » des plans : on s'arrête et on lui demande.

## Règles du projet

- **Cible matérielle : Lenovo Tab K10 (Chrome Android, vieux).** Toute décision de rendu ou de calcul se juge sur elle. Aucun `shadowBlur` dans la boucle de rendu. Les halos se font en sprites pré-rendus ou en double trait.
- Pas d'O(n²) sur les corps de serpents : grille spatiale pour les collisions et la nourriture. Les serpents peuvent dépasser 20 000 points.
- **Tous les réglages de gameplay** vivent dans un seul fichier de config (spec §6). On n'écrit pas de nombre magique de gameplay dans le code.
- Stack : TypeScript strict + Vite + Canvas 2D + PeerJS. Pas de framework UI. Ajouter une dépendance doit être justifié dans `decisions.md`.
- Code et identifiants en anglais. Textes affichés, docs et messages de commit en français ou en anglais (au choix, mais cohérent dans un même fichier).
- Build `base: './'`, déployé sur GitHub Pages par GitHub Actions (push sur `main`).
- TDD pour la logique pure (simulation, règles, protocole). Le rendu et le réseau réel se valident à la main sur les tablettes.

## Commandes

- `npm run dev` : serveur local (WebRTC fonctionne sur `localhost`, mais les tablettes ont besoin du déploiement HTTPS)
- `npm test` : Vitest
- `npm run build` : build de production dans `dist/`
- URL : accueil par défaut ; `?solo=1` lance directement l'entraînement (avec `dummies`, `fps`, `startPoints`, `duration`, `seed`) ; `?duration=N` raccourcit aussi les parties hébergées.

## Architecture (plan 3)

- `src/game/` : simulation pure (solo = `Match`). `src/net/hostSession.ts` (logique hôte) et `src/net/clientSession.ts` (logique joueur) ne parlent qu'à des `Channel` ; l'hôte joue via un canal mémoire (`connectLocal`). `src/net/peerNet.ts` est le seul fichier qui touche PeerJS/WebRTC.
- Rendu et HUD lisent un `GameView` (`src/game/view.ts`), implémenté par `Match` et `ClientSession`.
