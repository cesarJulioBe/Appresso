/**
 * @file hashUtils.js
 * @description Primitivas criptográficas puras para canonización JSON, firma HMAC-SHA256 y comparación en tiempo constante.
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL; utiliza exclusivamente el módulo nativo `crypto`).
 * (b) Responsabilidad única: Validar la llave secreta `HMAC_SECRET`, serializar transacciones en JSON canónico con claves
 *     ordenadas alfabéticamente, calcular firmas HMAC-SHA256 y comparar hashes con `crypto.timingSafeEqual` previniendo ataques
 *     de canal lateral por temporización (timing attacks).
 * (c) Complejidad algorítmica Big-O:
 *     - `assertValidSecret`: $O(1)$ en tiempo y espacio.
 *     - `buildCanonicalPayload`: $O(1)$ en tiempo y espacio respecto al número de transacciones, dado que ordena exactamente
 *       $k = 5$ claves fijas (`date`, `idTxn`, `paymentMethod`, `user`, `value`) y serializa una cadena corta acotada $O(L)$.
 *     - `generateTransactionHash`: $O(1)$ práctico ($O(L)$ sobre los pocos bytes del payload de una transacción).
 *     - `safeCompareHashes`: $O(1)$ estricto e invariante a los datos (compara exactamente 32 bytes / 256 bits sin cortocircuito).
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - `TransactionService.simulate()` (`src/application/fraud/TransactionService.js`): invoca `generateTransactionHash` al
 *       construir y firmar transacciones simuladas (`POST /api/transactions/simulate`).
 *     - `TransactionService.receive()` (`src/application/fraud/TransactionService.js`): indirectamente a través de
 *       `detectAnomaly` -> `validateTransactionHash`, invoca `assertValidSecret`, `generateTransactionHash` y `safeCompareHashes`
 *       al verificar cada transacción recibida (`POST /api/transactions`).
 *     - `OperationalService` (`src/application/operational/OperationalService.js`): indirectamente a través de `hashChain.js`,
 *       reutiliza `safeCompareHashes` al validar comprobantes y auditar cadenas de facturas y pagos.
 */

// Módulo criptográfico nativo del runtime de Node.js respaldado por OpenSSL
const crypto = require('crypto');

/**
 * Verifica como precondición única y centralizada que la llave simétrica `HMAC_SECRET` sea un texto no vacío ($O(1)$).
 * Evita duplicar esta misma cláusula de guarda en múltiples módulos consumidores (`generateTransactionHash`, `validateTransactionHash`).
 *
 * @param {string} secret - Llave secreta compartida para cálculo/verificación HMAC.
 * @throws {Error} Si `secret` está ausente, vacía o no es de tipo `string`.
 */
function assertValidSecret(secret) {
  // Rechaza llaves nulas, indefinidas, vacías ('') o de cualquier tipo distinto a cadena de texto
  if (!secret || typeof secret !== 'string') {
    throw new Error('HMAC_SECRET no está configurada o es inválida');
  }
}

/**
 * Normaliza y serializa los campos de negocio de una transacción en formato JSON canónico determinista ($O(1)$).
 * Equivalente exacto en JavaScript al estándar `json.dumps(transaccion, sort_keys=True, separators=(",", ":"))`:
 * sin espacios tras comas ni dos puntos, y con claves ordenadas lexicográficamente (`date`, `idTxn`, `paymentMethod`, `user`, `value`).
 *
 * @param {object} transaction - Objeto de transacción cuyos atributos serán canonizados (ignora `hash` u otros campos extra).
 * @returns {string} Representación JSON canónica determinista.
 * @throws {TypeError} Si `transaction` es nulo o no es un objeto.
 */
function buildCanonicalPayload(transaction) {
  // Valida que la entrada sea un objeto no nulo antes de desestructurar sus propiedades
  if (!transaction || typeof transaction !== 'object') {
    throw new TypeError('La transacción debe ser un objeto');
  }

  // Extrae exclusivamente los 5 atributos que participan en la firma (excluyendo explícitamente `hash`)
  const { idTxn, user, date, value, paymentMethod } = transaction;
  const data = { idTxn, user, date, value, paymentMethod };

  // Filtra claves con valor `undefined` y ordena los nombres de propiedad alfabéticamente para determinismo absoluto
  const sortedKeys = Object.keys(data)
    .filter((key) => data[key] !== undefined)
    .sort();

  // `JSON.stringify` pasando `sortedKeys` como lista blanca (replacer array) respeta exactamente ese orden sin espacios extra
  return JSON.stringify(data, sortedKeys);
}

/**
 * Genera el código de autenticación de mensaje HMAC-SHA256 en hexadecimal (64 caracteres) para una transacción ($O(1)$).
 *
 * Fórmula criptográfica:
 * $$\text{tag} = \text{HMAC-SHA256}(K, M) = H\Big((K' \oplus \text{opad}) \,\|\, H\big((K' \oplus \text{ipad}) \,\|\, M\big)\Big)$$
 *
 * @param {object} transaction - Datos de la transacción a firmar.
 * @param {string} secret - Llave secreta compartida (`HMAC_SECRET`).
 * @returns {string} Resumen hexadecimal en minúsculas de 64 caracteres (256 bits).
 */
function generateTransactionHash(transaction, secret) {
  // Delega en el validador centralizado la comprobación estricta de `HMAC_SECRET`
  assertValidSecret(secret);
  // Construye el mensaje canónico M invariante al orden de propiedades del JSON recibido
  const payload = buildCanonicalPayload(transaction);
  // Inicializa el contexto HMAC-SHA256 con la llave secreta, alimenta los bytes UTF-8 del payload y emite el digest hex
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

/**
 * Compara dos firmas hexadecimales SHA-256 en tiempo constante estricto $O(1)$ para mitigar ataques de temporización (timing attacks).
 *
 * ¿Por qué no usar `hashA === hashB`?
 * El operador `===` aplica cortocircuito en el primer carácter distinto, filtrando por diferencias de nanosegundos cuántos
 * bytes iniciales adivinó un atacante. `crypto.timingSafeEqual` opera con compuertas XOR acumuladas sobre los 32 bytes completos
 * tardando exactamente el mismo tiempo sin importar si falló el primer bit o el último.
 *
 * @param {string} hashA - Primera firma hexadecimal de 64 caracteres.
 * @param {string} hashB - Segunda firma hexadecimal de 64 caracteres.
 * @returns {boolean} `true` si ambos hashes representan exactamente los mismos 32 bytes; `false` en cualquier otro caso.
 */
function safeCompareHashes(hashA, hashB) {
  // Rechaza inmediatamente valores que no sean cadenas de texto
  if (typeof hashA !== 'string' || typeof hashB !== 'string') {
    return false;
  }
  // Un resumen SHA-256 en hexadecimal consta exactamente de 64 dígitos (256 bits / 4 bits por dígito hex)
  if (hashA.length !== 64 || hashB.length !== 64) {
    return false;
  }
  try {
    // Decodifica ambas cadenas hexadecimales a arreglos binarios crudos de 32 bytes
    const bufA = Buffer.from(hashA, 'hex');
    const bufB = Buffer.from(hashB, 'hex');
    // Si algún string contenía caracteres no hexadecimales (ej. 'zz'), Buffer.from trunca la decodificación y su longitud será < 32
    if (bufA.length !== 32 || bufB.length !== 32) {
      return false;
    }
    // Compara los 32 bytes en tiempo constante independiente de los valores almacenados
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    // Ante cualquier error inesperado de decodificación binaria, falla de manera cerrada retornando `false`
    return false;
  }
}

// Exporta el validador de secreto, el constructor canónico, el generador HMAC y el comparador seguro en tiempo constante
module.exports = {
  assertValidSecret,
  buildCanonicalPayload,
  generateTransactionHash,
  safeCompareHashes,
};
