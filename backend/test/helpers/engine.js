// Utilitaires de test des moteurs : horloge et rng contrôlés.
const { seededRng, scriptedRng } = require('../../src/lib/rng');

function ctx({ now = 1_000_000, config = {}, rng = seededRng(42) } = {}) {
  return { now, rng, config };
}

// Applique une action et renvoie le nouvel état (échoue le test si illégal).
function play(engine, state, userId, action, c) {
  return engine.apply(state, userId, action, c).state;
}

module.exports = { ctx, play, seededRng, scriptedRng };
