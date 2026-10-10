# Défi Yas 2.0 — plateforme de jeux multijoueurs Yas Comores

Mise à jour majeure de `www.defi-yas.com` (anciennement le quiz « Swipe & Win ») :
une plateforme de jeux sociaux mobile-first où les joueurs s'affrontent en temps
réel, progressent, montent dans les classements et participent à des tournois, avec
un back-office complet pour Yas Comores.

| Jeu | Joueurs | Principe |
|---|---|---|
| **Yas Cards** | 2–4 | Jeu de défausse original (108 cartes, +4 contestable, « Dernière carte ») |
| **Yas Connect** | 2 | Aligner 4 jetons sur une grille 7 × 6 |
| **Yas Penalty** | 2 | Tirs au but : choix simultanés tireur / gardien |
| **Yas Ludo** | 2–4 | Plateau classique, 4 pions, dés serveur |

Le quiz historique **Swipe & gagne** est conservé (`/quiz`).

## Structure

```
backend/    Node.js 22 · Express · Socket.IO · PostgreSQL (SQL + migrations versionnées)
  src/games/        moteurs de jeu purs (un dossier par jeu)
  src/realtime/     runtime multijoueur autoritaire, salons, matchmaking, présence
  src/services/     résultats, cotes, classements, amis, chat, tournois, analytics, modération…
  src/routes/       API REST (joueur, admin, quiz historique)
  src/db/migrations migrations SQL additives
  test/             tests unitaires et d'intégration (vraie base + vrais clients Socket.IO)
  scripts/          sauvegarde de la base, test de charge
frontend/   React 18 · Vite · React Router · socket.io-client · Recharts
  src/player/       application joueur (pages, contextes temps réel)
  src/games/        interfaces des 4 jeux (chargées à la demande)
  src/admin/        back-office « Centre de contrôle Yas » (chargé à la demande)
  e2e/              tests Playwright (plusieurs téléphones simulés)
docs/       audit, architecture, règles, déploiement, rapport des phases
```

## Démarrage local

Prérequis : Node.js ≥ 20, PostgreSQL ≥ 14.

```bash
# API
cd backend
cp .env.example .env            # renseigner DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD
npm install
npm run seed                    # applique les migrations + crée le premier super admin
npm run dev                     # http://localhost:3001

# Application
cd ../frontend
npm install
npm run dev                     # http://localhost:5173 (proxy /api et /socket.io → :3001)
```

| URL | |
|---|---|
| `http://localhost:5173/` | Application joueur (inscription par numéro +269) |
| `http://localhost:5173/admin` | Back-office (identifiants du `.env` : `ADMIN_EMAIL` / `ADMIN_PASSWORD`) |
| `http://localhost:5173/quiz` | Quiz Swipe & gagne |

En développement, les codes OTP sont écrits dans les logs de l'API (`SMS_PROVIDER=console`).

## Tests

```bash
cd backend
npm test                        # 76 tests unitaires (moteurs, cotes, progression, filtres…)
TEST_DATABASE_URL=postgresql://…/defiyas_test npm run test:integration   # 21 tests (base de test effacée !)
PAIRS=100 DURATION=30 node scripts/loadtest.js                          # test de charge indicatif

cd frontend
npm run test:e2e                # API sur :3001 + `npm run dev` requis
```

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute les tests backend sur
PostgreSQL 16 et le build du frontend.

## Documentation

- [`docs/AUDIT.md`](docs/AUDIT.md) — audit de l'existant et plan de migration
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture, temps réel, données, sécurité
- [`docs/REGLES.md`](docs/REGLES.md) — règles implémentées, progression, classements
- [`DEPLOIEMENT.md`](DEPLOIEMENT.md) — mise en production, migration, retour arrière
- [`docs/RAPPORT-PHASES.md`](docs/RAPPORT-PHASES.md) — rapport par phase, tests, points ouverts
- [`backend/src/games/README.md`](backend/src/games/README.md) — ajouter un 5ᵉ jeu
- Chartes graphiques : `CHARTE-GRAPHIQUE-YAS.md`, `CHARTE-GRAPHIQUE-YAS-COMPLETE.md`
