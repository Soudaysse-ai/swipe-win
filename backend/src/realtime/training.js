// « Jouer contre un bot » : partie d'entraînement immédiate, sans attendre
// d'adversaire. Les bots sont présentés comme tels et la partie ne compte pour
// aucun classement (voir src/games/bots).
const runtime = require('./matchRuntime');
const rooms = require('./rooms');
const matchmaking = require('./matchmaking');
const { getEngine } = require('../games');
const bots = require('../games/bots');
const analytics = require('../services/analytics');
const { AppError } = require('../lib/errors');

async function start(user, gameId, { opponents, level } = {}) {
  const engine = getEngine(gameId);
  const game = await runtime.loadGame(gameId);
  if (!engine || !bots.supports(gameId) || !game?.is_active) throw new AppError(400, 'GAME_UNAVAILABLE', 'Ce jeu n\'est pas disponible');
  if (runtime.userMatchId(user.userId)) throw new AppError(400, 'IN_MATCH', 'Termine d\'abord ta partie en cours');
  if (matchmaking.statusOf(user.userId).state === 'found') throw new AppError(400, 'PENDING_PROPOSAL', 'Une partie t\'attend déjà');
  const count = Math.min(engine.maxPlayers - 1, Math.max(engine.minPlayers - 1, parseInt(opponents, 10) || 1));
  const lvl = bots.LEVELS.includes(level) ? level : 'normal';
  // Quitter la file d'attente et le salon éventuels : on ne joue qu'une partie à la fois.
  matchmaking.leave(user.userId);
  if (rooms.roomOf(user.userId)) await rooms.leave(user.userId);
  const m = await runtime.createMatch({
    gameId, mode: 'bot',
    users: [{ userId: user.userId, username: user.username, avatar: user.avatar }, ...bots.create(count, lvl)],
  });
  analytics.track('training_started', { userId: user.userId, gameId, matchId: m.id, properties: { opponents: count, level: lvl } });
  return { matchId: m.id };
}

module.exports = { start };
