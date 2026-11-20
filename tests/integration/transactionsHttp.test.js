const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const config = require('../../src/config/env');
const app = require('../../src/app');
const db = require('../../src/infrastructure/database/connection');
const { generateTransactionHash } = require('../../src/domain/fraud/hashUtils');

describe('Integration - HTTP Transactions & Fraud Detection Endpoints', () => {
  let server;
  let baseUrl;
  const secret = config.hmacSecret;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await db.close();
  });

  it('accepts a transaction with a valid canonical HMAC-SHA256 hash', async () => {
    const validTxnId = Date.now();
    const validBase = {
      idTxn: validTxnId,
      user: 'integracion@cafe.com',
      date: '2026-09-23T10:30:00.000',
      value: 35000,
      paymentMethod: 'Tarjeta',
    };
    const validHash = generateTransactionHash(validBase, secret);

    const res = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBase, hash: validHash }),
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('x-request-id'));
    assert.equal(body.transaction.estado, 'Procesada');
    assert.equal(body.analysis.isHashValid, true);
  });

  it('rejects a tampered transaction with 400 INVALID_HASH and persists audit records in DB', async () => {
    const validBase = {
      idTxn: Date.now() + 10,
      user: 'integracion@cafe.com',
      date: '2026-09-23T10:30:00.000',
      value: 35000,
      paymentMethod: 'Tarjeta',
    };
    const validHash = generateTransactionHash(validBase, secret);

    const tamperedTxnId = Date.now() + 11;
    const tamperedPayload = {
      idTxn: tamperedTxnId,
      user: 'atacante@cafe.com',
      date: '2026-09-23T10:35:00.000',
      value: 999999,
      paymentMethod: 'Tarjeta',
      hash: validHash,
    };

    const res = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tamperedPayload),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'INVALID_HASH');
    assert.ok(body.requestId);
    assert.ok(body.transaction);
    assert.equal(body.transaction.estado, 'Hash inválido');
    assert.ok(body.anomaly);
    assert.equal(body.anomaly.tipo, 'HASH_INVALIDO');

    const dbCheck = await db.query('SELECT * FROM transacciones WHERE id_txn = $1', [
      tamperedTxnId,
    ]);
    assert.equal(dbCheck.rows.length, 1);
    assert.equal(dbCheck.rows[0].estado, 'Hash inválido');
  });

  it('simulates a valid transaction on POST /fraud/simulate', async () => {
    const res = await fetch(`${baseUrl}/fraud/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: 'simulado@cafe.com',
        value: 12000,
        paymentMethod: 'Nequi',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.analysis.isHashValid, true);
  });
});
