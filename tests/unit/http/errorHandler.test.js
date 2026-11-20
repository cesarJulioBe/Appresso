const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const errorHandler = require('../../../src/interfaces/http/middlewares/errorHandler');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
} = require('../../../src/domain/errors');
const logger = require('../../../src/infrastructure/logging/logger');

function createMockRes() {
  return {
    locals: { requestId: 'req-12345' },
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('HTTP Layer - errorHandler & Logger Redaction', () => {
  const mockReq = { method: 'POST', originalUrl: '/test' };

  it('formats operational error without code as { error: message }', () => {
    const res = createMockRes();
    errorHandler(new NotFoundError('Pedido no encontrado'), mockReq, res, () => {});
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Pedido no encontrado' });
  });

  it('formats operational error with code, details, and payload', () => {
    const res = createMockRes();
    const err = new ValidationError('La transacción contiene datos inválidos', {
      code: 'VALIDATION_ERROR',
      details: [{ field: 'idTxn' }],
      resultTag: 'validation_failed',
    });
    errorHandler(err, mockReq, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.locals.transactionResult, 'validation_failed');
    assert.deepEqual(res.body, {
      error: 'VALIDATION_ERROR',
      message: 'La transacción contiene datos inválidos',
      requestId: 'req-12345',
      details: [{ field: 'idTxn' }],
    });
  });

  it('maps PostgreSQL 23505 unique constraint error to 409 DUPLICATE_TRANSACTION', () => {
    const res = createMockRes();
    const pgErr = new Error('duplicate key value violates unique constraint');
    pgErr.code = '23505';
    errorHandler(pgErr, mockReq, res, () => {});
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'DUPLICATE_TRANSACTION');
    assert.equal(res.body.requestId, 'req-12345');
  });

  it('formats unexpected error as 500 generic message with requestId', () => {
    const res = createMockRes();
    errorHandler(new Error('Database connection lost'), mockReq, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      error: 'Error interno del servidor',
      requestId: 'req-12345',
    });
  });

  it('sanitizes sensitive fields (hash, secret, password, user email) in logger', () => {
    const sanitized = logger.sanitizeObject({
      idTxn: 1001,
      user: 'cliente@example.com',
      hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      secret: 'top_secret_key',
    });

    assert.equal(sanitized.idTxn, 1001);
    assert.equal(sanitized.user, 'cl***@example.com');
    assert.equal(sanitized.hash, 'abcdef...[REDACTED]');
    assert.equal(sanitized.secret, 'top_se...[REDACTED]');
  });
});
