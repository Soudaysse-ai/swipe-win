# Rapport par phase — Défi Yas 2.0

Branche : `claude/awesome-wright-hvrm9z`. Toutes les valeurs de tests ci-dessous ont été obtenues
en exécutant réellement les suites (PostgreSQL 16 local, Chromium via Playwright).

## Résumé des tests

| Suite | Commande | Résultat |
|---|---|---|
| Unitaires backend | `npm test` | **89 / 89** |
| Intégration backend (vraie base, vrais clients Socket.IO) | `npm run test:integration` | **31 / 31** |
| E2E navigateur (Pixel 7 et écran 1440 px) | `npm run test:e2e` | **9 / 9** |
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

## Phase 6 — Yas Ludo · Phase 7 — Yas Cards · Phase 8 — Yas Penalty
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
7. **Quiz Swipe & Win** : conservé ; décider s'il reste proposé ou devient obsolète.
8. **Seuils des ligues Cards / Ludo** : à recalibrer sur la distribution réelle des cotes
   (réglables dans le back-office).
9. **Mode sombre** de l'application : non implémenté en V1.
