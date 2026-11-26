/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/middlewares/asyncHandler.js
 * CAPA: Interfaces HTTP — Middleware Utilitario de Orden Superior
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP) Y PRINCIPIO DRY:
 *   Envolver cualquier método asíncrono de un Controlador para capturar
 *   automáticamente promesas rechazadas (`throw new ValidationError(...)`,
 *   errores de base de datos, etc.) y enviarlas a `next(err)` rumbo al
 *   manejador global `errorHandler.js`.
 *
 * POR QUÉ EVITA MALAS PRÁCTICAS:
 *   Elimina la necesidad de escribir bloques `try { ... } catch (err) { next(err) }`
 *   repetidos dentro de cada uno de los ~40 métodos de los Controladores.
 * ============================================================================
 */

function asyncHandler(fn) {
  // Retorna un middleware compatible con Express `(req, res, next)`
  return function wrappedHandler(req, res, next) {
    // Ejecuta el controlador como promesa; si lanza excepción síncrona o asíncrona, delega a `next`
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
