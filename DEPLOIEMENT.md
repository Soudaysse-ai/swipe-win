# Déploiement — Swipe & Win Yas Comores

Application gamifiée (quiz football / Coupe du Monde 2026).

## Architecture

- **frontend/** — React 18 + Vite (site statique après `npm run build`). Styles inline, pas de framework CSS.
- **backend/** — Node.js + Express, PostgreSQL (driver `pg`), auth admin via JWT.
- **Base de données** — PostgreSQL (tables : admins, players, questions, prizes, sessions, answers, audit_logs, settings).

## Plan de déploiement (le moins cher possible)

| Composant | Service recommandé | Coût |
|---|---|---|
| Base PostgreSQL | **Neon** (neon.tech) | Gratuit |
| Backend (API Node) | **Render** (render.com) | Gratuit |
| Frontend (statique) | **Vercel** (vercel.com) | Gratuit |
| Nom de domaine | Namecheap / Cloudflare | ~10-12 €/an |

Tous reliés via le dépôt GitHub : https://github.com/Soudaysse-ai/swipe-win

---

## Variables d'environnement

### Backend (`backend/.env` en local, ou variables Render en prod)
```
DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require
JWT_SECRET=<longue chaîne secrète aléatoire>
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@yas.km
ADMIN_PASSWORD=<mot de passe admin>
PORT=3001
NODE_ENV=production
```
> Le pool PostgreSQL active le SSL automatiquement si `NODE_ENV=production` ou si l'URL contient `sslmode=require` (voir `backend/src/db/pool.js`).

### Frontend (variable Vercel)
```
VITE_API_URL=https://<ton-service>.onrender.com
```
> Le frontend appelle `VITE_API_URL + '/api'` (voir `frontend/src/utils/api.js`). Si vide → utilise le proxy local Vite (dev seulement).

---

## Étapes

### 0. Pousser sur GitHub
```bash
cd swipe-win
git init        # si pas déjà fait
git add -A
git commit -m "Initial"
git remote add origin https://github.com/Soudaysse-ai/swipe-win.git
git branch -M main
git push -u origin main
```
Authentification : token GitHub (Personal Access Token classic, scope `repo`) comme mot de passe.

### 1. Base de données — Neon
1. Créer un compte sur neon.tech, créer un projet PostgreSQL.
2. Copier la **connection string** (`postgresql://...?sslmode=require`) → ce sera `DATABASE_URL`.

### 2. Backend — Render
1. render.com → **New → Web Service** → connecter le dépôt GitHub.
2. Réglages :
   - **Root Directory** : `backend`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
3. Ajouter les variables d'environnement (voir ci-dessus).
4. Déployer. Noter l'URL (ex: `https://swipe-win-api.onrender.com`).
5. **Initialiser la base** (créer tables + admin + questions) :
   - Via le **Shell** Render : `npm run seed`
   - OU en local pointant sur Neon : `cd backend && DATABASE_URL="..." npm run seed`

### 3. Frontend — Vercel
1. vercel.com → importer le dépôt GitHub.
2. **Root Directory** : `frontend`
3. Variable : `VITE_API_URL` = l'URL Render de l'étape 2.
4. Déployer.

### 4. Domaine
1. Acheter le domaine (Namecheap / Cloudflare).
2. Dans Vercel → **Settings → Domains** → ajouter le domaine et suivre les enregistrements DNS indiqués.

---

## Vérifications post-déploiement
```bash
# API en ligne
curl https://<service>.onrender.com/health        # -> {"ok":true}

# Lots actifs
curl https://<service>.onrender.com/api/prizes/active

# Login admin
curl -X POST https://<service>.onrender.com/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@yas.km","password":"<mot de passe>"}'
```
- Jeu joueur : `https://<domaine>/`
- Back-office : `https://<domaine>/admin`

## Notes
- Le plan gratuit Render met le service en veille après inactivité (premier appel ~30 s à réveiller).
- Charte graphique : jaune #FFD100, bleu #00377D, police Figtree. Pas d'orange.
- Option « Distribuer des lots » dans le back-office (table `settings`, clé `prizes_enabled`).
