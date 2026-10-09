const assert = require('assert');
const crypto = require('crypto');
const validateTransactionHash = require('./src/domain/fraud/validateTransactionHash');
const { generateTransactionHash, buildCanonicalPayload } = require('./src/domain/fraud/hashUtils');
const getThresholdByTime = require('./src/domain/fraud/getThresholdByTime');

const secret = 'mi_llave_privada_appresso_2026';

console.log('=== Pruebas de Validación de Hash (HMAC-SHA256 Canónico) ===');

// Caso base según la guía Tecnicas_de_resolucion.md
const transaction = {
  idTxn: 10001,
  user: 'aa@aa.com',
  date: '2026-09-23T10:30:01.120',
  value: 50000,
  paymentMethod: 'Tarjeta',
};

// 1. Verificación de payload canónico (sort_keys=True equivalente a Python)
const canonicalPayload = buildCanonicalPayload(transaction);
const expectedCanonicalPayload = '{"date":"2026-09-23T10:30:01.120","idTxn":10001,"paymentMethod":"Tarjeta","user":"aa@aa.com","value":50000}';
assert.strictEqual(canonicalPayload, expectedCanonicalPayload, 'El payload debe tener claves ordenadas alfabéticamente');
console.log('✅ Payload canónico generado correctamente:', canonicalPayload);

// 2. Hash canónico oficial
const canonicalHash = generateTransactionHash(transaction, secret);
assert.strictEqual(typeof canonicalHash, 'string');
assert.strictEqual(canonicalHash.length, 64);
console.log('✅ Hash canónico calculado:', canonicalHash);

// 3. Caso de éxito: transacción con hash canónico válido
const validTxn = { ...transaction, hash: canonicalHash };
assert.strictEqual(validateTransactionHash(validTxn, secret), true, 'Debe ser válido con hash canónico');
console.log('✅ Transacción válida aprobada');

// 4. Determinismo: objeto con claves en orden inverso en JS produce el mismo hash canónico
const shuffledTxn = {
  paymentMethod: 'Tarjeta',
  value: 50000,
  user: 'aa@aa.com',
  idTxn: 10001,
  date: '2026-09-23T10:30:01.120',
  hash: canonicalHash,
};
assert.strictEqual(validateTransactionHash(shuffledTxn, secret), true, 'El orden de inserción de propiedades no debe afectar la validación');
console.log('✅ Claves desordenadas en el cliente validan exitosamente');

// 5. Casos de alteración de integridad (tampering)
const alteredValue = { ...transaction, value: 999999, hash: canonicalHash };
assert.strictEqual(validateTransactionHash(alteredValue, secret), false, 'Debe rechazar valor alterado');

const alteredUser = { ...transaction, user: 'hacker@malicioso.com', hash: canonicalHash };
assert.strictEqual(validateTransactionHash(alteredUser, secret), false, 'Debe rechazar usuario alterado');

const alteredDate = { ...transaction, date: '2026-09-23T10:30:01.999', hash: canonicalHash };
assert.strictEqual(validateTransactionHash(alteredDate, secret), false, 'Debe rechazar fecha alterada');

const alteredId = { ...transaction, idTxn: 99999, hash: canonicalHash };
assert.strictEqual(validateTransactionHash(alteredId, secret), false, 'Debe rechazar idTxn alterado');

const alteredMethod = { ...transaction, paymentMethod: 'Efectivo', hash: canonicalHash };
assert.strictEqual(validateTransactionHash(alteredMethod, secret), false, 'Debe rechazar método alterado');

console.log('✅ Detección de alteración de datos comprobada (todos rechazados)');

// 6. Formatos de hash corruptos o no válidos
assert.strictEqual(validateTransactionHash({ ...transaction, hash: 'hash_invalido' }, secret), false);
assert.strictEqual(validateTransactionHash({ ...transaction, hash: null }, secret), false);
assert.strictEqual(validateTransactionHash({ ...transaction, hash: '' }, secret), false);
assert.strictEqual(validateTransactionHash(null, secret), false);
console.log('✅ Hashes corruptos rechazados con seguridad');

// 7. Retrocompatibilidad: hash legado generado con orden de inserción antiguo
const legacyPayload = JSON.stringify(transaction);
const legacyHash = crypto.createHmac('sha256', secret).update(legacyPayload, 'utf8').digest('hex');
assert.strictEqual(validateTransactionHash({ ...transaction, hash: legacyHash }, secret), true, 'Debe aceptar hash legado por retrocompatibilidad');
console.log('✅ Retrocompatibilidad con hashes legados verificada');

// 8. Error ante secreto no configurado
assert.throws(() => {
  validateTransactionHash(validTxn, null);
}, /HMAC_SECRET no está configurada/, 'Debe lanzar error descriptivo si falta el secreto');
console.log('✅ Validación de secreto requerida comprobada');

// 9. Comprobación de franjas horarias
const thresholds = [
  { franja: 'mañana', hora_inicio: '05:00:01', hora_fin: '12:00:00', umbral_transacciones: 10, ventana_segundos: 3 },
  { franja: 'tarde-noche', hora_inicio: '12:00:01', hora_fin: '20:00:00', umbral_transacciones: 6, ventana_segundos: 3 },
  { franja: 'noche-madrugada', hora_inicio: '20:00:01', hora_fin: '05:00:00', umbral_transacciones: 3, ventana_segundos: 3 },
];

assert.strictEqual(getThresholdByTime(new Date('2026-09-23T08:00:00'), thresholds).franja, 'mañana');
assert.strictEqual(getThresholdByTime(new Date('2026-09-23T15:00:00'), thresholds).franja, 'tarde-noche');
assert.strictEqual(getThresholdByTime(new Date('2026-09-23T23:00:00'), thresholds).franja, 'noche-madrugada');
assert.strictEqual(getThresholdByTime(new Date('2026-09-23T02:00:00'), thresholds).franja, 'noche-madrugada');

console.log('🎉 Todas las pruebas de validación de hash y franjas pasaron exitosamente.');