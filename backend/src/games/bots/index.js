// Bots des parties d'entraînement (« Jouer contre un bot »).
//
// Un bot n'est pas un compte joueur : il n'existe que dans la partie, il est
// présenté comme tel (nom « Bot … », avatar robot) et la partie ne compte pour
// aucun classement. Il joue avec exactement les informations d'un joueur humain :
// `engine.view(state, botId)` (vue publique + sa propre main), jamais l'état complet.
//
// decide(view, botId, { level, rng, now }) -> null | {
//   action,               // action envoyée au moteur, comme celle d'un joueur
//   notBefore?,           // horodatage avant lequel l'action est refusée (ex. tir pas encore ouvert)
//   think?: [min, max],   // temps de réflexion simulé, en millisecondes
// }
const BOTS = {
  connect: require('./connect'),
  ludo: require('./ludo'),
  cards: require('./cards'),
  penalty: require('./penalty'),
  foot: require('./foot'),
};

const LEVELS = ['easy', 'normal', 'hard'];
// Les îles des Comores : des noms courts, sans ambiguïté avec un vrai joueur.
const NAMES = ['Bot Ngazidja', 'Bot Mwali', 'Bot Ndzuani'];
const AVATAR = 'bot';

const isBotId = (id) => typeof id === 'string' && id.startsWith('bot:');

function create(count, level) {
  return Array.from({ length: count }, (_, i) => ({
    userId: `bot:${i + 1}`, username: NAMES[i % NAMES.length], avatar: AVATAR, isBot: true, level,
  }));
}

function supports(gameId) {
  return !!BOTS[gameId];
}

function decide(gameId, view, botId, opts) {
  const bot = BOTS[gameId];
  return bot ? bot.decide(view, botId, opts) : null;
}

module.exports = { LEVELS, NAMES, isBotId, create, supports, decide };
