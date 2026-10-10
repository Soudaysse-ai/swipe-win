# Rapport par phase — Défi Yas 2.0

Branche : `claude/awesome-wright-hvrm9z`. Toutes les valeurs de tests ci-dessous ont été obtenues
en exécutant réellement les suites (PostgreSQL 16 local, Chromium via Playwright).

## Résumé des tests

| Suite | Commande | Résultat |
|---|---|---|
| Unitaires backend | `npm test` | **79 / 79** |
| Intégration backend (vraie base, vrais clients Socket.IO) | `npm run test:integration` | **27 / 27** |
| E2E navigateur (téléphones simulés Pixel 7) | `npm run test:e2e` | **6 / 6** |
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

## Phase 12 — Déploiement
**Non effectué** : en attente de validation explicite et des accès (voir `DEPLOIEMENT.md`).

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
