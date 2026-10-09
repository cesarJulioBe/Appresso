const crypto = require('crypto');
require('dotenv').config();

const secret = process.env.HMAC_SECRET;
if (!secret) {
  throw new Error('HMAC_SECRET no está configurada en el entorno');
}

function makeTransaction(idTxn, user, date, value, paymentMethod) {
  const base = { idTxn, user, date, value, paymentMethod };
  const payload = JSON.stringify(base);
  const hash = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return { ...base, hash };
}

const transactions = [
  makeTransaction(401, 'carlos@test.com', '2026-09-23T22:20:01', 40000, 'Tarjeta'),
  makeTransaction(402, 'carlos@test.com', '2026-09-23T22:20:10', 25000, 'Tarjeta'),
  makeTransaction(403, 'carlos@test.com', '2026-09-23T22:21:20', 15000, 'Tarjeta'),
];

transactions.forEach(txn => {
  console.log(`curl -X POST http://localhost:3000/transactions -H "Content-Type: application/json" -d '${JSON.stringify(txn)}'`);
  console.log('');
});