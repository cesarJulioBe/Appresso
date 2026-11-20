const { NotFoundError } = require('../../../domain/errors');

function notFoundMiddleware(req, _res, next) {
  next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

module.exports = notFoundMiddleware;
