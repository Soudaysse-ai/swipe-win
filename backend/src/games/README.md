# Moteurs de jeu

Chaque jeu est un module **pur** (aucun accès réseau ni base de données) qui
implémente la même interface. Le runtime multijoueur (`src/realtime/matchRuntime.js`)
est le seul à les appeler ; il sérialise les actions, gère les chronomètres,
persiste chaque événement et diffuse les vues aux joueurs.

```js
{
  id, rulesVersion, minPlayers, maxPlayers,
  init({ players: [{ userId, seat }], rng, now, config }) -> state
  view(state, viewerId) -> objet envoyé au joueur (informations privées masquées)
  apply(state, userId, action, ctx) -> { state, events }   // lève EngineError si illégal
  deadline(state) -> { at, userIds } | null                 // prochain chronomètre serveur
  timeout(state, ctx) -> { state, events }                  // expiration du chronomètre
  forfeit(state, userId, ctx) -> { state, events }          // abandon / non-retour après déconnexion
  result(state) -> null | { placements: [{ userId, place, outcome, stats }], isDraw, reason }
  actionsCount(state, userId) -> nombre d'actions jouées (validité anti-abus)
}
```

`ctx = { rng, now, config }` : `rng.int(n)` renvoie un entier dans `[0, n)`
(`crypto.randomInt` en production, générateur à graine dans les tests), `now`
est l'horloge du serveur en millisecondes, `config` la configuration du jeu
(table `games.config`). Les moteurs ne lisent jamais `Date.now()` eux-mêmes :
c'est ce qui les rend testables et rejouables.

## Bots d'entraînement

`src/games/bots/<id>.js` fournit un bot par jeu pour le mode « Jouer contre un bot » :
`decide(view, botId, { level, rng, now }) -> null | { action, notBefore?, think? }`. Le bot ne
reçoit que `view(state, botId)` (jamais l'état complet) et renvoie une action ordinaire, validée par
le moteur comme celle d'un joueur. Le runtime la joue après le temps de réflexion `think`.

Pour ajouter un 5ᵉ jeu : créer `src/games/<id>/engine.js`, l'enregistrer dans
`src/games/index.js`, insérer une ligne dans `games` (migration) et ajouter le
composant d'interface côté frontend dans `src/games/<id>/` (et, pour le jeu contre
un bot, `src/games/bots/<id>.js` enregistré dans `src/games/bots/index.js`). Aucun service commun
n'est à modifier.
