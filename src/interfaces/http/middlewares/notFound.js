/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/middlewares/notFound.js
 * CAPA: Interfaces HTTP — Middleware Capturador de Rutas Inexistentes (404)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Interceptar cualquier petición cuya URL y verbo HTTP no coincidieron con
 *   ninguna ruta registrada en `createRoutes`, generando un `NotFoundError`
 *   estándar que será formateado por `errorHandler.js`.
 *
 * CUÁNDO SE DISPARA:
 *   Se ubica en `src/app.js` justo después de `app.use(createRoutes(...))` y
 *   justo antes de `app.use(errorHandlerMiddleware)`.
 * ============================================================================
 */

const { NotFoundError } = require('../../../domain/errors');

function notFoundMiddleware(req, _res, next) {
  // Construye un error operacional 404 indicando el método y la URL exacta solicitada
  next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

module.exports = notFoundMiddleware;
