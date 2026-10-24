# Rapport par phase — Défi Yas 2.0

Branche : `claude/awesome-wright-hvrm9z`. Toutes les valeurs de tests ci-dessous ont été obtenues
en exécutant réellement les suites (PostgreSQL 16 local, Chromium via Playwright).

## Résumé des tests

| Suite | Commande | Résultat |
|---|---|---|
| Unitaires backend | `npm test` | **92 / 92** |
| Intégration backend (vraie base, vrais clients Socket.IO) | `npm run test:integration` | **32 / 32** |
| E2E navigateur (Pixel 7 et écran 1440 px) | `npm run test:e2e` | **11 / 11** |
| Build frontend | `npm run build` | OK |
| Charge indicative (`scripts/loadtest.js`, 200 clients, 30 s) | | 2 492 parties, 0 erreur, p50 48 ms, p95 384 ms |

---

## Phase 1 — Audit
- **Fichiers** : `docs/AUDIT.md`.
- **Résultat** : stack identifiée (React/Vite, Express, PostgreSQL), 9 constats de sécurité dont 3
  critiques (connexion par numéro seul, `player_id` fourni par le client, score gonflable par
  réponses répétées). `Yas-game` est une ancienne copie du même projet.
- **Non vérifiable** : site en ligne, base de production, hébergement (accès refusés / non fournis).

## Phase 2 — Fondations
- **Fichiers** : `backend/src/config.js`, `lib/*`, `db/migrate.js`, `db/migrations/00{1,2,3}_*.sql`,
  `services/authService.js`, `passwordReset.js`, `mailer.js`, `permissions.js`, `middleware/*`, `routes/auth.js`,
  `frontend/src/styles/*`, `player/AuthContext.jsx`, `components/*`, `player/pages/AuthPages.jsx`.
- **Fonctionnalités** : comptes (pseudonyme, +269, mot de passe bcrypt, e-mail facultatif, avatar,
  CGU), sessions révocables, réinitialisation par lien e-mail (Resend) ou par lien remis par le
  service client,
  6 rôles admin, design system Yas mobile-first.
- **Migrations** : `001` (schéma existant, idempotent), `002` (plateforme), `003` (référentiels).
  Testées sur une base « ancienne version » avec données : aucune perte, rôles convertis,
  ancien joueur relié à son nouveau compte.
- **Correctifs de l'existant** : audit S1–S8 (quiz sécurisé, téléphone retiré du classement
  public, resets réservés, erreurs génériques, CORS, limites de fréquence).

## Phase 3 — Multijoueur
- **Fichiers** : `realtime/{hub,matchRuntime,rooms,matchmaking,socket}.js`, `services/results.js`.
- **Fonctionnalités** : salons privés (code `YAS-482913`) et publics, matchmaking par niveau avec
  élargissement progressif et confirmation, invitations d'amis, revanche, commandes idempotentes et
  versionnées, reconnexion (grâce 60 s), restauration après redémarrage, fin de match
  transactionnelle et idempotente.
- **Tests** : intégration (2 clients) — partie complète, idempotence, version périmée, tour,
  reconnexion, forfait, chronomètre, salon complet, matchmaking (accepté / refusé), chat filtré.

## Phase 4 — Yas Connect
- **Fichiers** : `games/connect/engine.js`, `frontend/src/games/connect/ConnectGame.jsx`.
- **Tests** : 14 unitaires (colonnes pleines, tours, 4 directions, nul, timeout…), intégration,
  E2E « deux téléphones jouent jusqu'à la victoire ».

## Phase 5 — Classements
- **Fichiers** : `services/{rating,progression,leaderboards,profiles,badges}.js`,
  `routes/leaderboards.js`, pages `Rankings`, `Profile`, `Social`.
- **Fonctionnalités** : XP et niveaux, Elo (1v1), OpenSkill Plackett-Luce (multijoueur), points de
  saison plafonnés, ligues, badges, classements global/par jeu/périodes, départages, évolution du
  rang (instantanés), profils publics sans données privées, historique.

## Phase 6 — Yas Ludo · Phase 7 — Yas Cards · Phase 8 — Yas Penalty (retiré depuis, voir plus bas)
- **Fichiers** : `games/{ludo,cards,penalty}/engine.js`, `frontend/src/games/{ludo,cards,penalty}/*`,
  `games/common/Dice.jsx`.
- **Tests** : Ludo 17 unitaires + partie à 4 clients ; Cards 20 unitaires + partie complète à
  3 clients (mains et pioches privées vérifiées) ; Penalty 11 unitaires + séance complète ; E2E par jeu.

## Phase 9 — Back-office
- **Fichiers** : `services/{adminStats,moderation,exporter,live}.js`, `routes/admin/*`,
  `frontend/src/admin/**`.
- **Fonctionnalités** : dashboards (général, par jeu, engagement, temps réel), 7 classements
  administratifs, gestion des utilisateurs, exports CSV/Excel, modération, résultats suspects,
  corrections journalisées, saisons, réglages, administrateurs, audit.
- **Tests** : 7 tests d'intégration (permissions par rôle, données réelles, exports, suspension avec
  déconnexion immédiate, annulation de match par écritures compensatoires, signalements).

## Phase 10 — Social & tournois
- **Fonctionnalités** : amis, demandes, blocage, présence, invitations, chat (filtre, signalement,
  limitation, modération), notifications, tournois (élimination directe 2–4 joueurs / championnat),
  saisons.
- **Tests** : tournoi à 4 joué de bout en bout (salons réservés, avancement, classement, publication).

## Phase 11 — Optimisation
- Logo 280 Ko → 2–7 Ko (rendus du fichier officiel), chargement initial ≈ 125 Ko gzip, jeux et
  back-office à la demande, PWA facultative, cache immuable des assets, polices réduites.
- Limites de fréquence adaptées aux IP mobiles partagées, CORS strict en production.
- Correctif trouvé par la charge : requêtes concurrentes sur un client de transaction (badges).
- CI GitHub Actions.

## Évolution — réinitialisation par e-mail (sans OTP)
- **Fichiers** : `db/migrations/004_email_reset.sql`, `services/mailer.js`, `services/passwordReset.js`,
  `routes/auth.js`, `routes/player.js`, `services/moderation.js`, écrans d'inscription, de mot de passe
  oublié, de profil et fiche joueur du back-office. `services/otpService.js` supprimé.
- **Tests** : 6 tests d'intégration (inscription sans OTP, lien à usage unique, sessions fermées,
  adresse inconnue sans divulgation, expiration, changement d'e-mail protégé, lien du service client),
  3 tests unitaires de l'appel à l'API Resend, 1 test E2E du parcours complet.
- **Garde-fous** : en production l'API refuse de démarrer sans `APP_URL` en `https://` (sinon les liens
  envoyés pointeraient vers `localhost`) ; en mode test la clé Resend est ignorée (aucun envoi réel).

## Évolution — interface responsive et nouvel accueil
- **Mise en page** : plus de cadre « téléphone » de 480 px. Mobile : barre de navigation flottante
  Midnight Blue (onglet actif en jaune). Tablette : contenu élargi. Ordinateur (≥ 1024 px) : barre
  latérale blanche avec le logo en haut à gauche, contenu centré jusqu'à 1 180 px, accueil et salle
  d'attente sur deux colonnes, feuilles centrées. Les plateaux de jeu s'ajustent à la hauteur de l'écran.
- **Accueil connecté** inspiré de l'application Yas (self-care) : dégradé jaune, cartes Niveau / Points
  de saison, actions rapides rondes (partie rapide, code salon, inviter, tournois), carte « Défi du jour »
  avec bouton jaune, carrousel des jeux, tuiles de services.
- **Accueil public** (`/welcome`) : héros « Joue, défie, gagne ! », les 4 jeux, « Comment ça marche ? »,
  bandeau communauté, appel à l'action, pied de page.
- **Logo** : rendu depuis le fichier officiel et recadré (l'ancienne image avait ~45 % de marge
  transparente, d'où un logo petit et décalé).
- **Inscription** : numéro accepté sous toutes ses formes (`412 34 56`, `+269 412 34 56`, `00269…`,
  collage, saisie automatique), erreurs affichées sous chaque champ, affichage du mot de passe,
  messages clairs si le serveur est injoignable ou mal configuré (API absente, origine refusée).
  `CORS_ORIGINS` accepte des motifs `*` (ex. `https://defi-yas-*.vercel.app` pour les aperçus).

## Évolution — conformité au guide « Yas App Design Best Practices » (2026, V1.0)
- Navigation : en-tête toujours Sunshine Yellow, barre basse toujours Midnight Blue, contenus
  secondaires (tournois, quiz, notifications, règles, conditions, déconnexion) dans un **menu
  hamburger** sur mobile ; barre latérale sur ordinateur.
- Logo : utilisé avec parcimonie (accueil public, écrans de compte, navigation), Midnight Blue sur
  fond Sunshine Yellow, calé dans le coin ; retiré de l'en-tête des écrans de contenu.
- Pulse : vrai motif (contour du plectre décalé trois fois), jaune, en accent de fond (cartes d'état,
  bandeau communauté, carte « Prêt pour un défi ? »), au moins deux côtés et un angle visibles.
- Typographie : échelle SH (36 / 24 / 20 px ExtraBold Italic), textes d'aide et libellés ≥ 14 px.
- Composants : boutons Medium 44 px partout (Small 32 px avec zone tactile de 44 px), onglets 48 px,
  cartes à 24 px (16 px pour les cartes produit), étiquettes de catégorie en Sky Blue / Berry (pas de
  vert hors statut), appel à l'action final aligné à gauche.
- Le site www.yas.km n'a pas pu être consulté depuis l'environnement de développement (nom de domaine
  bloqué) ; la maquette s'appuie sur le guide et les captures de l'application Yas fournies.

## Évolution — éléments de marque officiels et nouvelle page d'accueil
- **Fichiers officiels** (fournis par Yas) : `frontend/src/assets/brand/Play_CMYK.svg` (plectre) et
  `Yas_Pulse_Transparent_Wide.svg` (Pulse épais, 4 couches 20 / 40 / 70 / 100 %). Leurs tracés sont
  repris tels quels ; l'ombre verte du fichier d'export (artefact CMJN) n'est pas utilisée. Le noyau du
  Pulse est exactement le plectre à l'échelle 400/650 : le plectre bleu est superposé au noyau.
- **Logo** (guide §3.1) : variante secondaire (plectre bleu, « yas » jaune) sur fond jaune ou clair,
  variante principale (plectre jaune, « yas » bleu) sur fond bleu, et marque « y! » seule pour la barre
  de l'application. Toutes rendues depuis le logo officiel, couleurs ramenées aux valeurs exactes de la
  charte (le fichier source était légèrement terni), proportions conservées.
- **Accueil public** selon les modèles web Yas : en-tête deux rangées (barre utilitaire Midnight Blue,
  barre principale Sunshine Yellow avec logo 64 px calé à gauche), héros jaune (Pulse + plectre + aperçu
  de l'application), cartes produits, étapes avec icônes dans le plectre, bandeau communauté, bandeau
  d'appel à l'action jaune, pied de page Midnight Blue.
- **Application** : barre jaune pleine avec la marque « y! » à gauche, notifications et menu à droite ;
  bandeau d'accueil jaune avec le Pulse, cartes qui le chevauchent.
- www.yas.km reste inaccessible depuis l'environnement de développement (DNS bloqué).

## Évolution — ambiances « Curves » (site) et « Gamification » (espace Jeux)
- **Accueil public** dans l'esprit de la page web Yas « Curves » : barre Sunshine Yellow sur une
  rangée (logo à gauche, liens séparés par des filets), sections blanches et jaune très clair
  (`#FFFDF2`), titres deux tons (Sky Blue puis Midnight Blue), plectres officiels tournés avec halo
  qui « tiennent » les illustrations des jeux, blocs texte / visuel alternés, bandeau jaune centré,
  pied de page Midnight Blue.
- **Espace Jeux** dans l'esprit des écrans de l'appli Yas (Gamification, « Last transactions ») :
  barres d'écran jaunes (retour + titre), bandeau jaune avec pastille « pièce » (+30 pts / victoire),
  listes sur fond `#FFFBEC` à filets pointillés avec bouton Midnight Blue par ligne, titres de section
  Midnight Blue 70, salle d'attente avec l'illustration dans le plectre, fin de partie en fenêtre
  blanche sur fond jaune (Pulse + plectre, titre deux tons, pastille des points, bouton jaune).
- Les images (photos) des maquettes « Curves » ne sont pas incluses dans le fichier fourni : seules
  la structure et les éléments graphiques visibles ont été repris.

## Évolution — Pulse retiré, couleurs secondaires
- Le Pulse (fichier `Yas_Pulse_Transparent_Wide.svg`) présentait un cran visible sur ses couches
  extérieures une fois agrandi : il a été retiré partout (héros, bandeaux, écrans de compte, fin de
  partie). Les accents utilisent désormais le plectre officiel seul (bleu, ou jaune clair sur jaune) et
  le plectre avec halo.
- Couleurs secondaires de la charte (Sunset, Fuscia, Berry, Twilight), réservées aux illustrations et
  à l'information : fond d'illustration de chaque jeu (Cards Sunset, Connect Sky Blue, Penalty Twilight,
  Ludo Berry), halos et tuiles de statistiques dans la teinte du jeu, tuiles de fin de partie (Sky,
  Berry, Sunset), étiquette « Inscriptions ouvertes » en Sunset, 3ᵉ marche du podium en Sunset 30.
  Jaune, Midnight Blue et Sky Blue restent dominants (50 / 40 / 10).

## Évolution — jouer seul contre un bot
- **Où** : bouton « Jouer contre un bot » sur la page de chaque jeu (niveau Facile / Normal /
  Difficile, 1 à 3 bots pour Cards et Ludo), onglet « Contre un bot » de la Partie rapide de l'accueil,
  et proposition automatique après 10 s de recherche sans adversaire. « Rejouer contre le bot » en fin
  de partie relance les mêmes réglages.
- **Bots** (`backend/src/games/bots/`) : un module par jeu, qui décide uniquement à partir de
  `engine.view(state, botId)` — la même vue qu'un joueur (aucune carte ni choix caché de l'adversaire).
  Connect : recherche negamax alpha-bêta (1, 3 ou 5 coups d'avance) ; Ludo : capture, sécurité,
  sorties ; Cards : grosses cartes d'abord, Jokers gardés, attaque du joueur suivant, jamais de +4 illégal ;
  Penalty : au hasard, puis lecture des habitudes de l'adversaire dans l'historique révélé (Difficile).
  Temps de réflexion simulé (0,5 à 2,6 s).
- **Transparence** : les bots ne sont pas des comptes joueurs (pas de ligne `users` ni
  `match_players`, description dans `matches.bots`, migration 005), s'appellent « Bot Ngazidja »,
  « Bot Mwali », « Bot Ndzuani », ont un avatar robot et une étiquette « Bot ». Le matchmaking ne
  crée toujours aucun faux adversaire : un bot n'est joué que sur choix du joueur.
- **Comptabilisation** : partie d'entraînement (`mode = 'bot'`, `is_valid = false`) : aucune ligne
  `match_results`, donc ni XP, ni cote, ni points de saison, ni badges, ni statistiques, ni KPI du
  back-office. Elle apparaît dans l'historique du joueur avec la mention « entraînement ».
- **Robustesse** : actions des bots sérialisées dans la même file que celles du joueur, reprise après
  redémarrage du serveur, arrêt immédiat si le joueur abandonne une partie à plusieurs bots.
- **Tests** : 8 unitaires (parties complètes bot contre bot sur les 4 moteurs, de 2 à 4 joueurs et à
  tous les niveaux, sans coup illégal ; victoire et blocage à Connect ; pas de bluff au +4 ; attente de
  l'ouverture du tir), 4 d'intégration (Connect, Penalty, Ludo à 3 bots, garde-fous) et 2 E2E (partie
  complète contre un bot, proposition après une recherche sans adversaire).

## Évolution — écrans de jeu plus lisibles, temps de jeu allongés
Retours après les premières parties (comparaison avec Plato) :
- **Bot** : proposé uniquement quand personne n'est disponible — sur la page d'un jeu quand aucun joueur
  n'y est en ligne, et pendant une recherche restée sans adversaire 10 s. Plus d'onglet bot sur l'accueil.
- **Temps de jeu** (migration 006, valeurs d'origine seulement) : 30 s par tour pour Cards, Connect et
  Ludo (au lieu de 20 s), 15 s par décision pour Penalty (au lieu de 10 s). Bots plus posés (1 à 3 s).
- **Yas Ludo** : chaque joueur est placé au coin de sa base ; un anneau autour de l'avatar fait office
  de chronomètre ; le dé (refait, centré, faces qui défilent puis se posent) apparaît à côté de celui qui
  joue ; quand un lancer termine le tour (aucun pion jouable, trois 6), son résultat reste affiché ;
  les pions avancent case par case ; une ligne d'état dit qui doit faire quoi (« À toi ! Touche le dé »,
  « Bot Mwali a fait 4 et choisit un pion… »). Le moteur expose le dernier lancer (`lastRoll`).
- **Yas Cards** : vraies cartes de jeu de défausse (ovale blanc incliné, grand chiffre cerné, index dans
  les coins, symboles Passe / Inverse / +2, Jokers noirs à l'ovale quatre couleurs, dos « YAS ») sur une
  table Midnight Blue : adversaires en haut avec leurs cartes en éventail, pioche et défausse au centre
  (couleur active en halo), « Tu as joué Rouge 3 » puis « À toi : choisis une carte », main en éventail
  en bas avec les cartes jouables levées.

## Évolution — Yas Foot (football de table)
Jeu ajouté le 11/10/2026 (migration 007, classement Elo) ; il remplace Yas Penalty, retiré ensuite.
- **Règles** : 2 joueurs, 5 palets chacun et un ballon. À son tour, on tire un de ses palets comme une
  fronde ; tout rebondit (palets, ballon, bords, poteaux) jusqu'à l'arrêt, puis la main passe. But quand le
  ballon franchit entièrement la ligne ; contre son camp, le but va à l'adversaire ; l'équipe qui encaisse
  engage. Premier à 3 buts, sinon le score à la fin des 5 minutes (nul possible). 20 s pour tirer, 3 tours
  manqués d'affilée = forfait.
- **Moteur** (`backend/src/games/foot`) : physique déterministe calculée par le serveur (60 pas/s, 2
  sous-pas, chocs élastiques avec masses, frottement, filets et poteaux). Chaque tir renvoie la trajectoire
  (30 images/s, ~18 Ko pour un tir à pleine puissance) ; le tir suivant n'est ouvert qu'après l'animation.
- **Écran** : terrain vertical sur téléphone (ma cage en bas), horizontal sur ordinateur (ma cage à
  gauche) ; palets aux couleurs des équipes avec l'avatar du joueur ; visée comme sur la capture de
  référence (cercle de puissance, flèche, pointillés) ; tableau de score avec chronomètre de match et
  anneau de tour ; « BUT ! » à chaque but.
- **Bot** : vise le ballon pour l'envoyer vers la cage adverse (point d'impact calculé), essaie jusqu'à
  45 tirs avec la vraie physique (Difficile) et garde le meilleur ; imprécision selon le niveau.
- **Tests** : 9 unitaires du moteur (collisions, buts, contre son camp, fin au score ou au temps,
  forfait, déterminisme, rien ne sort du terrain), bot contre bot jusqu'au bout, 1 d'intégration et 1 E2E
  (visée et tir à la souris, réponse du bot).

## Évolution — Yas Penalty retiré, back-office vérifié
- **Yas Penalty retiré** à la demande de Yas (migration 008) : plus proposé nulle part (liste des jeux, accueil,
  classements, défi du jour, tournois, back-office, bot). Moteur, écran, bot et tests supprimés du code.
  **Aucune donnée effacée** : le jeu est désactivé en base, l'historique des parties reste consultable
  (« Yas Penalty » / « retiré »), et le badge « Le Mur » n'est plus montré qu'aux joueurs qui l'ont obtenu.
  Une partie de Penalty en cours au moment de la mise en ligne est annulée proprement au redémarrage.
- **Back-office passé en revue** (23 pages ouvertes une à une, erreurs JavaScript et appels API relevés) :
  « Résultats suspects » et « Réglages des jeux » plantaient à l'ouverture (fonction asynchrone passée
  directement à `useEffect`) ; corrigé, ainsi que deux autres pages qui avaient le même défaut latent.
- **Tournois** : en production, aucun tournoi n'était visible des joueurs (un tournoi créé reste un
  brouillon invisible tant qu'il n'est pas publié). Le formulaire propose désormais « Créer et publier »
  (visible tout de suite, inscriptions ouvertes) ou « Enregistrer en brouillon », la liste a un bouton
  « Publier » et indique « Brouillon (non visible) ». L'administrateur voit le code de salon de chaque match
  et les statuts en français. Parcours vérifié de bout en bout : création, inscriptions, lancement,
  affichage côté joueur avec « Rejoindre mon match ».

### Couvertures illustrées et Swipe & gagne activable
- **Bandeaux** : les bandeaux jaunes unis de l'accueil, de la page « Les jeux » et de la page de chaque
  jeu sont remplacés par des illustrations vectorielles originales (`components/Covers.jsx`,
  `styles/covers.css`) : la coupe entourée des quatre jeux sur fond Midnight Blue pour l'accueil, un
  stade et un tir vers le but (Foot), un éventail de cartes (Cards), un plateau en perspective avec
  pions et dés (Ludo), une grille avec le jeton gagnant qui tombe (Connect). Fond dans la couleur du
  jeu, titre blanc, mot-clé Sunshine Yellow ; animations douces, coupées si l'appareil demande moins
  de mouvement. Aucune image externe : rien à télécharger en plus sur mobile.
- **Swipe & gagne** : masqué par défaut (migration `009_quiz_visibility.sql`, réglage `quiz_visible`).
  Interrupteur « Visible pour les joueurs » dans Réglages des jeux et sur le tableau de bord du quiz
  (permission `quiz.manage`, journalisé). Masqué : aucune entrée dans les menus, l'accueil et la page
  Jeux ; `/quiz` renvoie à l'accueil ; l'API refuse de démarrer une partie (`QUIZ_HIDDEN`). Questions,
  lots et historiques restent gérables dans le back-office.
- Tests : 1 d'intégration (masqué par défaut, droits, journal, blocage), 2 E2E (masqué ; activé depuis
  le back-office puis partie jouée).

### Corrections Ludo et Connect, Yas Foot 1.1
- **Ludo bloqué** : quand un lancer sans pion jouable était aussitôt suivi d'un lancer du bot,
  le minuteur qui efface « aucun pion ne peut avancer » était annulé : message figé, dé
  verrouillé, tour perdu jusqu'au forfait. Chaque affichage a désormais son propre minuteur
  (reproduit puis corrigé ; test E2E contre un bot).
- **Grille Connect** : dessinée en SVG ; elle ne dépend plus d'`aspect-ratio` ni de l'étirement
  des boutons (Safari, anciens Android) qui pouvaient l'écraser en bandeau vide. Replis
  ajoutés ailleurs (dés de Ludo, vignettes, hauteurs en `dvh`).
- **Yas Foot 1.1** (migration 010, règles 1.1.0) : avant-match de 15 s (équipe parmi
  16 drapeaux, 4 formations, stade au choix — Standard, Nocturne, Plage de Moroni, Arène Yas,
  visuel propre à chaque joueur), écran « VS », palets et ballon plus grands, terrain plein
  écran (barre d'abandon et d'options intégrée), guide de trajectoire pendant la visée,
  **passes** (le ballon envoyé sur un coéquipier redonne la main, deux fois de suite au plus),
  sons synthétisés (coupés par défaut, interrupteur dans les options), « BUT ! » avec confettis.
  Le bot choisit son équipe et sa formation et valorise les passes. Les choix d'avant-match ne
  sont jamais refusés pour « version périmée » (`versionFreeActions`).

## Évolution — portail d'accueil, récupération de compte, inscription
- **Accueil public** (`/welcome`) remplacé par un portail de connexion d'un seul écran, dans le style de
  l'application connectée (barre jaune, bandeau bleu illustré, carte de connexion). Inscription et mot
  de passe oublié reprennent la même mise en page.
- **Mot de passe oublié par numéro** : lien vers l'e-mail du compte, ou demande au service client
  (back-office « Récupération de compte » : rappel du numéro, puis envoi du lien). Rappel sur l'accueil
  des joueurs sans e-mail pour qu'ils en ajoutent un.
- **Inscription** : pseudonymes avec accents et espaces acceptés, message clair pour les numéros non
  Yas, refus d'inscription journalisés (code seulement) pour diagnostiquer les échecs.

## Évolution — Yas Foot sans délai (modèle Soccer Stars)
- **Tir instantané** : la physique est dans un module unique (`backend/src/games/foot/physics.js`) dont
  le navigateur a une copie exacte (`frontend/src/games/foot/sim.js`, générée par `npm run sync:foot`,
  vérifiée par un test). Au relâchement, le tir est calculé et animé aussitôt ; le serveur, qui fait
  foi, calcule la même chose et confirme. S'il refuse le tir ou trouve autre chose, l'écran se cale
  sur sa version. Vérifié avec le serveur gelé : le palet part en ~20 ms.
- **Animation fluide** : 60 images par seconde pour le tireur (interpolation des images du serveur
  chez l'adversaire), palets déplacés directement dans le SVG, terrain non redessiné pendant le tir.
- **Look Soccer Stars** : cercle sombre de visée qui grandit avec la puissance et flèche blanche,
  anneaux lumineux sur l'équipe qui a la main (bleu pour moi, rouge pour l'adversaire), bulle
  « Belle passe ! » au-dessus du receveur, traînée du ballon, « Premier à 3 » sous le chrono.

## Évolution — animations de Yas Cards (modèle Plato « Ocho »)
- La carte jouée vole de sa vraie place (ta main, ou l'éventail de l'adversaire en se retournant)
  jusqu'à la défausse, en arc, et s'y pose légèrement inclinée sur la carte précédente. Ta carte part
  dès que tu la touches ; elle revient en main si le serveur refuse le coup.
- Les cartes piochées volent de la pioche vers le joueur, l'une après l'autre (retournées pour toi).
- +2, +4, Passe, Inverse, Joker : halo dans la couleur, onde, symbole qui jaillit et étincelles.
- Flèches du sens du jeu autour de la défausse, dans la couleur active, qui tournent (tour rapide
  au changement de sens) ; journal des trois dernières actions ; la main se resserre en douceur.
- Animations coupées si l'appareil demande moins de mouvements (`prefers-reduced-motion`).

## Évolution — Yas Foot 1.2 (proportions de Soccer Stars)
- Mesures prises sur une vidéo de Soccer Stars : même rapport du terrain (1,67), même taille de
  palets ; buts plus larges (40 % de la largeur au lieu de 33 %) et plus profonds, ballon plus gros
  (rayon 18 au lieu de 15).
- Placement « Classique » par défaut : gardien sur sa ligne, deux défenseurs, deux attaquants écartés.
- Visée à l'œil : plus de guide de trajectoire, seulement le cercle sombre et la flèche blanche.
- Étincelles jaunes à chaque choc ; cages métalliques au filet quadrillé, une seule surface avec son
  arc, grand rond central, bordures grises en relief.
- Buts encore agrandis (260 de large, 66 de profondeur) ; terrain retravaillé : bandes d'herbe,
  motif en losanges, bords assombris, tribunes à gradins, drapeaux de coin.
- Barre de chat en bas de l'écran (message libre, réactions, messages rapides) ; les messages reçus
  s'affichent en bulle quelques secondes. Désactivée en entraînement contre le bot.
- Règles 1.2.0 (migration 012) ; les parties déjà jouées gardent leur version.

## Évolution — chat en bas de tous les jeux
- La barre de chat de Yas Foot (message libre, réactions, messages rapides, bulles des messages
  reçus, historique) est maintenant en bas de Yas Connect, Yas Ludo et Yas Cards aussi. Elle remplace
  l'icône de chat de l'en-tête. Contre le bot, elle indique que le chat s'ouvre contre un vrai joueur.
- Plateaux légèrement réduits pour que la barre ne les recouvre jamais (vérifié par un test E2E par jeu).

## Évolution — Yas Foot en plein écran
- Comme Soccer Stars, la pelouse et les tribunes occupent tout l'écran : l'herbe est dessinée bien
  au-delà du terrain et remplit les bords, quel que soit le format (téléphone, tablette, ordinateur).
- Score et état du tour flottent en haut sur un bandeau translucide de hauteur fixe (le terrain ne
  bouge plus quand le texte change) ; barre de chat collée en bas, toute la largeur.

## Évolution — tous les jeux en plein écran
- Yas Connect, Yas Ludo et Yas Cards se jouent aussi en plein écran, sur une « scène » aux couleurs
  de la plateforme (fond Midnight Blue de l'accueil, accents jaunes, cartes blanches) : pas de rupture
  entre la plateforme et le jeu.
- Bandeau translucide en haut (abandon, nom du jeu, pastille Entraînement), comme Yas Foot ; barre de
  chat bleu nuit collée en bas ; le jeu occupe toute la place au milieu (grille de Connect cerclée de
  bleu clair pour ressortir sur le fond).

## Évolution — Yas Foot 1.3 : belle passe contrôlée et replacement
- Belle passe contrôlée : quand le ballon frappé par le tireur touche un coéquipier, il s'arrête collé à
  lui, du côté du but adverse, sans rebondir (physique partagée serveur / navigateur, testée).
- Le joueur rejoue et peut d'abord replacer le receveur autour du ballon : zone en pointillés, il touche
  l'endroit voulu (action `place`, vérifiée par le serveur : près du ballon, sur le terrain, sans
  chevaucher un autre palet). Le bot fait de même (receveur derrière le ballon, face au but).
- Règles 1.3.0 (migration 013).
- Dans tous les jeux, le pseudonyme du joueur remplace « Toi » / « Moi ».

## Évolution — Yas Cards : sons
- Sons synthétisés dans le navigateur (WebAudio, aucun fichier à télécharger) : carte lancée, carte
  posée, carte piochée (une par carte, au rythme de l'animation), +2 / +4, passe ton tour, sens
  inversé, joker, « Dernière carte ! », mélange de la pioche, début de mon tour, fanfare de victoire.
- Coupés par défaut, comme pour Yas Foot : bouton haut-parleur dans le bandeau du haut ; le choix est
  mémorisé sur l'appareil et partagé entre les jeux.

## Correctif — mises à jour qui n'arrivaient pas sur les téléphones
- Un site resté ouvert (onglet ou application installée) gardait l'ancien code. Il vérifie maintenant
  la version en ligne au retour sur le site et toutes les 5 minutes, et se recharge tout seul (jamais
  pendant une partie : au moment où le joueur la quitte).
- Vercel renvoyait la page d'accueil à la place d'un fichier de jeu disparu, et le service worker
  pouvait la garder en cache : un jeu restait alors périmé ou cassé sur l'appareil. Les fichiers
  absents répondent désormais 404, le service worker ne met plus de page HTML en cache pour un
  fichier de jeu et vide son ancien cache (v2) ; un fichier de jeu introuvable déclenche un
  rechargement unique.

## Correctif — vérification complète des jeux (parties filmées image par image)
- Yas Cards, « les cartes changent de couleur » :
  - le halo des cartes spéciales passait par-dessus la carte (un Joker noir devenait vert une seconde) :
    il est désormais dessous, seuls le symbole et les étincelles jaillissent au-dessus ;
  - les cartes non jouables étaient assombries (un jaune terni passait pour un vert ou du kaki) : elles
    gardent leurs vraies couleurs, les cartes jouables sont soulevées et cerclées de jaune ;
  - la carte du dessous de la défausse n'est plus ternie ;
  - l'anneau et la couleur active suivent la carte réellement posée (plus d'anneau rouge autour d'une
    carte jaune pendant que la carte rouge vole encore) ;
  - les cartes piochées à cause d'un +2 / +4 partent quand ce +2 / +4 est posé, plus avant ;
  - retournement des cartes en vol (dos → face) sans backface-visibility, mal géré par certains
    téléphones (face et dos qui clignotent).
- Yas Foot : le score (et « Coup de sifflet final ») ne change plus quand le ballon part, mais au
  moment du « BUT ! ».
- Yas Ludo : le plateau ne saute plus à chaque tour (texte d'état de hauteur fixe) ; pseudo sur deux
  lignes au lieu d'être coupé par le dé.
- Chronomètres : plus de « 31 s » sur un tour de 30 s (heure lue à chaque affichage ; horloge du serveur
  estimée par aller-retour, sans le biais du temps de transport des messages).
- Écran de résultat : le pseudo remplace « Toi ».
- Vérifié : parties contre bots des 4 jeux (mobile et ordinateur, 1 à 3 bots), aucune erreur de console ;
  relevé image par image : anneau toujours de la couleur de la carte, aucun clignotement, plateau fixe.

## Évolution — Yas Cards : main en éventail, plus calme sur mobile
- Vérifié avec un délai réseau de téléphone simulé (150 ms dans chaque sens) et chaque carte suivie par
  son identifiant, image par image : aucune carte en double, aucune carte jouée qui revient.
- Ce qui donnait l'impression que « plusieurs cartes ressortent » : après avoir joué, les autres cartes
  jouables restaient levées pendant l'aller-retour réseau, puis retombaient. Dès qu'une carte est jouée,
  la main se calme sans attendre le serveur.
- Main redessinée : éventail en arc, cartes plus grandes (76 px sur mobile), déplacements par transform
  (fluides sur téléphone) ; carte jouable soulevée avec une lueur douce ; jamais hors de l'écran. Les
  cartes en vol partent et arrivent dans l'angle de leur place dans l'éventail.
- Lueur colorée derrière la défausse atténuée.

## Correctif — Yas Cards lisible sur iPhone (Safari et ses barres)
- Vidéo du joueur : le haut du jeu (l'adversaire, d'où partent ses cartes) était coupé et inaccessible ;
  « Passer » recouvrait le texte, la main recouvrait « À toi ». Cause : la scène centrait verticalement
  un contenu plus haut que l'écran (justify-content: center) ; elle utilise désormais des marges
  automatiques, le contenu défile au lieu d'être coupé (tous les jeux).
- Yas Cards s'adapte à la hauteur disponible (< 780 px et < 690 px) : défausse et cartes plus petites,
  journal réduit, boutons à la place du journal pendant ton tour, éventail adverse réduit. Vérifié à
  600, 660, 740 et 844 px : tout tient, aucun chevauchement (mesuré à chaque image d'une partie).
- Yas Ludo : seul le plateau se réduit sur écran court, les joueurs gardent leur largeur.
- Bot de Yas Cards un peu plus posé (2,2 à 3,2 s pour jouer une carte) ; bandeau « Tu passes ton
  tour » quand l'adversaire te fait sauter ton tour.

## Évolution — Yas Cards façon Plato : choisir puis jouer, piocher en touchant la pioche
- Comme sur Plato : les cartes jouables brillent ; un premier toucher met la carte en avant (plus grande,
  au-dessus), un second la joue ; toucher ailleurs annule. Plus de carte jouée par erreur.
- Plus de bouton « Piocher » : la pioche brille et se soulève quand il faut piocher, on la touche.
- Bug corrigé (cause des cartes qui « changent de couleur » et « ressortent ») : sur réseau mobile, quand
  ma carte se posait avant la réponse du serveur, l'écran prenait l'ancienne carte du serveur pour une
  nouvelle, la refaisait voler depuis l'adversaire par-dessus la mienne, puis la mienne revolait. La
  défausse ne réagit plus qu'à une vraie nouvelle carte annoncée par le serveur. De plus, un état de
  partie plus ancien que celui affiché (resynchronisation, message en retard) est ignoré (tous les jeux).
- Vérifié avec délai réseau et messages en désordre (jusqu'à 600 ms) : 0 retour en arrière (12 avant).

## Évolution — Yas Cards 1.1 : renvoyer un +4 ; feuilles jamais coupées
- Face à un +4, on peut le renvoyer avec son propre +4 : le cumul passe au suivant (+8, +12…).
  Accepter fait piocher le cumul ; contester porte sur le dernier +4 (bluff → son auteur pioche le
  cumul ; sinon le contestataire pioche le cumul + 2). Pas de cumul des +2. Le bot renvoie aussi.
  Règles 1.1.0 (migration 014) ; la fenêtre du +4 explique que « Contester » n'est pas « renvoyer ».
- Feuilles (choix de couleur, +4…) rendues au niveau de la page : sur iPhone, Safari les découpait
  dans la scène du jeu (bas caché par la barre de chat, titre blanc sur blanc).

## Phase 12 — Déploiement
**Effectué le 11/10/2026** après validation : site sur Vercel (www.defi-yas.com), API sur Render
(`defi-yas-api`, plan payant toujours actif), base Neon de production (sauvegarde préalable : branche
`pre-defi-yas-2`). La production suit la branche `main` (voir `DEPLOIEMENT.md`).

---

## Points ouverts (à traiter / décider)

1. **Accès production** (base, Render, Vercel, DNS) pour finaliser l'audit, faire la sauvegarde et
   la migration sur staging.
2. **Resend** : ✅ clé API (envoi uniquement) et domaine `defi-yas.com` vérifiés le 10/10/2026 par un
   envoi réel depuis `no-reply@defi-yas.com` (adresse de test Resend `delivered@resend.dev`, accepté).
   Reste à reporter `RESEND_API_KEY`, `MAIL_FROM` et `APP_URL` sur Render. Il n'y a plus de vérification
   OTP : le numéro saisi à l'inscription n'est pas vérifié. Les joueurs sans e-mail récupèrent leur
   compte via le service client (lien généré dans le back-office).
3. **Hébergement temps réel** toujours actif ; V1 limitée à **une instance** (Redis à prévoir pour
   plusieurs instances).
4. **Charge réelle** : refaire le test sur l'infrastructure cible avant toute annonce de capacité.
5. **Tests sur appareils physiques** (Android d'entrée de gamme, iPhone) : seuls des téléphones
   simulés (Chromium, viewport Pixel 7) ont été testés.
6. **Contenus juridiques** : CGU / politique de confidentialité provisoires, à valider.
7. **Quiz Swipe & Win** : conservé mais masqué par défaut ; activable à tout moment depuis le back-office.
8. **Seuils des ligues Cards / Ludo** : à recalibrer sur la distribution réelle des cotes
   (réglables dans le back-office).
9. **Mode sombre** de l'application : non implémenté en V1.
