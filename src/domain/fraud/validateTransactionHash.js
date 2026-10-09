const crypto = require('crypto');
const {
  buildCanonicalPayload,
  generateTransactionHash,
  safeCompareHashes,
} = require('./hashUtils');

/**
 * Valida si el hash de una transacción es auténtico y coincide con sus datos.
 * Aplica el estándar de la guía Tecnicas_de_resolucion.md (HMAC-SHA256 con sort_keys).
 *
 * @param {object} transaction Objeto de transacción que incluye hash
 * @param {string} secret Llave secreta compartida (HMAC_SECRET)
 * @returns {boolean} true si el hash es válido y no fue alterado; false si no coincide o es inválido
 */
function validateTransactionHash(transaction, secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('HMAC_SECRET no está configurada o es inválida');
  }

  if (!transaction || typeof transaction !== 'object') {
    return false;
  }

  const { hash } = transaction;
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  // 1. Verificación canónica (estándar de la guía con sort_keys=True)
  const canonicalExpectedHash = generateTransactionHash(transaction, secret);
  if (safeCompareHashes(canonicalExpectedHash, hash)) {
    return true;
  }

  // 2. Fallback de retrocompatibilidad (orden de inserción legado)
  const { idTxn, user, date, value, paymentMethod } = transaction;
  const legacyData = { idTxn, user, date, value, paymentMethod };
  const legacyPayload = JSON.stringify(legacyData);
  const legacyExpectedHash = crypto
    .createHmac('sha256', secret)
    .update(legacyPayload, 'utf8')
    .digest('hex');

  return safeCompareHashes(legacyExpectedHash, hash);
}

module.exports = validateTransactionHash;