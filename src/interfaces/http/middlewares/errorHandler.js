const logger = require('../../../infrastructure/logging/logger').child('ErrorHandler');
const { ConflictError } = require('../../../domain/errors');

function errorHandlerMiddleware(err, req, res, _next) {
  let handledError = err;

  if (handledError && handledError.code === '23505') {
    handledError = new ConflictError('Ya existe una transacción con ese idTxn', {
      code: 'DUPLICATE_TRANSACTION',
      resultTag: 'duplicate_transaction',
    });
  }

  const requestId = res.locals.requestId;

  if (handledError && handledError.resultTag) {
    res.locals.transactionResult = handledError.resultTag;
  }

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

    return res.status(handledError.statusCode).json({
      error: handledError.message,
    });
  }

  res.locals.transactionResult = res.locals.transactionResult || 'internal_error';
  logger.error('Error interno no controlado', {
    error: handledError ? handledError.message : 'Unknown error',
    stack: handledError ? handledError.stack : undefined,
    route: req.originalUrl,
    method: req.method,
  });

  return res.status(500).json({
    error: 'Error interno del servidor',
    requestId,
  });
}

module.exports = errorHandlerMiddleware;
