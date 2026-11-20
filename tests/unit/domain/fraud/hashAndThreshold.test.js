const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const validateTransactionHash = require('../../../../src/domain/fraud/validateTransactionHash');
const {
  generateTransactionHash,
  buildCanonicalPayload,
} = require('../../../../src/domain/fraud/hashUtils');
const getThresholdByTime = require('../../../../src/domain/fraud/getThresholdByTime');

describe('Domain - Fraud: HMAC-SHA256 Hash & Time Thresholds', () => {
  const secret = 'test_secret_key_for_unit_tests';
  const transaction = {
    idTxn: 10001,
    user: 'aa@aa.com',
    date: '2026-09-23T10:30:01.120',
    value: 50000,
    paymentMethod: 'Tarjeta',
  };

  it('builds deterministic canonical JSON payload with alphabetically sorted keys', () => {
    const canonicalPayload = buildCanonicalPayload(transaction);
    const expected =
      '{"date":"2026-09-23T10:30:01.120","idTxn":10001,"paymentMethod":"Tarjeta","user":"aa@aa.com","value":50000}';
    assert.equal(canonicalPayload, expected);
  });

  it('validates canonical HMAC-SHA256 hash regardless of key order', () => {
    const canonicalHash = generateTransactionHash(transaction, secret);
    assert.equal(canonicalHash.length, 64);

    assert.equal(validateTransactionHash({ ...transaction, hash: canonicalHash }, secret), true);

    const shuffledTxn = {
      paymentMethod: 'Tarjeta',
      value: 50000,
      user: 'aa@aa.com',
      idTxn: 10001,
      date: '2026-09-23T10:30:01.120',
      hash: canonicalHash,
    };
    assert.equal(validateTransactionHash(shuffledTxn, secret), true);
  });

  it('rejects tampered fields and malformed hashes', () => {
    const canonicalHash = generateTransactionHash(transaction, secret);

    assert.equal(validateTransactionHash({ ...transaction, value: 999999, hash: canonicalHash }, secret), false);
    assert.equal(validateTransactionHash({ ...transaction, user: 'hacker@mal.com', hash: canonicalHash }, secret), false);
    assert.equal(validateTransactionHash({ ...transaction, date: '2026-09-23T10:30:01.999', hash: canonicalHash }, secret), false);
    assert.equal(validateTransactionHash({ ...transaction, idTxn: 99999, hash: canonicalHash }, secret), false);
    assert.equal(validateTransactionHash({ ...transaction, paymentMethod: 'Efectivo', hash: canonicalHash }, secret), false);

    assert.equal(validateTransactionHash({ ...transaction, hash: 'hash_invalido' }, secret), false);
    assert.equal(validateTransactionHash({ ...transaction, hash: null }, secret), false);
    assert.equal(validateTransactionHash(null, secret), false);
  });

  it('supports backward-compatible legacy insertion-order hash', () => {
    const legacyPayload = JSON.stringify(transaction);
    const legacyHash = crypto.createHmac('sha256', secret).update(legacyPayload, 'utf8').digest('hex');
    assert.equal(validateTransactionHash({ ...transaction, hash: legacyHash }, secret), true);
  });

  it('throws descriptive error when secret is missing', () => {
    const canonicalHash = generateTransactionHash(transaction, secret);
    assert.throws(
      () => validateTransactionHash({ ...transaction, hash: canonicalHash }, null),
      /HMAC_SECRET no está configurada/
    );
  });

  it('resolves time slot thresholds including midnight crossover', () => {
    const thresholds = [
      { franja: 'mañana', hora_inicio: '05:00:01', hora_fin: '12:00:00', umbral_transacciones: 10, ventana_segundos: 3 },
      { franja: 'tarde-noche', hora_inicio: '12:00:01', hora_fin: '20:00:00', umbral_transacciones: 6, ventana_segundos: 3 },
      { franja: 'noche-madrugada', hora_inicio: '20:00:01', hora_fin: '05:00:00', umbral_transacciones: 3, ventana_segundos: 3 },
    ];

    assert.equal(getThresholdByTime(new Date('2026-09-23T08:00:00-05:00'), thresholds, 'America/Bogota').franja, 'mañana');
    assert.equal(getThresholdByTime(new Date('2026-09-23T15:00:00-05:00'), thresholds, 'America/Bogota').franja, 'tarde-noche');
    assert.equal(getThresholdByTime(new Date('2026-09-23T23:00:00-05:00'), thresholds, 'America/Bogota').franja, 'noche-madrugada');
    assert.equal(getThresholdByTime(new Date('2026-09-23T02:00:00-05:00'), thresholds, 'America/Bogota').franja, 'noche-madrugada');
  });
});
