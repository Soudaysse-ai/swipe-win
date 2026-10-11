class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const bad = (code, message, details) => new AppError(400, code, message, details);
const unauthorized = (message = 'Authentification requise') => new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'Action non autorisée') => new AppError(403, 'FORBIDDEN', message);
const notFound = (message = 'Introuvable') => new AppError(404, 'NOT_FOUND', message);
const conflict = (code, message) => new AppError(409, code, message);

module.exports = { AppError, bad, unauthorized, forbidden, notFound, conflict };
