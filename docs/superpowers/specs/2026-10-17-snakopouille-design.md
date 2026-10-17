# Snakopouille — Design

Date : 2026-10-17 · Statut : en attente de validation

Légende : ce qui n'est pas marqué vient de Thibault. **[choix Claude]** = décision prise par Claude, à vérifier. **[hypothèse]** = supposition non confirmée.

## 1. Intention

Un jeu type slither.io / snake.io pour jouer **en famille, sur le même Wi-Fi**, chacun sur sa tablette. Ce n'est pas un jeu compétitif en ligne : pas d'anti-triche, pas de comptes, pas de serveur à maintenir. Le fun vient du chaos à plusieurs sur une map unique et figée, où un serpent peut devenir gigantesque (~20 000 points, sans limite) et transformer la map en labyrinthe.

**Différence majeure avec slither.io** : pas de caméra qui suit le serpent. La map entière est visible en permanence, figée, plein écran, identique pour tous les joueurs.

### Objectifs
- Fluide sur **Lenovo Tab K10** (Android, vieux, Chrome). C'est la cible principale et le juge de paix des performances.
- Jouable aussi sur smartphone (petit, accepté) et sur navigateur desktop.
- Zéro latence ressentie sur son propre serpent.
- Rejoindre une partie sans friction : les parties du même Wi-Fi apparaissent toutes seules.
- Tous les réglages de gameplay ajustables dans un seul fichier.

### Non-objectifs (v1)
- Anti-triche, autorité serveur stricte.
- Jeu par internet entre maisons différentes.
- Migration d'hôte (si l'hôte part, la partie s'arrête).
- Bots, bonus/malus (prévus plus tard, voir `decisions.md`).
- Comptes, persistance des scores entre sessions.

### Anti-objectifs (échec même si « ça marche »)
- Ça rame sur la K10.
- Son propre serpent répond avec du retard.
- Les joueurs ne voient pas la même chose (même map, mêmes positions).
- Connexion pénible (configuration réseau, IP à taper, QR codes à scanner).

## 2. Plateforme et architecture

- **Jeu navigateur**, hébergé sur **GitHub Pages**. Peut être ajouté à l'écran d'accueil (PWA légère) **[choix Claude]**.
- **Rendu Canvas 2D**, pas de moteur lourd. TypeScript + Vite, sans framework UI lourd pour le jeu **[choix Claude]**.
- **Map à proportions fixes 16:10** (celles de la K10), mise à l'échelle de l'écran, avec des bandes noires si le ratio diffère **[choix Claude]**. On joue **en paysage uniquement** : en portrait, un message invite à tourner l'appareil **[choix Claude]**. Coordonnées du monde en unités abstraites, indépendantes de la résolution (par ex. 1600 × 1000) **[choix Claude]**.
- **Topologie** : une tablette crée la partie et devient l'**hôte**. Les autres s'y connectent en **WebRTC (DataChannel) direct sur le Wi-Fi local**. Pas de serveur de jeu.
- **Répartition de l'autorité** (petit jeu familial, la triche n'est pas un sujet) :
  - **Chaque client fait autorité sur son propre serpent** : il le déplace localement à chaque frame (réactivité maximale) et **détecte sa propre mort** (sa tête touche un autre corps ou une autre tête). On meurt exactement quand on le voit.
  - **L'hôte fait autorité sur le reste** : nourriture (apparition, consommation, traînées), chrono, fever, scores, classements, couronne, réapparitions, début et fin de partie.
  - **Consommation de nourriture [choix Claude]** : le client détecte qu'il passe sur un point et envoie une demande. L'hôte valide la première demande reçue, retire le point et crédite le joueur. Le client grandit à la confirmation (latence LAN négligeable).
  - **Les points de nourriture appartiennent à l'hôte [choix Claude]** : l'hôte tient le total de chaque serpent (nourriture mangée, pertes d'accélérateur que le client lui signale, mort) et le diffuse à tous. La longueur et l'épaisseur affichées partout découlent de ce total, ce qui garantit les mêmes corps sur tous les écrans.
  - **Collisions tête contre tête arbitrées par l'hôte [choix Claude]** : un face-à-face ou un avant contre côté concerne deux serpents qui peuvent se voir légèrement différemment à cause de la latence. C'est donc l'hôte qui tranche, à partir des têtes qu'il reçoit. Les collisions tête contre corps restent détectées par la victime elle-même.
  - **Synchro des serpents [choix Claude]** : chaque client envoie sa position de tête et son état (boost) à ~20 Hz. L'hôte relaie aux autres. Le corps est **reconstruit localement** sur chaque appareil à partir de l'historique des positions de tête et de la longueur. On ne transmet jamais le corps entier, ce qui est indispensable pour des serpents très longs. Les serpents des autres sont interpolés.
  - L'hôte est aussi un joueur. Il fait tourner sa propre logique client plus la logique hôte.
- **Fin de partie si l'hôte quitte** : les autres voient « L'hôte a quitté la partie », puis le résumé si possible, sinon le retour au menu.

### Découverte et connexion
- Mise en relation via le **serveur public gratuit PeerJS** (signalisation seulement, quelques secondes). Internet est requis au moment de se connecter, pas pendant le jeu.
- **Détection automatique des parties du même Wi-Fi [choix Claude]** : chaque appareil récupère l'IP publique de la box via un service gratuit (ex. ipify) et en déduit un nom de salon (hash). L'hôte s'enregistre sur PeerJS sous un identifiant dérivé (`snakopouille-<hash>-<slot>`, quelques slots pour permettre plusieurs parties). Les autres appareils sondent ces identifiants et affichent « Partie de <pseudo> — Rejoindre ». Aucun compte, aucun serveur à nous.
- **Code en secours** : l'hôte affiche un code court (4 caractères) qu'on peut taper pour rejoindre si la détection échoue.
- **Risque accepté** : on dépend de deux services gratuits non contrôlés (ipify, PeerJS cloud). Si ça devient instable, on passera à un mini-annuaire maison (Cloudflare Worker). **À valider en premier par un spike réseau sur les vraies tablettes** **[choix Claude]**, en particulier la connexion WebRTC locale sur Chrome Android (candidats mDNS).
- **Repli validé par Thibault** : si la connexion directe échoue (box qui isole les appareils, blocage Chrome…), un **relais par internet pendant la partie est acceptable** (serveur TURN gratuit ou presque, ou relais via Cloudflare Worker). Le choix du relais est laissé au builder. Le direct local reste la voie par défaut.

## 3. Parcours joueur

1. **Accueil** : pseudo et couleur de serpent. **Une couleur par joueur, non partageable** : les couleurs prises sont grisées. Pseudo et couleur sont mémorisés sur l'appareil **[choix Claude]**.
2. **Créer** une partie ou **rejoindre** une partie détectée (ou par code).
3. **Salon d'attente** : liste des joueurs avec leur couleur. L'hôte lance la partie. **Max 8 joueurs, pas d'arrivée en cours de partie [choix Claude]**.
4. **Partie** : 3 minutes (voir §4).
5. **Résumé de fin** : classement par **score** (kills), points de nourriture finaux, et **[choix Claude]** nombre de morts et taille max atteinte. Égalité de score : départage au plus de points de nourriture **[choix Claude]**. L'hôte peut **relancer** avec les mêmes joueurs **[choix Claude]**.

Interface en français **[choix Claude]**.

## 4. Règles du jeu

### Partie
- Durée **3 minutes**. But : le meilleur **score**.
- **Score** : +1 quand un autre serpent meurt sur toi (voir collisions).
- **Points de nourriture** (« points ») : déterminent la taille. C'est une chose distincte du score.
- **Couronne** sur la tête du serpent qui a le plus de points de nourriture.
- **Fever** : pendant la dernière minute, la nourriture qui **apparaît** vaut **×5** (des 25, 50 et 250), à la même fréquence. Les points issus de morts ou d'accélération gardent leur valeur réelle **[hypothèse]**.

### Démarrage et réapparition
- Chaque serpent démarre à **10 points** (le minimum : le plus petit et le plus fin).
- Position de départ éloignée des autres **[choix Claude]** (même règle que la réapparition).
- **Mort** : le serpent libère tous ses points de nourriture **en traînée le long de son corps**. Il réapparaît **5 s** plus tard, à 10 points, à l'endroit de la map **le plus éloigné du serpent le plus proche** (on maximise la distance minimale à tout corps de serpent, par échantillonnage d'une grille de candidats **[choix Claude]**). Direction initiale : vers le centre de la map **[choix Claude]**.

### Pilotage
- **Pas de joystick**. Le joueur pose le doigt **sur la map, à l'endroit où il veut aller**. Le doigt peut glisser en continu et la tête vise sa position actuelle. La tête **tourne progressivement** vers la cible (vitesse angulaire maximale), elle ne pivote pas d'un coup.
- **Doigt levé** : le serpent continue tout droit.
- **Souris** : même comportement, bouton enfoncé et glissé **[choix Claude]**.
- **Bouton accélérateur** fixe dans un coin (pour l'autre main). Clavier : barre espace ou clic droit **[choix Claude]**. Sur desktop, pilotage souris plus accélérateur clavier.
- Multi-touch obligatoire (un doigt pilote, l'autre accélère).
- **Vitesse et maniabilité identiques pour tous, quelle que soit la taille.**

### Accélérateur
- Vitesse **×2** tant qu'il est maintenu.
- **Coût** : perte continue de points, plus forte en valeur absolue quand on est gros. Calibrage donné par Thibault : ~5 000 points perdus en 5 s pour un serpent de 20 000, et ~50 points en 5 s pour un serpent de 100. Fonction de départ : **perte/s ≈ 0,18 × points^0,87** (coefficient et exposant réglables).
  - Note : avec ce calibrage, en proportion, le petit perd plus vite que le gros. C'est le point de départ, l'équilibre se trouvera à l'essai.
- On ne descend **jamais sous 10 points**. À 10 points, l'accélérateur n'a pas d'effet **[hypothèse]**.
- Les points perdus sont **lâchés derrière la queue**, sous forme de nourriture.

### Taille
- **Épaisseur** : ×30 à 20 000 points par rapport au serpent de 10 points, valeur facilement réglable. Fonction de départ : `épaisseur = épaisseur_min × (points/10)^0,45` **[choix Claude]** (0,45 donne ×30 à 20 000).
- **Longueur** : **pas de limite**, elle continue au-delà de 20 000. Longueur cible = fonction réglable des points **[choix Claude : forme `L0 × (points/10)^k`, valeurs à régler à l'essai]**.
- **Croissance par la queue** : quand la longueur cible augmente, la queue **reste sur place** (là où se trouve le dernier morceau) pendant que la tête avance, jusqu'à atteindre la longueur visée. Rien n'apparaît ailleurs. En cas de perte (accélérateur), la queue raccourcit.
- Un serpent gigantesque qui recouvre une bonne partie de la map est **voulu** : c'est drôle.

### Collisions
- **Soi-même** : aucune collision, on se traverse librement.
- **Tête contre corps d'un autre** : celui dont la tête touche meurt. Le propriétaire du corps marque +1.
- **Avant de tête contre avant de tête** (face-à-face) : les deux meurent, personne ne marque.
- **Avant de tête contre côté de tête** : celui qui attaque avec l'avant meurt. Celui touché sur le côté marque +1.
- **« Avant » de la tête [choix Claude]** : un cône d'environ 90° (±45°) centré sur la direction de déplacement. Le reste de la tête est le « côté ». Angle réglable.
- **Bord de map** : on ne meurt pas. Le serpent est **bloqué et glisse** le long du bord.
- Tête contre corps : le client détecte sa propre mort et l'annonce à l'hôte avec l'identité du tueur. Tête contre tête (face-à-face, avant contre côté) : c'est l'hôte qui détecte et tranche (voir §2).

### Nourriture
- Points au sol de valeur **5 ou 10**, **parfois 50**.
- **Apparition régulière** sur la map pour permettre de grossir sans fin. Fréquence, proportions des valeurs et éventuel plafond de quantité au sol sont réglables **[choix Claude : apparition à rythme fixe, avec plafond de densité pour protéger les performances]**.
- **Traînées de mort et d'accélération** : pour les performances, les points libérés sont **regroupés** en un nombre limité de boules de valeur plus forte (une boule par portion de corps), plutôt qu'en 20 000 boules de 1 **[choix Claude]**. Plus la valeur est grosse, plus la boule est grosse.

## 5. Affichage

- **Style retenu : Néon** (maquette A). Fond sombre bleu nuit avec motif discret, serpents et nourriture de couleurs vives et lumineuses.
- **Performance** : l'effet de lueur ne doit pas être calculé en temps réel (`shadowBlur` interdit dans la boucle). On utilise des sprites pré-rendus (halo en image, cache hors écran) **[choix Claude]**.
- **Son propre serpent mis en évidence** : contour ou anneau autour de la tête, plus l'étiquette « Toi » **[choix Claude, d'après la maquette]**.
- **Couronne** dorée sur la tête du plus gros.
- **HUD** : chrono en haut au centre. Classement en cours (**points**) en haut à gauche, classement de partie (**score**) en haut à droite. Bouton accélérateur en bas à droite **[choix Claude, d'après la maquette]**. L'arrivée du fever est signalée (le chrono change de couleur, effet visuel) **[choix Claude]**.
- Les serpents à l'état « mort, réapparition dans N s » ne sont pas affichés sur la map. Le joueur concerné voit un compte à rebours **[choix Claude]**.
- Son : hors v1 **[choix Claude]**.

## 6. Fichier de variables de gameplay

Un **seul fichier** (`src/config/gameplay.ts` ou JSON **[choix Claude]**) qui regroupe tous les réglages, pour équilibrer sans toucher au code. Au minimum :

- durée de partie, durée du fever, multiplicateur fever ;
- points de départ / minimum, délai de réapparition ;
- vitesse de base, multiplicateur d'accélération, vitesse angulaire max ;
- coût de l'accélérateur (coefficient, exposant) ;
- épaisseur min, exposant d'épaisseur (ou facteur cible à 20 000) ;
- longueur : L0, exposant ;
- nourriture : fréquence d'apparition, valeurs et probabilités (5 / 10 / 50), plafond au sol, regroupement des traînées ;
- angle du cône « avant de tête » ;
- taille de la map, nombre max de joueurs ;
- fréquence réseau.

## 7. Contraintes techniques clés (à respecter par le plan)

- Les serpents de 20 000+ points sont très longs : collisions via **grille spatiale** (spatial hash) des segments de corps, jamais en O(n²) naïf.
- Corps stockés comme une polyligne d'échantillons espacés régulièrement. Le rendu se fait en **un seul trait épais par serpent** (plus la tête), pas un cercle par segment.
- Nourriture indexée dans une grille spatiale aussi (détection de consommation).
- Le réseau ne transmet que les têtes, les événements (nourriture, morts, scores) et des instantanés à l'arrivée.
- Mesurer les FPS sur la K10 dès les premières étapes.

## 8. Laissé au builder

- Valeurs numériques de départ précises (vitesses, tailles, fréquences), à ajuster en jouant.
- Format exact des messages réseau.
- Palette néon précise et liste des couleurs de serpent (≥ 8 distinctes).
- Détails visuels (yeux, motif du fond, effets de mort, animation de la couronne).
- Organisation du code et outillage de test.

## 9. Pour plus tard

Voir `decisions.md` : bots, bonus/malus attrapables.
