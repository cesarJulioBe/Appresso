/**
 * @file validateTransactionHash.js
 * @description Verificador de autenticidad e integridad criptográfica HMAC-SHA256 para transacciones entrantes.
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL; emplea únicamente `crypto` nativo y `hashUtils.js`).
 * (b) Responsabilidad única: Comprobar si el `hash` adjunto en una transacción coincide en tiempo constante con el
 *     HMAC-SHA256 esperado bajo el estándar canónico de claves ordenadas (`sort_keys=True`) o, por retrocompatibilidad,
 *     con el orden fijo legado de inserción.
 * (c) Complejidad algorítmica Big-O:
 *     - Tiempo: $O(1)$ respecto al volumen de transacciones (calcula a lo sumo dos firmas HMAC-SHA256 sobre 5 campos escalares
 *       y ejecuta `safeCompareHashes` sobre 32 bytes fijos sin ramificaciones dependientes del secreto).
 *     - Espacio: $O(1)$ (buffers temporales fijos de 32 bytes y cadenas hexadecimales de 64 caracteres).
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - `TransactionService.receive()` y `TransactionService.simulate()` (`src/application/fraud/TransactionService.js`),
 *       invocado a través de `detectAnomaly` (`src/domain/fraud/detectAnomaly.js`) cada vez que se evalúa la integridad
 *       de una transacción financiera (`POST /api/transactions` y `POST /api/transactions/simulate`).
 */

// Módulo criptográfico nativo para el cálculo de respaldo (fallback legado) con HMAC-SHA256
const crypto = require('crypto');
// Reutiliza las utilidades centralizadas de `hashUtils` evitando duplicar la validación de `HMAC_SECRET`
const {
  assertValidSecret,
  generateTransactionHash,
  safeCompareHashes,
} = require('./hashUtils');

/**
 * Valida si el hash de una transacción es auténtico y coincide íntegramente con sus datos de negocio.
 *
 * Flujo de verificación en dos etapas ($O(1)$):
 * 1. Valida `secret` delegando en `assertValidSecret(secret)` (única fuente de verdad para el error de configuración).
 * 2. Verifica estructura mínima de `transaction` y presencia de `transaction.hash` (retornando `false` si son nulos/inválidos).
 * 3. Evalúa coincidencia contra el hash canónico (`generateTransactionHash` con claves ordenadas alfabéticamente).
 * 4. Si no coincide, evalúa coincidencia de retrocompatibilidad contra el orden histórico `{ idTxn, user, date, value, paymentMethod }`.
 *
 * @param {object} transaction - Objeto de transacción que incluye el atributo `hash` recibido.
 * @param {string} secret - Llave secreta simétrica compartida (`HMAC_SECRET`).
 * @returns {boolean} `true` si la firma es auténtica y ningún campo fue alterado; `false` si fue adulterada o es malformada.
 * @throws {Error} Si `secret` no está configurada o no es un string válido.
 */
function validateTransactionHash(transaction, secret) {
  // Delega en `hashUtils.assertValidSecret` para garantizar precondición de seguridad sin repetir el condicional en dos archivos
  assertValidSecret(secret);

  // Si la transacción recibida es nula, indefinida o primitiva, no puede tener firma válida y retorna `false` de forma segura
  if (!transaction || typeof transaction !== 'object') {
    return false;
  }

  // Extrae la firma declarada por el emisor y verifica que sea una cadena no vacía antes de calcular HMACs
  const { hash } = transaction;
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  // 1. Verificación primaria canónica (claves ordenadas alfabéticamente: date, idTxn, paymentMethod, user, value)
  const canonicalExpectedHash = generateTransactionHash(transaction, secret);
  // Compara en tiempo constante O(1) con `crypto.timingSafeEqual` para impedir ataques de temporización
  if (safeCompareHashes(canonicalExpectedHash, hash)) {
    return true;
  }

  // 2. Fallback de retrocompatibilidad para emisores legados que serializaron en el orden fijo de declaración de campos
  const { idTxn, user, date, value, paymentMethod } = transaction;
  const legacyData = { idTxn, user, date, value, paymentMethod };
  const legacyPayload = JSON.stringify(legacyData);
  const legacyExpectedHash = crypto
    .createHmac('sha256', secret)
    .update(legacyPayload, 'utf8')
    .digest('hex');

  // Retorna el resultado de comparar en tiempo constante el digest legado contra el hash recibido
  return safeCompareHashes(legacyExpectedHash, hash);
}

// Exporta el verificador de autenticidad HMAC de transacciones
module.exports = validateTransactionHash;
