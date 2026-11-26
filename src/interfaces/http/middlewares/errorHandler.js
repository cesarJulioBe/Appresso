/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/middlewares/errorHandler.js
 * CAPA: Interfaces HTTP — Manejador Centralizado de Errores
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Ser el ÚNICO punto del sistema que traduce excepciones lanzadas en cualquier
 *   capa (`ValidationError` 400, `NotFoundError` 404, `ConflictError` 409,
 *   `ConfigurationError` 500, errores SQL `23505` de clave única en PostgreSQL
 *   o errores inesperados) hacia una respuesta HTTP JSON consistente y segura.
 *
 * BUENAS PRÁCTICAS DE SEGURIDAD Y ARQUITECTURA:
 *   1. Centralización de `23505`: Traduce violaciones de unicidad de PostgreSQL
 *      en un solo lugar hacia HTTP 409 (`DUPLICATE_TRANSACTION`), evitando
 *      bloques `try/catch` repetidos en los servicios.
 *   2. Prevención de fuga de información (*Stack Trace Leak*): Si ocurre un
 *      error inesperado no operacional (`isOperational !== true`), registra el
 *      `stack` internamente en Winston pero al cliente externo solo le devuelve
 *      un mensaje genérico 500 junto con el `requestId`.
 * ============================================================================
 */

const logger = require('../../../infrastructure/logging/logger').child('ErrorHandler');
const { ConflictError } = require('../../../domain/errors');

function errorHandlerMiddleware(err, req, res, _next) {
  let handledError = err;

  // Traducción centralizada del código SQLSTATE '23505' (unique_violation en PostgreSQL)
  if (handledError && handledError.code === '23505') {
    handledError = new ConflictError('Ya existe una transacción con ese idTxn', {
      code: 'DUPLICATE_TRANSACTION',
      resultTag: 'duplicate_transaction',
    });
  }

  // Recuperamos el identificador de correlación asignado por `requestContextMiddleware`
  const requestId = res.locals.requestId;

  // Si el error define una etiqueta semántica de resultado (ej. 'invalid_hash'), la guardamos para `httpLogger`
  if (handledError && handledError.resultTag) {
    res.locals.transactionResult = handledError.resultTag;
  }

  // CASO A: Errores operacionales controlados del Dominio/Aplicación (`AppError` y subclases)
  if (handledError && handledError.isOperational) {
    if (handledError.statusCode >= 500) {
      logger.error(handledError.message, {
        code: handledError.code,
        status: handledError.statusCode,
        route: req.originalUrl,
        method: req.method,
      });
    } else {
      logger.warn(handledError.message, {
        code: handledError.code,
        status: handledError.statusCode,
        details: handledError.details || undefined,
        route: req.originalUrl,
        method: req.method,
      });
    }

    // Formato enriquecido cuando el error incluye un código estructurado (ej. 'VALIDATION_ERROR', 'INVALID_HASH')
    if (handledError.code) {
      const responseBody = {
        error: handledError.code,
        message: handledError.message,
        requestId,
        ...(handledError.details ? { details: handledError.details } : {}),
        ...(handledError.payload ? handledError.payload : {}),
      };
      return res.status(handledError.statusCode).json(responseBody);
    }

    // Formato conciso estándar `{ error: mensaje }` para errores operacionales simples
    return res.status(handledError.statusCode).json({
      error: handledError.message,
    });
  }

  // CASO B: Errores inesperados de programación o infraestructura (fallo de red/disco)
  res.locals.transactionResult = res.locals.transactionResult || 'internal_error';
  logger.error('Error interno no controlado', {
    error: handledError ? handledError.message : 'Unknown error',
    stack: handledError ? handledError.stack : undefined,
    route: req.originalUrl,
    method: req.method,
  });

  // Respondemos HTTP 500 sin exponer detalles sensibles ni trazas internas al cliente
  return res.status(500).json({
    error: 'Error interno del servidor',
    requestId,
  });
}

module.exports = errorHandlerMiddleware;
