const crypto = require('crypto');

/**
 * Normaliza y serializa los datos de la transacción en formato JSON canónico.
 * Equivalente exacto a:
 *   json.dumps(transaccion, sort_keys=True, separators=(",", ":"))
 * según lo especificado en Tecnicas_de_resolucion.md (Parte 2).
 */
function buildCanonicalPayload(transaction) {
  if (!transaction || typeof transaction !== 'object') {
    throw new TypeError('La transacción debe ser un objeto');
  }

  const { idTxn, user, date, value, paymentMethod } = transaction;
  const data = { idTxn, user, date, value, paymentMethod };

  // Ordenar claves alfabéticamente para garantizar determinismo absoluto
  const sortedKeys = Object.keys(data)
    .filter(key => data[key] !== undefined)
    .sort();

  return JSON.stringify(data, sortedKeys);
}

/**
 * Genera el HMAC-SHA256 en formato hexadecimal para los datos dados.
 */
function generateTransactionHash(transaction, secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('HMAC_SECRET no está configurada o es inválida');
  }
  const payload = buildCanonicalPayload(transaction);
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

/**
 * Comparación segura contra ataques de temporización (timing attacks).
 */
function safeCompareHashes(hashA, hashB) {
  if (typeof hashA !== 'string' || typeof hashB !== 'string') {
    return false;
  }
  if (hashA.length !== 64 || hashB.length !== 64) {
    return false;
  }
  try {
    const bufA = Buffer.from(hashA, 'hex');
    const bufB = Buffer.from(hashB, 'hex');
    if (bufA.length !== 32 || bufB.length !== 32) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

module.exports = {
  buildCanonicalPayload,
  generateTransactionHash,
  safeCompareHashes,
};
