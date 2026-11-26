/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/middlewares/httpLogger.js
 * CAPA: Interfaces HTTP — Telemetría y Bitácora de Tráfico HTTP
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Medir el tiempo total de procesamiento (`durationMs`) de cada petición HTTP
 *   y registrar una entrada estructurada en Winston cuando Express emite el
 *   evento `'finish'` sobre el flujo de respuesta (`res`), clasificando la
 *   severidad según el código de estado (`info` para 2xx/3xx, `warn` para 4xx
 *   y `error` para 5xx).
 * ============================================================================
 */

const logger = require('../../../infrastructure/logging/logger').child('Http');

function httpLoggerMiddleware(req, res, next) {
  // Capturamos la marca de tiempo exacta en que ingresó la solicitud
  const startedAt = Date.now();

  // Suscribimos un listener que se dispara automáticamente cuando la respuesta HTTP termina de enviarse
  res.on('finish', () => {
    // Calculamos la latencia total en milisegundos
    const durationMs = Date.now() - startedAt;
    const status = res.statusCode;
    // Metadatos estructurados para monitoreo y auditoría
    const meta = {
      method: req.method,
      route: req.originalUrl,
      status,
      durationMs,
      result: res.locals.transactionResult || 'completed',
    };

    // Clasificamos el nivel del log según la familia del código HTTP resultante
    if (status >= 500) {
      logger.error('HTTP request finalizada con error de servidor', meta);
    } else if (status >= 400) {
      logger.warn('HTTP request finalizada con error de cliente', meta);
    } else {
      logger.info('HTTP request completada', meta);
    }
  });

  // Continuamos inmediatamente con el siguiente eslabón del pipeline Express
  next();
}

module.exports = httpLoggerMiddleware;
