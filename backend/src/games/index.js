// Registre des moteurs de jeu. Ajouter un jeu = ajouter une ligne ici.
const engines = {
  connect: require('./connect/engine'),
};

function getEngine(gameId) {
  return engines[gameId] || null;
}

function register(engine) {
  engines[engine.id] = engine;
}

module.exports = { getEngine, register, engines };
