# Swipe & Win — Yas Comores

Quiz football gamifié pour la Coupe du Monde 2026.

## Structure

```
swipe-win/
├── backend/    Node.js + Express + PostgreSQL
└── frontend/   React + Vite (joueur + admin)
```

## Démarrage rapide

### 1. Base de données

Créer une base PostgreSQL puis copier `.env.example` → `.env` :

```bash
cd backend
cp .env.example .env
# Éditer DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run seed      # Crée les tables + insère questions et lot initial
npm run dev       # API sur http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev       # App sur http://localhost:5173
```

### Accès

| URL | Description |
|-----|-------------|
| `http://localhost:5173/` | App joueur |
| `http://localhost:5173/admin` | Back-office admin |
| `http://localhost:5173/admin/login` | Login admin |

Identifiants admin par défaut : `admin@yas.km` / `changeme123`

## Variables d'environnement

### Backend (`backend/.env`)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/swipewin
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@yas.km
ADMIN_PASSWORD=changeme123
PORT=3001
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:3001
```

## Calcul du score

```
score_final = Σ (10 + speed_bonus) pour chaque bonne réponse
speed_bonus = MAX(0, 5 - floor(response_time_ms / 1000))
```

Classement : score décroissant, puis vitesse moyenne croissante à égalité.

## Déploiement

- **Backend** : Railway / Render (Node.js) + PostgreSQL add-on
- **Frontend** : Vercel / Netlify (`npm run build` → dossier `dist/`)
- Mettre à jour `VITE_API_URL` avec l'URL de production du backend
