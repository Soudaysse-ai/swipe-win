# Architecture — Défi Yas 2.0

## 1. Choix techniques

L'audit (docs/AUDIT.md) a montré une stack React + Vite + Express + PostgreSQL adaptée :
elle a été **étendue**, pas remplacée.

| Besoin | Choix | Pourquoi |
|---|---|---|
| Temps réel | Socket.IO 4 | WebSocket avec repli HTTP, accusés de réception, reprise de connexion |
| Données | PostgreSQL + SQL paramétré + migrations versionnées | Base existante conservée ; transactions et contraintes pour l'intégrité des résultats |
| Frontend | React 18 + Vite, CSS sur les tokens officiels Yas | Pas de framework CSS lourd ; jeux et back-office chargés à la demande |
| Rendu des jeux | SVG / DOM (pas de Phaser) | Les 4 jeux sont légers ; bundle initial ≈ 125 Ko gzip, adapté aux téléphones modestes |
| Graphiques admin | Recharts (déjà présent) | |
| Exports | CSV (UTF-8 BOM, « ; ») et Excel (exceljs côté serveur) | |
| Tests | `node:test` (backend), Playwright (E2E) | Aucune dépendance de test supplémentaire côté backend |

TypeScript, Prisma et Redis faisaient partie de l'architecture cible *« si une refonte est
nécessaire »*. Elle ne l'était pas : le code reste en JavaScript (cohérent avec l'existant).
Redis n'est **pas** utilisé en V1 (voir §8).

## 2. Services (backend/src)

| Service (cahier des charges) | Implémentation |
|---|---|
| Authentication | `services/authService.js`, `services/passwordReset.js`, `services/mailer.js` (Resend), `middleware/playerAuth.js`, `middleware/auth.js` (admin) |
| Player Profile | `services/profiles.js`, `routes/player.js` |
| Friends | `services/friends.js`, `routes/social.js` |
| Multiplayer | `realtime/hub.js` (présence), `realtime/rooms.js`, `realtime/socket.js` |
| Matchmaking | `realtime/matchmaking.js` |
| Game Engine | `games/<jeu>/engine.js` (purs) + `realtime/matchRuntime.js` |
| Results / XP / Ranking | `services/results.js`, `services/rating.js`, `services/progression.js`, `services/leaderboards.js`, `services/badges.js` |
| Tournament | `services/tournaments.js` |
| Notification | `services/notifications.js` |
| Analytics | `services/analytics.js`, `services/adminStats.js`, `services/jobs.js` |
| Admin | `routes/admin/*`, `services/moderation.js`, `services/permissions.js`, `services/audit.js` |

Ajouter un 5ᵉ jeu = un moteur + une ligne dans `games/index.js` + une migration `games` +
une interface front : aucun service commun à modifier (voir `games/README.md`).

## 3. Serveur autoritaire

Chaque action suit le parcours exigé :

1. le joueur agit ; 2. le client envoie `match:action { matchId, commandId, version, action }` ;
3. le serveur identifie le joueur (jeton de la socket) ; 4. le moteur valide l'action ;
5. il calcule le nouvel état ; 6. l'événement et l'état sont **enregistrés** (`match_events`,
`matches.state`) dans une transaction ; 7. chaque participant reçoit **sa** vue
(`match:state`, informations privées masquées) et les événements (`game:event`) ;
8. les interfaces se resynchronisent.

- **Idempotence** : un `commandId` déjà vu renvoie `duplicate: true` sans rejouer l'action.
- **Versions** : une commande portant une version périmée est refusée (`STALE_VERSION`) et le
  client reçoit l'état officiel.
- **Sérialisation** : toutes les opérations d'un match (actions, chronomètres, déconnexions)
  passent par une file séquentielle par match.
- **Chronomètres** : définis et déclenchés par le serveur ; les clients affichent des
  échéances calées sur l'horloge serveur (`serverNow`).
- **Aléatoire** : `crypto.randomInt` (dés, mélange, premier joueur) ; graine contrôlée en test.
- **Résultats** : le client ne peut jamais soumettre de résultat. `services/results.js`
  traite la fin de match dans **une transaction idempotente** (la ligne `match_results` sert
  de verrou) : XP, cotes, points de saison, statistiques, badges, détection de collusion.
  Un rattrapage au démarrage retraite les fins de match dont la transaction aurait échoué.

### Cycle de vie d'un match
`READY` (compte à rebours) → `IN_PROGRESS` ⇄ `RECONNECTING` → `COMPLETED` | `CANCELLED`.
`WAITING` correspond au salon en attente de joueurs (table `game_rooms`).

### Reconnexion
Déconnexion → les autres joueurs voient l'indicateur, le match passe en `RECONNECTING`,
délai de grâce `reconnectSeconds` (60 s par défaut, réglable par jeu). Retour → état restauré
(`session:restore`, `match:sync`). Non-retour → forfait. Le temps hors ligne est exclu du
temps de jeu. Tolérance réseau `networkToleranceSeconds` : si le joueur au trait a subi une
coupure reconnue pendant son tour, son chronomètre est prolongé une fois.
Redémarrage du serveur : les matchs en cours sont restaurés depuis `matches.state`
(tour repris avec un chronomètre complet), les salons d'attente sont fermés.

## 4. Protocole WebSocket

Client → serveur (accusé `{ ok, … }` ou `{ ok: false, code, message }`) :
`room:create`, `room:join`, `room:leave`, `room:ready`, `room:start`, `room:list`,
`matchmaking:join|leave|accept|decline`, `match:action`, `match:sync`, `match:resign`,
`chat:send`, `chat:history`, `friend:invite`, `ping`.

Serveur → client : `session:restore`, `room:state`, `room:left`,
`matchmaking:status|found|confirmations|cancelled`, `match:starting`, `match:state`,
`game:event`, `match:ended`, `player:disconnected|reconnected|forfeited`,
`friend:online|offline|request|accepted|invite`, `chat:message|hidden`, `notification:new`.

Limitation de fréquence par événement et par joueur (ex. 6 messages / 10 s dans le chat).

## 5. API REST (principales)

- Auth : `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `POST /api/auth/password/forgot`, `POST /api/auth/password/reset`
- Jeux : `GET /api/games`, `GET /api/games/:id`, `GET /api/home`
- Salons : `POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:code/join`
- Joueurs : `GET /api/players/me`, `/me/stats`, `/me/matches`, `PATCH /api/players/me`, `GET /api/players/:id/public`
- Classements : `GET /api/leaderboards/global`, `/api/leaderboards/:gameId`, `/api/leaderboards/:gameId/me`
- Social : `/api/friends…`, `/api/blocks…`, `POST /api/reports`, `/api/notifications`
- Tournois : `GET /api/tournaments`, `GET /api/tournaments/:id`, `POST|DELETE /api/tournaments/:id/join`
- Admin : `/api/admin/dashboard`, `/players`, `/players/top`, `/games/:id/analytics`, `/engagement`,
  `/realtime`, `/leaderboards`, `/reports/export`, `/matches/review`, `/tournaments…`, `/admins`, `/audit`, `/games`
- Quiz historique : `/api/sessions…`, `/api/questions/random`, `/api/leaderboard`, `/api/admin/quiz/…`

## 6. Données

Migrations : `backend/src/db/migrations` (`001` schéma Swipe & Win existant, `002` plateforme,
`003` données de référence, `004` e-mail et jetons de réinitialisation). Toutes additives et rejouables.

Utilisateurs (`users`, `profiles`, `auth_sessions`, `password_reset_tokens`, `friendships`, `friend_requests`,
`blocked_users`) · Jeux (`games`, `game_rules_versions`, `game_rooms`, `room_players`, `matches`,
`match_players`, `match_events`, `match_results`) · Progression (`player_game_stats`,
`player_global_stats`, `xp_transactions`, `rating_transactions`, `season_points`,
`leaderboard_entries`, `seasons`, `leagues`, `badges`, `player_badges`) · Social (`notifications`,
`chat_messages`, `reports`) · Administration (`admins` étendu, `roles`, `permissions`,
`role_permissions`, `audit_logs`, `moderation_actions`) · Analytics (`analytics_events`,
`presence_sessions`, `daily_user_stats`, `daily_game_stats`, `retention_cohorts`) · Tournois
(`tournaments`, `tournament_players`, `tournament_matches`, `tournament_results`).

Écart assumé avec la liste du cahier des charges : la table existante `admins` est étendue au
lieu de créer `admin_users` ; `season_points` (grand livre des points) et `presence_sessions`
(sessions de connexion) sont ajoutées.

Les XP, points de saison et cotes sont des **grands livres** : une correction ou une annulation
ajoute une écriture compensatoire signée par l'administrateur, rien n'est effacé.

## 7. Sécurité et anti-triche

- Mots de passe bcrypt ; sessions joueur révocables (déconnexion, suspension, réinitialisation).
- Pas de vérification OTP par SMS. Mot de passe oublié : lien envoyé par e-mail via l'API Resend ;
  jeton de 256 bits dont seul le SHA-256 est stocké, usage unique, 30 min, une nouvelle demande
  annule les précédentes, réponse identique que l'adresse existe ou non, sessions fermées après
  réinitialisation. E-mail facultatif (obligatoire avec `EMAIL_REQUIRED=true`) ; le changer exige le
  mot de passe actuel. Sans e-mail : lien remis par le service client depuis le back-office (journalisé).
  La table `otp_codes` (migration 002) n'est plus utilisée.
- Permissions administrateur vérifiées **côté serveur** sur chaque route (6 rôles).
- Limitation de fréquence HTTP (globale, connexion par numéro, mot de passe oublié) et WebSocket ; seuils
  adaptés aux IP partagées des réseaux mobiles (CGNAT).
- Validation de toutes les actions par les moteurs ; dés et mélanges côté serveur ; mains
  adverses jamais envoyées ; choix de penalty masqués jusqu'à la révélation.
- Parties « trop courtes » (abandon / forfait avant 2 actions par joueur) : enregistrées mais
  sans XP, points ni cote. Plafond de 10 matchs comptés par jeu et par jour au classement global.
- Détection de matchs arrangés (≥ 6 matchs entre les mêmes joueurs en 24 h dont ≥ 90 % gagnés par
  le même) → file « Résultats suspects » pour décision humaine.
- Chat filtré, signalements, blocage, masquage par un modérateur.
- Numéro de téléphone jamais exposé publiquement (seul un rôle `players.view_private` le voit).
- Journal d'audit pour toute action sensible, motif obligatoire.
- Exports CSV protégés contre l'injection de formules.

## 8. Limites connues et montée en charge

- **Instance unique** : l'état des parties en cours, des salons et des files d'attente est en
  mémoire du processus (persisté en base pour les parties). Pour plusieurs instances : adaptateur
  Redis de Socket.IO, routage collant par match, files et présence dans Redis. Non nécessaire pour
  la V1 ; à décider après mesure de l'audience réelle.
- Test de charge indicatif (4 vCPU, serveur + base + clients sur la même machine, joueurs
  automatisés jouant sans pause) : 200 clients, ≈ 565 coups/s, 0 erreur, acquittement p50 48 ms /
  p95 384 ms. **Ce n'est pas une capacité de production** : à refaire sur l'infrastructure cible.
- Hébergement : un service toujours actif est nécessaire (les WebSockets ne survivent pas à une mise
  en veille type Render gratuit).
