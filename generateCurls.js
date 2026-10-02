const crypto = require('crypto');

const secret = 'mi_llave_privada_appresso_2026'; // debe ser igual a tu HMAC_SECRET del .env

function makeTransaction(idTxn, user, date, value, paymentMethod) {
  const base = { idTxn, user, date, value, paymentMethod };
  const payload = JSON.stringify(base, Object.keys(base).sort());
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { ...base, hash };
}

const transactions = [
  makeTransaction(301, 'carlos@test.com', '2026-09-23T22:20:01', 40000, 'Tarjeta'),
  makeTransaction(302, 'carlos@test.com', '2026-09-23T22:20:10', 25000, 'Tarjeta'),
  makeTransaction(303, 'carlos@test.com', '2026-09-23T22:21:20', 15000, 'Tarjeta'),
];

transactions.forEach(txn => {
  console.log(`curl -X POST http://localhost:3000/transactions -H "Content-Type: application/json" -d '${JSON.stringify(txn)}'`);
  console.log('');
});