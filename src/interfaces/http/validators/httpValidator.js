/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/validators/httpValidator.js
 * CAPA: Interfaces HTTP — Validadores de Transporte (Frontera del Protocolo)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP) Y PRINCIPIO DRY (CERO VALIDACIONES REDUNDANTES):
 *
 * En Arquitectura Limpia, separamos estrictamente DOS tipos de validación para
 * nunca repetir el mismo `if` en dos archivos distintos:
 *
 *   1. VALIDACIÓN DE TRANSPORTE HTTP (ESTE ARCHIVO):
 *      Verifica únicamente aspectos propios del protocolo HTTP antes de pasar
 *      al Controlador:
 *        - Que `req.body` sea un objeto JSON válido (no nulo ni primitivo/arreglo).
 *        - Que parámetros numéricos en la URL como `:id` sean enteros positivos.
 *        - Que parámetros de texto en la URL como `:franja` no vengan vacíos.
 *
 *   2. VALIDACIÓN DE REGLAS DE NEGOCIO E INVARIANTES (SERVICIOS / DOMINIO):
 *      Verifica reglas del dominio (estados permitidos de un pedido, stock
 *      suficiente, longitud mínima para regresión lineal, formato de transacción,
 *      umbrales positivos, etc.). Vive UNA SOLA VEZ en la capa de Aplicación/Dominio
 *      para proteger el negocio tanto si se invoca por HTTP como por scripts CLI
 *      o pruebas unitarias.
 *
 * CUÁNDO SE DISPARA:
 *   Express lo ejecuta como middleware en las rutas (`*.routes.js`) justo antes
 *   de invocar el método del Controlador correspondiente.
 * ============================================================================
 */

// Importamos ValidationError para que cualquier fallo de formato HTTP responda 400 Bad Request
// a través del middleware centralizado errorHandler.js.
const { ValidationError } = require('../../../domain/errors');

/**
 * Middleware que garantiza que el cuerpo HTTP (`req.body`) sea un objeto JSON plano.
 * Se dispara en peticiones POST, PUT y PATCH que reciben carga útil en JSON.
 */
function requireJsonBody(req, _res, next) {
  // Verificamos que req.body exista, sea de tipo 'object' y NO sea un arreglo ni null
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(
      new ValidationError('El cuerpo de la petición debe ser un objeto JSON válido')
    );
  }
  // Si el formato HTTP es correcto, cedemos el paso al siguiente middleware o controlador
  return next();
}

/**
 * Fábrica de middlewares reutilizable (DRY) que valida que un parámetro de ruta
 * (por defecto `:id`) sea un número entero positivo seguro.
 *
 * @param {string} paramName Nombre del parámetro en `req.params` (ej. 'id').
 * @returns {Function} Middleware Express `(req, res, next)`.
 */
function requirePositiveIntParam(paramName = 'id') {
  return function validateIntParam(req, _res, next) {
    // Extraemos el valor crudo recibido en la URL (ej. "/orders/42" -> "42")
    const rawValue = req.params?.[paramName];
    // Convertimos a Number y comprobamos que sea entero seguro mayor a cero
    const parsed = Number(rawValue);

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return next(
        new ValidationError(
          `El parámetro de ruta '${paramName}' debe ser un entero positivo válido`
        )
      );
    }

    // Continuamos hacia el controlador sabiendo que el parámetro numérico es íntegro
    return next();
  };
}

/**
 * Fábrica de middlewares reutilizable que valida que un parámetro de texto en la URL
 * (ej. `:franja` en `/fraud/thresholds/:franja`) no esté vacío tras limpiar espacios.
 *
 * @param {string} paramName Nombre del parámetro en `req.params`.
 * @returns {Function} Middleware Express `(req, res, next)`.
 */
function requireTextParam(paramName) {
  return function validateTextParam(req, _res, next) {
    // Obtenemos el valor del parámetro de ruta
    const rawValue = req.params?.[paramName];

    // Validamos que sea cadena no vacía
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      return next(
        new ValidationError(`El parámetro de ruta '${paramName}' es obligatorio`)
      );
    }

    return next();
  };
}

module.exports = {
  requireJsonBody,
  requirePositiveIntParam,
  requireTextParam,
};
