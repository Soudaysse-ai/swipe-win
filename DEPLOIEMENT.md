# Déploiement — Défi Yas 2.0

> ⚠️ **Aucune mise en production sans validation explicite de Yas Comores** (phase 12).
> Ce document décrit la procédure ; il n'a pas été exécuté sur l'infrastructure de production
> (aucun accès n'était disponible pendant le développement).

## Architecture d'hébergement recommandée

| Composant | Service | Remarque |
|---|---|---|
| PostgreSQL | Neon (actuel) ou équivalent managé | Activer les sauvegardes automatiques / branches |
| API + WebSocket | Render **plan payant toujours actif** (ou Railway, Fly.io) | Le plan gratuit met le service en veille : incompatible avec les parties en temps réel. **Une seule instance** en V1 (voir docs/ARCHITECTURE.md §8). |
| Frontend | Vercel (actuel) | `vercel.json` : réécriture SPA, cache immuable des assets, en-têtes de sécurité |
| Domaine | `www.defi-yas.com` → frontend ; `api.defi-yas.com` → API (recommandé) | HTTPS / WSS obligatoires |
| E-mails | Resend | Créer une clé API, **vérifier le domaine** d'expédition (ex. `defi-yas.com`, enregistrements DNS SPF/DKIM fournis par Resend), renseigner `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL` |

## Environnements
- **dev** : local (`npm run dev`).
- **staging** : copie (branche Neon) de la base de production + services séparés ; tests
  d'intégration et E2E avant chaque mise en production.
- **production**.

## Variables d'environnement
Backend : voir `backend/.env.example` (obligatoires en production : `DATABASE_URL`,
`JWT_SECRET` ≥ 32 caractères, `CORS_ORIGINS`, `NODE_ENV=production`).
Frontend : `VITE_API_URL=https://api.defi-yas.com`.
E-mails : `RESEND_API_KEY`, `MAIL_FROM` (adresse d'un domaine vérifié dans Resend), `APP_URL=https://www.defi-yas.com`.

## Procédure de mise à jour (base existante Swipe & Win)

1. **Sauvegarde** : `cd backend && DATABASE_URL=… npm run db:backup` (pg_dump au format custom,
   fichier dans `backend/backups/`) **et** création d'une branche Neon `pre-defi-yas-2`.
2. **Staging** : `DATABASE_URL=<branche staging> npm run migrate`, puis tests
   (`npm run test:integration` sur une base de test, `npm run test:e2e` sur le staging).
3. **Migrations en production** : `npm run migrate` (additives, transactionnelles, rejouables,
   verrou consultatif contre les exécutions concurrentes). L'API applique aussi les migrations
   au démarrage.
4. **Premier super admin** : `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed` (ne remplace jamais le
   mot de passe d'un compte existant). Les anciens admins sont convertis : `superadmin → super_admin`,
   `editor → platform_admin`.
5. Déployer l'API (Build `npm ci`, Start `npm start`), vérifier `GET /health`.
6. Déployer le frontend avec `VITE_API_URL`.
7. Vérifications : inscription, « mot de passe oublié » (réception de l'e-mail), partie Connect
   entre deux téléphones, `/admin` (dashboard, activité en direct), export CSV.

### Comptes existants
Les joueurs Swipe & Win n'avaient ni mot de passe ni pseudonyme. Lorsqu'ils créent leur compte
Défi Yas avec le **même numéro**, il est automatiquement lié à leur ancien profil (historique quiz
conservé). Aucune donnée existante n'est supprimée par la migration.

### Retour arrière
- Code : redéployer la version précédente (Render / Vercel gardent l'historique des déploiements).
- Données : les migrations n'ont fait qu'ajouter des tables/colonnes, sauf le renommage des rôles
  administrateur (`superadmin → super_admin`, `editor → platform_admin`) que l'ancienne application
  ne reconnaît pas. Pour revenir entièrement à l'ancienne version, restaurer la sauvegarde :
  `pg_restore --clean --no-owner -d "$DATABASE_URL" backups/backup_….dump` (les parties jouées depuis
  la mise à jour seraient alors perdues : exporter d'abord si nécessaire).

## Exploitation
- Journaux : sortie standard de l'API (erreurs internes détaillées uniquement côté serveur).
- Supervision : `/health`, page **Activité en direct** du back-office (sockets, latence, erreurs,
  déconnexions, parties, files d'attente, mémoire).
- Tâches horaires intégrées : instantanés des classements, cohortes de rétention, levée des
  suspensions expirées, purge des liens de réinitialisation.
- Arrêt / redémarrage : les parties en cours sont restaurées au redémarrage (délai de grâce pour
  que les joueurs se reconnectent).
