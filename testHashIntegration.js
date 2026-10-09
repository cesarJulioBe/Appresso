const assert = require('assert');
const http = require('http');
const app = require('./src/infrastructure/server/app');
const { generateTransactionHash } = require('./src/domain/fraud/hashUtils');
const pool = require('./src/infrastructure/database/connection');

const secret = process.env.HMAC_SECRET;

async function runIntegrationTests() {
  console.log('=== Iniciando Pruebas de Integración de Validación de Hash ===');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Prueba de transacción válida
    const validTxnId = Date.now();
    const validBase = {
      idTxn: validTxnId,
      user: 'integracion@cafe.com',
      date: '2026-09-23T10:30:00.000',
      value: 35000,
      paymentMethod: 'Tarjeta',
    };
    const validHash = generateTransactionHash(validBase, secret);
    const validPayload = JSON.stringify({ ...validBase, hash: validHash });

    console.log('\n1. Enviando transacción con hash válido...');
    const resValid = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: validPayload,
    });

    const bodyValid = await resValid.json();
    assert.strictEqual(resValid.status, 200, `Esperado 200 pero recibido ${resValid.status}: ${JSON.stringify(bodyValid)}`);
    assert.strictEqual(bodyValid.transaction.estado, 'Procesada');
    assert.strictEqual(bodyValid.analysis.isHashValid, true);
    console.log('✅ Transacción válida aceptada y procesada correctamente en la BD (estado: Procesada).');

    // 2. Prueba de transacción con hash inválido (valor alterado)
    const tamperedTxnId = Date.now() + 1;
    const tamperedPayload = JSON.stringify({
      idTxn: tamperedTxnId,
      user: 'atacante@cafe.com',
      date: '2026-09-23T10:35:00.000',
      value: 999999, // alterado respecto al hash original
      paymentMethod: 'Tarjeta',
      hash: validHash, // hash que no corresponde a este valor ni a este idTxn
    });

    console.log('\n2. Enviando transacción alterada (hash inválido)...');
    const resInvalid = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: tamperedPayload,
    });

    const bodyInvalid = await resInvalid.json();
    assert.strictEqual(resInvalid.status, 400, `Esperado 400 pero recibido ${resInvalid.status}`);
    assert.strictEqual(bodyInvalid.error, 'INVALID_HASH');
    assert.ok(bodyInvalid.transaction, 'Debe incluir la transacción registrada para auditoría');
    assert.strictEqual(bodyInvalid.transaction.estado, 'Hash inválido');
    assert.ok(bodyInvalid.anomaly, 'Debe incluir el registro de anomalía');
    assert.strictEqual(bodyInvalid.anomaly.tipo, 'HASH_INVALIDO');
    console.log('✅ Transacción con hash inválido rechazada con 400 y auditada en la BD (estado: Hash inválido, anomalia: HASH_INVALIDO).');

    // Verificar en la base de datos que efectivamente quedó persistida para auditoría
    const dbCheck = await pool.query('SELECT * FROM transacciones WHERE id_txn = $1', [tamperedTxnId]);
    assert.strictEqual(dbCheck.rows.length, 1);
    assert.strictEqual(dbCheck.rows[0].estado, 'Hash inválido');
    console.log('✅ Verificación en PostgreSQL exitosa: registro auditado correctamente en tabla "transacciones".');

    // 3. Prueba de /fraud/simulate
    console.log('\n3. Probando simulación en /fraud/simulate...');
    const resSimulate = await fetch(`${baseUrl}/fraud/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: 'simulado@cafe.com',
        value: 12000,
        paymentMethod: 'Nequi',
      }),
    });

    const bodySimulate = await resSimulate.json();
    assert.strictEqual(resSimulate.status, 201, `Esperado 201 pero recibido ${resSimulate.status}`);
    assert.strictEqual(bodySimulate.analysis.isHashValid, true, 'El hash generado en la simulación debe ser válido');
    console.log('✅ Endpoint /fraud/simulate genera hashes canónicos válidos aceptados por el motor.');

    console.log('\n🎉 TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON EXITOSAMENTE.');
  } finally {
    server.close();
    await pool.end();
  }
}

runIntegrationTests().catch(err => {
  console.error('❌ Error en prueba de integración:', err);
  process.exit(1);
});
