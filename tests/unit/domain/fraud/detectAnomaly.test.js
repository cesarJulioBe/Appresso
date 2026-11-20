const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const SlidingWindow = require('../../../../src/domain/fraud/SlidingWindow');
const detectAnomaly = require('../../../../src/domain/fraud/detectAnomaly');
const { generateTransactionHash } = require('../../../../src/domain/fraud/hashUtils');

describe('Domain - Fraud: detectAnomaly', () => {
  const secret = 'test_secret_anomaly';
  const thresholds = [
    { franja: 'mañana', hora_inicio: '05:00:01', hora_fin: '12:00:00', umbral_transacciones: 10, ventana_segundos: 3 },
    { franja: 'tarde-noche', hora_inicio: '12:00:01', hora_fin: '20:00:00', umbral_transacciones: 6, ventana_segundos: 3 },
    { franja: 'noche-madrugada', hora_inicio: '20:00:01', hora_fin: '05:00:00', umbral_transacciones: 3, ventana_segundos: 3 },
  ];

  function makeTransaction(idTxn, user, date, value) {
    const base = { idTxn, user, date, value, paymentMethod: 'Tarjeta' };
    const hash = generateTransactionHash(base, secret);
    return { ...base, hash };
  }

  it('triggers POSIBLE_FRAUDE when user reaches threshold within sliding window', () => {
    const slidingWindow = new SlidingWindow();
    const t1 = makeTransaction(1, 'b@b.com', '2026-09-23T22:00:01-05:00', 50000);
    const t2 = makeTransaction(2, 'b@b.com', '2026-09-23T22:00:02-05:00', 30000);
    const t3 = makeTransaction(3, 'b@b.com', '2026-09-23T22:00:03-05:00', 20000);

    const r1 = detectAnomaly(t1, slidingWindow, thresholds, secret, new Date(t1.date), 'America/Bogota');
    const r2 = detectAnomaly(t2, slidingWindow, thresholds, secret, new Date(t2.date), 'America/Bogota');
    const r3 = detectAnomaly(t3, slidingWindow, thresholds, secret, new Date(t3.date), 'America/Bogota');

    assert.equal(r1.isAnomaly, false);
    assert.equal(r1.tipo, 'NORMAL');
    assert.equal(r2.isAnomaly, false);
    assert.equal(r3.isAnomaly, true);
    assert.equal(r3.tipo, 'POSIBLE_FRAUDE');
    assert.equal(r3.transactionCount, 3);
  });
});
