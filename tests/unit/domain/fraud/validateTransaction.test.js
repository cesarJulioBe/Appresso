const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const validateTransaction = require('../../../../src/domain/fraud/validateTransaction');

describe('Domain - Fraud: validateTransaction', () => {
  const validTransaction = {
    idTxn: 10052,
    user: 'usuario@example.com',
    date: '2026-03-05T02:44:21.670Z',
    value: 468296,
    paymentMethod: 0,
    hash: 'a'.repeat(64),
  };

  it('accepts a valid transaction payload', () => {
    assert.deepEqual(validateTransaction(validTransaction), {
      isValid: true,
      errors: [],
    });
  });

  it('reports field-level errors for invalid fields', () => {
    const invalid = validateTransaction({
      ...validTransaction,
      idTxn: null,
      date: 249258,
      value: 0,
      hash: 'not-a-hash',
    });

    assert.equal(invalid.isValid, false);
    assert.deepEqual(
      invalid.errors.map((error) => error.field),
      ['idTxn', 'date', 'value', 'hash']
    );
  });
});
