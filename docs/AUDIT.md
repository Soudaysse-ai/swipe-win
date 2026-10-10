# Défi Yas 2.0 — Phase 1 : Audit du projet existant

> Audit réalisé le 10/10/2026 sur le dépôt `Soudaysse-ai/swipe-win` (branche `main`, commit `6731720`).
> Tout ce qui suit provient de la lecture du code. Les éléments **non vérifiables** depuis l'environnement
> d'audit sont signalés explicitement : rien n'est inventé.

## 1. Périmètre et sources

| Source | Statut |
|---|---|
| Dépôt `Soudaysse-ai/swipe-win` | ✅ Lu intégralement (backend, frontend, SQL, docs). |
| Dépôt `Soudaysse-ai/Yas-game` | ✅ Inspecté : il ne contient que deux archives (`yasgame.bundle`, `yasgamesource.tar.gz`) d'une **version antérieure** du même quiz « Swipe & Win ». `swipe-win` est la version la plus récente → c'est la base retenue. |
| Site en ligne `www.defi-yas.com` | ❌ **Non accessible** depuis l'environnement d'audit (proxy réseau : `CONNECT tunnel failed, 403`). Aucune vérification du site en production n'a pu être faite. |
| Base de production (Neon), hébergement (Render / Vercel), DNS, variables d'environnement réelles | ❌ **Aucun accès**. Les informations ci-dessous viennent de `DEPLOIEMENT.md` et des fichiers `.env.example`. |

**Accès à demander pour finaliser l'audit et migrer sans risque :**
1. Accès lecture à la base PostgreSQL de production (ou un dump récent) pour compter les joueurs existants et valider la migration.
2. Accès aux tableaux de bord Render (backend) et Vercel (frontend) + au DNS de `defi-yas.com`.
3. Confirmation que `www.defi-yas.com` sert bien le frontend de ce dépôt.
4. Un fournisseur SMS (API + identifiants) pour l'OTP des numéros `+269`.

## 2. Stack actuelle

| Couche | Technologie | Remarques |
|---|---|---|
| Frontend | React 18.3, Vite 5, React Router 6, axios, recharts, exceljs | JavaScript (pas de TypeScript), styles **inline**, aucun framework CSS. Une seule SPA pour joueur + admin. |
| Backend | Node.js, Express 4, `pg` (SQL brut), bcryptjs, jsonwebtoken, uuid | CommonJS, JavaScript. Pas de temps réel, pas de tests. |
| Base | PostgreSQL (Neon prévu) | Schéma créé par `seed.js` (`schema.sql`) ; migrations manuelles (`migrate_tiers.sql`, `add_*.sql`) à exécuter à la main. |
| Hébergement | Render (API), Vercel (SPA, `vercel.json` réécrit tout vers `index.html`) | Plan gratuit Render : mise en veille (≈30 s de réveil) — **incompatible avec des WebSockets permanents** (voir §6). |
| Redis | Absent | |

## 3. Fonctionnalités existantes

**Application joueur — « Swipe & gagne »** (quiz Vrai/Faux football) :
- `/` : saisie du numéro `+2694xxxxxx` + case de consentement → `POST /api/auth/subscribe` (crée/retrouve le joueur, **sans mot de passe ni vérification**).
- `/game` : 15 questions, swipe gauche/droite, 30 s par question, score = Σ(10 + bonus vitesse).
- `/game-over` : score, top 10, rang, lots actifs.

**Back-office `/admin`** (JWT, rôles `superadmin` / `editor`) : dashboard (sessions/jour), classements score & rapidité, lots (+ activation globale), questions (CRUD + import en masse), thèmes (un thème actif), joueurs (+ détail), pause du jeu, réinitialisations, export Excel côté navigateur.

**Données** — tables : `admins`, `players`, `questions`, `prizes`, `sessions`, `answers`, `audit_logs`, `settings`.

**Système de points existant** : uniquement le score de quiz par session (meilleur score par joueur). Pas d'XP, pas de niveau, pas de cote.

## 4. Constats de sécurité et de qualité

| # | Gravité | Constat | Fichier |
|---|---|---|---|
| S1 | Critique | Connexion joueur par simple numéro, sans mot de passe ni OTP : n'importe qui peut jouer au nom de n'importe quel numéro. | `routes/auth.js` |
| S2 | Critique | `POST /sessions/start` accepte un `player_id` arbitraire envoyé par le client. | `routes/sessions.js` |
| S3 | Critique | `POST /sessions/:id/answer` accepte `response_time_ms` du client et **n'empêche pas de répondre plusieurs fois à la même question** → le score peut être gonflé à volonté (chaque doublon correct ajoute 10-15 pts). | `routes/sessions.js`, `utils/score.js` |
| S4 | Élevée | Le classement **public** `GET /api/leaderboard` renvoie le **numéro de téléphone** des joueurs. | `routes/leaderboard.js` |
| S5 | Élevée | `DELETE /admin/players/reset` et `/admin/leaderboard/reset` (suppression totale) accessibles à tout admin, y compris `editor`. | `routes/admin.js` |
| S6 | Moyenne | Identifiants admin par défaut documentés (`admin@yas.km / changeme123`) et ré-appliqués à chaque `seed`. | `README.md`, `seed.js` |
| S7 | Moyenne | Messages d'erreur SQL renvoyés tels quels au client (`err.message`). | toutes les routes |
| S8 | Moyenne | Aucun rate limiting ; CORS ouvert à toute origine avec `credentials`. | `index.js` |
| S9 | Faible | Token admin en `localStorage` (exposé en cas de XSS). | `useAdminAuth.jsx` |
| Q1 | — | Aucun test automatisé, aucun runner de migrations, schéma recréé par le seed. | |

## 5. Ce qui est conservé / réutilisé / obsolète

| Élément | Décision |
|---|---|
| Stack React + Vite + Express + PostgreSQL | **Conservée et étendue** (ajout Socket.IO, runner de migrations, tests). Pas de refonte : la stack est adaptée. |
| Composants `YasLogo`, `Plectre`, assets SVG | **Réutilisés** dans la nouvelle interface. |
| Tables `players`, `sessions`, `answers`, `questions`, `prizes`, `settings` | **Conservées telles quelles** (aucune suppression). |
| Comptes joueurs existants (`players.phone`) | **Conservés** : lorsqu'un ancien joueur crée son compte Défi Yas 2.0 avec le même numéro, le nouveau compte est **lié** à l'ancien profil (`users.legacy_player_id`) et son historique de quiz est préservé. |
| Table `admins` | **Adaptée** (nouveaux rôles) : `superadmin → super_admin`, `editor → platform_admin`. |
| Table `audit_logs` | **Réutilisée** et étendue. |
| Quiz « Swipe & gagne » | **Conservé**, déplacé sous `/quiz` (l'ancienne URL `/game` redirige). Candidat à l'obsolescence : décision à prendre par Yas (non supprimé sans autorisation). |
| Pages admin du quiz | Conservées dans une section « Swipe & Win (quiz) » du nouveau back-office. |

## 6. Plan de migration

1. **Sauvegarde** avant toute migration : `pg_dump --format=custom "$DATABASE_URL" > backup_$(date +%F).dump` (script `npm run db:backup`). Neon propose aussi des branches : créer une branche `pre-defi-yas-2` avant migration.
2. **Migrations versionnées** (`backend/src/db/migrations/NNN_*.sql`) appliquées par `npm run migrate`, tracées dans `schema_migrations`. Toutes sont **additives** (création de tables/colonnes, `IF NOT EXISTS`) — aucune donnée existante n'est supprimée.
   - `001_legacy_baseline.sql` : schéma Swipe & Win existant (idempotent, sans effet sur une base déjà en place).
   - `002_platform.sql` : tables Défi Yas 2.0 (utilisateurs, jeux, matchs, progression, social, admin, analytics, tournois).
3. **Staging** : appliquer les migrations sur une copie (branche Neon) et exécuter les tests d'intégration.
4. **Hébergement temps réel** : les WebSockets exigent un service **toujours actif**. Le plan gratuit Render (mise en veille) ne convient pas en production → plan payant Render « Starter » ou équivalent (Railway, Fly.io). Vercel reste adapté au frontend statique.
5. **Mise en production** uniquement après validation explicite de Yas Comores (phase 12).

## 7. Correctifs appliqués à l'existant dans le cadre de cette mise à jour
- S3 : contrainte d'unicité `(session_id, question_id)` sur `answers` + `ON CONFLICT DO NOTHING`.
- S4 : le classement public du quiz ne renvoie plus le numéro de téléphone.
- S5 : réinitialisations réservées au rôle `super_admin`.
- S7 : erreurs génériques côté client, détail uniquement dans les logs serveur.
- S8 : rate limiting sur l'authentification et liste blanche CORS configurable (`CORS_ORIGINS`).
