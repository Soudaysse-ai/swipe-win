const jwt = require('jsonwebtoken');

function authMiddleware(requiredRole) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
      || req.cookies?.token;

    if (!token) return res.status(401).json({ error: 'Token manquant' });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.admin = payload;

      if (requiredRole === 'superadmin' && payload.role !== 'superadmin') {
        return res.status(403).json({ error: 'Accès réservé aux superadmins' });
      }

      next();
    } catch {
      res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  };
}

module.exports = authMiddleware;
