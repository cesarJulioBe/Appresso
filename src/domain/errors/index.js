/**
 * @file index.js (Errores de Dominio)
 * @description Jerarquía de excepciones operacionales tipadas para desacoplar las reglas de negocio del transporte HTTP.
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL).
 * (b) Responsabilidad única: Modelar fallos esperados de negocio y configuración mediante clases semánticas
 *     (`AppError`, `ValidationError`, `NotFoundError`, `ConflictError`, `ConfigurationError`) con metadatos estructurados.
 * (c) Complejidad algorítmica Big-O:
 *     - Instanciación de cualquier clase de error: $O(1)$ en tiempo y espacio para la asignación de atributos
 *       (más el costo interno constante/acotado del motor V8 al capturar los marcos del stack trace con `Error.captureStackTrace`).
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - `TransactionService` (`receive`, `simulate`): lanza `ValidationError` (datos o firma HMAC inválida),
 *       `ConflictError` (`idTxn` duplicado) y `ConfigurationError` (`HMAC_SECRET` ausente) al procesar transacciones.
 *     - `OrderService` (`create`, `getById`, `updateStatus`, `undoLastChange`): lanza `ValidationError` y `NotFoundError`.
 *     - `QueueService` (`attendNext`): lanza `NotFoundError` cuando se intenta atender una cola sin pedidos pendientes.
 *     - `RouteService` (`calculateRoute`, `create`, `delete`): lanza `ValidationError` y `NotFoundError` (ruta inexistente).
 *     - `AnalyticsService` (`predictSales`): lanza `ValidationError` si el historial tiene menos de 2 registros.
 *     - `ThresholdService` (`update`): lanza `ValidationError` y `NotFoundError` al actualizar franjas horarias.
 *     - `OperationalService` (usuarios, categorías, ítems, pedidos, facturas, pagos): lanza `ValidationError` y `NotFoundError`.
 */

/**
 * Clase base para todos los errores operacionales controlados de la plataforma Appresso.
 * Extiende la clase nativa `Error` de JavaScript enriqueciéndola con código semántico y metadatos de diagnóstico.
 */
class AppError extends Error {
  /**
   * Construye un error operacional enriquecido.
   *
   * @param {string} message - Mensaje legible que explica la causa del fallo.
   * @param {object} [options={}] - Metadatos opcionales del error.
   * @param {number} [options.statusCode=500] - Código semántico sugerido para traducción en adaptadores de salida (ej. HTTP).
   * @param {string|null} [options.code=null] - Código interno legible por máquina (ej. 'VALIDATION_ERROR', 'INVALID_HASH').
   * @param {*} [options.details=null] - Arreglo u objeto con el detalle granular de campos fallidos.
   * @param {*} [options.payload=null] - Carga útil adjunta (ej. registro auditado antes de rechazar una transacción con hash inválido).
   * @param {string|null} [options.resultTag=null] - Etiqueta corta para trazabilidad en logs estructurados y métricas.
   */
  constructor(
    message,
    { statusCode = 500, code = null, details = null, payload = null, resultTag = null } = {}
  ) {
    // Invoca al constructor de la clase nativa Error asignando la propiedad estándar `this.message`
    super(message);
    // Establece dinámicamente el nombre exacto de la subclase (ej. 'ValidationError') en lugar del genérico 'Error'
    this.name = this.constructor.name;
    // Guarda el código numérico asociado a la categoría del fallo (400, 404, 409, 500)
    this.statusCode = statusCode;
    // Guarda el identificador simbólico de error para clientes consumidores de la API
    this.code = code;
    // Almacena los detalles adicionales (por ejemplo, lista de errores de validación por campo)
    this.details = details;
    // Conserva datos de contexto que el caso de uso necesite devolver junto con el rechazo controlado
    this.payload = payload;
    // Registra la etiqueta clasificadora del resultado para observabilidad
    this.resultTag = resultTag;
    // Marca explícitamente el error como operacional (previsto por el dominio) para distinguirlo de bugs inesperados (programación)
    this.isOperational = true;
    // Captura la traza de pila en V8 omitiendo el propio constructor para apuntar directamente al lugar donde se hizo `throw`
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error lanzado cuando los datos de entrada violan invariantes de dominio, tipos, rangos o firmas criptográficas (400).
 */
class ValidationError extends AppError {
  constructor(message, options = {}) {
    // Delega en AppError fijando por defecto el código 400 (solicitud inválida), permitiendo sobrescritura vía `options`
    super(message, { statusCode: 400, ...options });
  }
}

/**
 * Error lanzado cuando una entidad, ruta entre ciudades, franja horaria o acción a deshacer no existe (404).
 */
class NotFoundError extends AppError {
  constructor(message, options = {}) {
    // Delega en AppError fijando por defecto el código 404 (recurso no encontrado)
    super(message, { statusCode: 404, ...options });
  }
}

/**
 * Error lanzado cuando una operación entra en conflicto con el estado actual, como un `idTxn` duplicado (409).
 */
class ConflictError extends AppError {
  constructor(message, options = {}) {
    // Delega en AppError fijando por defecto el código 409 (conflicto de unicidad o estado)
    super(message, { statusCode: 409, ...options });
  }
}

/**
 * Error lanzado cuando falta un parámetro crítico de seguridad o entorno, como `HMAC_SECRET` (500).
 */
class ConfigurationError extends AppError {
  constructor(message, options = {}) {
    // Delega en AppError fijando por defecto el código 500 (error interno de configuración)
    super(message, { statusCode: 500, ...options });
  }
}

// Exporta toda la familia de errores de dominio para ser utilizada por servicios de aplicación
module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ConfigurationError,
};
