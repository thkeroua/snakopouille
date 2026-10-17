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
| 1 | Spike réseau + banc de rendu sur Lenovo K10 (`plans/2026-10-17-plan-1-spike-reseau-k10.md`) | à exécuter |
| 2 | Cœur du jeu en solo local : config gameplay, simulation, rendu néon, HUD, pilotage doigt/souris (`plans/2026-10-17-plan-2-coeur-du-jeu-solo.md`) | à exécuter après le plan 1 |
| 3 | Multijoueur : accueil (pseudo/couleur), découverte/code, salon, synchro (hôte = nourriture/points/têtes-à-tête/chrono, clients = leur serpent), fin de partie, rejouer | à écrire après le plan 2 (dépend du rapport du spike) |
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
