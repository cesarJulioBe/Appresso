/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/middlewares/requestContext.js
 * CAPA: Interfaces HTTP — Trazabilidad y Correlación de Peticiones
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Asignar un identificador único (`requestId` UUID v4) a cada petición HTTP
 *   entrante (o reutilizar el encabezado `X-Request-Id` si el cliente lo envía),
 *   devolverlo en la cabecera de respuesta `X-Request-Id` y almacenarlo en
 *   `AsyncLocalStorage` (`runWithContext`) para que todos los logs de Servicios
 *   y Base de Datos incluyan automáticamente el mismo `requestId` sin tener
 *   que pasarlo como parámetro por todas las funciones.
 *
 * CUÁNDO SE DISPARA:
 *   En cada petición HTTP entrante dentro de `src/app.js` antes de las rutas.
 * ============================================================================
 */

const crypto = require('crypto');
const { runWithContext } = require('../../../infrastructure/logging/requestContext');

function requestContextMiddleware(req, res, next) {
  // Leemos si un gateway o cliente externo envió ya un ID de trazabilidad
  const incomingId = req.headers['x-request-id'];
  // Si es válido lo conservamos; de lo contrario generamos un UUID criptográfico nuevo
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0
      ? incomingId.trim()
      : crypto.randomUUID();

  // Guardamos el requestId en `res.locals` para lectura rápida desde `errorHandler`
  res.locals.requestId = requestId;
  // Exponemos el encabezado en la respuesta HTTP para facilitar auditoría y debugging
  res.setHeader('X-Request-Id', requestId);

  // Ejecutamos el resto del ciclo de vida de la petición dentro del contexto asíncrono aislado
  runWithContext({ requestId }, () => {
    next();
  });
}

module.exports = requestContextMiddleware;
