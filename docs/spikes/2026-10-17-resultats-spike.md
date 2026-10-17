# Résultats du spike réseau + rendu (plan 1, Task 6)

Date : 2026-10-18 · Déploiement : https://thkeroua.github.io/snakopouille/

## Essais réalisés

| # | Essai | Statut |
|---|---|---|
| 1 | K10 héberge, PC (Opera/Chrome 149, Windows) rejoint par découverte auto | **fait** |
| 2 | Rejoindre par code | à faire (non bloquant) |
| 3 | Second hôte → slot 2 | à faire (non bloquant) |
| 1bis | K10 ↔ K10 | à faire (non bloquant) |
| 4 | Banc de rendu K10 | **reporté** par Thibault (« tests FPS plus tard ») |
| 5 | Jeu solo K10 `?dummies=7&fps=1&startPoints=20000` | **reporté** |

Retour qualitatif de Thibault : « en solo ça marche très bien » ; la partie de la K10 est apparue tout de suite côté PC.

## Résultats bruts — essai 1

```
Mode : slot
Temps de connexion : 357 ms
Paire ICE reliable (local→distant) : host→host udp
Paire ICE fast (local→distant) : host→host udp
Canal fast : canal brut ordered=false maxRetransmits=0
RTT reliable : n=600 min=4.9 moy=8.9 p50=8.2 p95=15.1 max=34.9 ms
Perte reliable (pong > 1000 ms compté perdu) : 0.0 %
RTT fast : n=600 min=4.1 moy=6.9 p50=6.2 p95=10.1 max=81.7 ms
Perte fast (pong > 1000 ms compté perdu) : 0.0 %
Écart entre heads reçus (nominal 50 ms, 60 s) : n=659 min=3.4 moy=94.0 p50=50.1 p95=66.2 max=1010.4 ms
Erreurs : aucune
```

## Verdict

| Critère | Seuil | Mesuré | Verdict |
|---|---|---|---|
| Découverte automatique | < 5 s | « tout de suite » | OK |
| Paire ICE | pas de `relay` | `host→host udp` (local direct) | OK |
| RTT `fast` p95 | < 60 ms | 10,1 ms | OK |
| Perte `fast` | < 3 % | 0 % | OK |
| Gigue `heads` p95 | < 80 ms | 66,2 ms | OK, avec réserve |
| Rendu glow mega 3000 DPR 1,5 | ≥ 50 FPS | non mesuré | reporté |

**Réserve sur les heads** : 659 écarts en 60 s au lieu de ~1200, moyenne 94 ms, max 1010 ms. La médiane est
pile 50 ms, donc l'envoi est régulier la plupart du temps, mais il y a des périodes où l'hôte n'émet plus
qu'à ~1 Hz. C'est la signature du bridage des timers par Chrome Android quand la page n'est plus au premier
plan ou que l'écran se met en veille (l'hôte ne jouait pas pendant le test, il regardait juste la page).

## Conclusions

- **(a) Réseau** : la connexion directe en local est validée. Pas besoin du relais internet pour l'instant.
  Le repli reste prévu si une autre box isole les appareils.
- **(a bis)** Pour le plan 3 : l'hôte et les clients demandent un **Wake Lock écran** pendant le salon et la
  partie, et la boucle réseau de l'hôte ne dépend pas que de `setInterval` (on émet depuis la boucle de jeu).
  Un joueur dont la page passe en arrière-plan est traité comme « figé » (son serpent reste immobile
  chez les autres, l'interpolation tient la dernière position), pas comme déconnecté, tant qu'il donne
  signe de vie (battement réseau d'1 s, délai de coupure 10 s).
- **(b) Rendu** : pas encore de mesure K10. On garde `maxDpr = 1.5` et `glowMode = 'stroke'` ; à revoir
  quand le banc sera fait.
