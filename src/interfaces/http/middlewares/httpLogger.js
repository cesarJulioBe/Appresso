const logger = require('../../../infrastructure/logging/logger').child('Http');

function httpLoggerMiddleware(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const status = res.statusCode;
    const meta = {
      method: req.method,
      route: req.originalUrl,
      status,
      durationMs,
      result: res.locals.transactionResult || 'completed',
    };

    if (status >= 500) {
      logger.error('HTTP request finalizada con error de servidor', meta);
    } else if (status >= 400) {
      logger.warn('HTTP request finalizada con error de cliente', meta);
    } else {
      logger.info('HTTP request completada', meta);
    }
  });

  next();
}

module.exports = httpLoggerMiddleware;
