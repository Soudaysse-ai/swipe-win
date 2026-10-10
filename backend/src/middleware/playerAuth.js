const { verifyToken } = require('../services/authService');
const { unauthorized } = require('../lib/errors');

// Exige un joueur connecté : req.user = { userId, sessionId, username, avatar }.
function requirePlayer(req, _res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return next(unauthorized());
  verifyToken(token).then((auth) => { req.user = auth; next(); }).catch(next);
}

// Joueur optionnel (pages publiques qui affichent « ma position »).
function optionalPlayer(req, _res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return next();
  verifyToken(token).then((auth) => { req.user = auth; next(); }).catch(() => next());
}

module.exports = { requirePlayer, optionalPlayer };
