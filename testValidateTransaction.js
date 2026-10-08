const assert = require('assert');
const validateTransaction = require('./src/domain/fraud/validateTransaction');

const validTransaction = {
  idTxn: 10052,
  user: 'usuario@example.com',
  date: '2026-03-05T02:44:21.670Z',
  value: 468296,
  paymentMethod: 0,
  hash: 'a'.repeat(64),
};

assert.deepStrictEqual(validateTransaction(validTransaction), {
  isValid: true,
  errors: [],
});

const invalid = validateTransaction({
  ...validTransaction,
  idTxn: null,
  date: 249258,
  value: 0,
  hash: 'not-a-hash',
});

assert.strictEqual(invalid.isValid, false);
assert.deepStrictEqual(
  invalid.errors.map(error => error.field),
  ['idTxn', 'date', 'value', 'hash']
);

console.log('Validación de transacciones: OK');
