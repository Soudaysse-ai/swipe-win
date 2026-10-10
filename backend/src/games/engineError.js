// Erreur levée par un moteur de jeu quand une action est illégale.
class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
module.exports = { EngineError };
