const config = require('../src/config/env');
const { generateTransactionHash } = require('../src/domain/fraud/hashUtils');

const secret = config.hmacSecret;
if (!secret) {
  throw new Error('HMAC_SECRET no está configurada en el entorno');
}

function makeTransaction(idTxn, user, date, value, paymentMethod) {
  const base = { idTxn, user, date, value, paymentMethod };
  const hash = generateTransactionHash(base, secret);
  return { ...base, hash };
}

const transactions = [
  makeTransaction(401, 'carlos@test.com', '2026-09-23T22:20:01', 40000, 'Tarjeta'),
  makeTransaction(402, 'carlos@test.com', '2026-09-23T22:20:10', 25000, 'Tarjeta'),
  makeTransaction(403, 'carlos@test.com', '2026-09-23T22:21:20', 15000, 'Tarjeta'),
];

console.log('# Comandos cURL generados con HMAC-SHA256 Canónico (Tecnicas_de_resolucion.md):\n');
transactions.forEach(txn => {
  console.log(`curl -X POST http://localhost:3000/transactions -H "Content-Type: application/json" -d '${JSON.stringify(txn)}'`);
  console.log('');
});