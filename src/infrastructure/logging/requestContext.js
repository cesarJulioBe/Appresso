/**
 * @file requestContext.js
 * @description Almacén de contexto asíncrono por petición HTTP basado en `AsyncLocalStorage` de Node.js.
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Observabilidad y Trazabilidad Transversal).
 * - (b) Responsabilidad única (SRP): Mantener aislado el contexto de ejecución de cada petición concurrente
 *       (especialmente su `requestId` de correlación) a lo largo de toda la cadena de promesas (`async/await`),
 *       sin contaminar las firmas de los controladores, servicios de dominio ni repositorios.
 * - (c) Quién lo dispara / invoca:
 *       1. `src/interfaces/http/middlewares/requestContext.js` invoca `runWithContext({ requestId }, () => next())`
 *          al ingresar cada petición Express.
 *       2. `src/infrastructure/logging/logger.js` invoca `getContext()` en cada evento de log para estampar el `requestId`.
 *       3. Middlewares o utilidades de diagnóstico que consultan `getRequestId()`.
 * - (d) Buenas prácticas aplicadas:
 *       - Uso nativo de `AsyncLocalStorage` (`async_hooks`), equivalente moderno y seguro en Node.js al *Thread-Local Storage* (MDC).
 *       - Retorno defensivo (`{}` en `getContext`) cuando se invoca fuera del ciclo de vida de una petición HTTP
 *         (ej. tareas de arranque, migraciones o scripts CLI).
 */

// Importa la primitiva nativa de Node.js que propaga estado automáticamente a través de operaciones asíncronas encadenadas
const { AsyncLocalStorage } = require('async_hooks');

// Crea la instancia única del almacén de contexto aislado por árbol de ejecución asíncrona
const storage = new AsyncLocalStorage();

/**
 * Ejecuta una función (`fn`) dentro de un ámbito asíncrono aislado asociándole el objeto `context` indicado.
 * Cualquier promesa, callback o consulta SQL disparada dentro de `fn` podrá leer este mismo `context`.
 *
 * @param {object} context - Diccionario de metadatos de la petición actual (ej. `{ requestId: '...' }`).
 * @param {Function} fn - Función callback (síncrona o asíncrona) que se ejecutará bajo dicho contexto.
 * @returns {*} El valor de retorno producido por la invocación de `fn()`.
 */
function runWithContext(context, fn) {
  // Vincula el objeto 'context' al ciclo asíncrono de 'fn' y retorna su resultado
  return storage.run(context, fn);
}

/**
 * Obtiene el objeto de contexto activo en el flujo asíncrono actual.
 * Si se llama fuera de `runWithContext` (ej. durante el arranque del servidor), retorna un objeto vacío seguro.
 *
 * @returns {object} Objeto de contexto actual o `{}` si no existe contexto activo.
 */
function getContext() {
  // Lee la tienda actual de AsyncLocalStorage garantizando siempre un objeto iterable mediante '|| {}'
  return storage.getStore() || {};
}

/**
 * Extrae directamente el identificador único de trazabilidad (`requestId`) de la petición HTTP en curso.
 *
 * @returns {string|undefined} El UUID/identificador de la petición activa, o `undefined` fuera de un contexto HTTP.
 */
function getRequestId() {
  // Recupera la referencia directa al almacén asociado a la ejecución actual
  const store = storage.getStore();
  // Si existe tienda activa retorna su propiedad requestId; de lo contrario retorna undefined explícitamente
  return store ? store.requestId : undefined;
}

// Exporta las utilidades públicas de gestión y lectura del contexto de correlación por petición
module.exports = {
  // Inicia un nuevo ámbito asíncrono con contexto aislado
  runWithContext,
  // Recupera el diccionario completo del contexto activo
  getContext,
  // Obtiene únicamente el requestId activo si existe
  getRequestId,
};
