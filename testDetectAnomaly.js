const crypto = require('crypto');
const SlidingWindow = require('./src/domain/fraud/SlidingWindow');
const detectAnomaly = require('./src/domain/fraud/detectAnomaly');

const secret = 'mi_llave_privada_appresso_2026';
const slidingWindow = new SlidingWindow();

const thresholds = [
  { franja: 'mañana', hora_inicio: '05:00:01', hora_fin: '12:00:00', umbral_transacciones: 10, ventana_segundos: 3 },
  { franja: 'tarde-noche', hora_inicio: '12:00:01', hora_fin: '20:00:00', umbral_transacciones: 6, ventana_segundos: 3 },
  { franja: 'noche-madrugada', hora_inicio: '20:00:01', hora_fin: '05:00:00', umbral_transacciones: 3, ventana_segundos: 3 },
];

// Umbral bajo a propósito (noche-madrugada = 3) para ver la anomalía rápido
function makeTransaction(idTxn, user, date, value) {
  const base = { idTxn, user, date, value, paymentMethod: 'Tarjeta' };
  const payload = JSON.stringify(base, Object.keys(base).sort());
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { ...base, hash };
}

const transactions = [
  makeTransaction(1, 'b@b.com', '2026-09-23T22:00:01', 50000),
  makeTransaction(2, 'b@b.com', '2026-09-23T22:00:02', 30000),
  makeTransaction(3, 'b@b.com', '2026-09-23T22:00:03', 20000),
];

for (const txn of transactions) {
  const result = detectAnomaly(txn, slidingWindow, thresholds, secret);
  console.log(`Txn ${txn.idTxn} (${txn.date}):`, result);
}