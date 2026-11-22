const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../src/infrastructure/database/connection');
const { seedInitialOperationalData } = require('../../src/infrastructure/database/migrations');
const { buildContainer } = require('../../src/container');
const { createApp } = require('../../src/app');

describe('Integration - Operational Modules, Data Quality, Integrity Hash Chain, Benchmarks & AI', () => {
  let server;
  let baseUrl;
  const testSecret = 'integration_test_hmac_secret';

  before(async () => {
    await seedInitialOperationalData(db, testSecret);
    const container = buildContainer({ db, secret: testSecret });
    const app = createApp(container);
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('performs CRUD of users with roles, categories, and items, and creates orders deducting inventory', async () => {
    // 1. Crear usuario con rol
    const userRes = await fetch(`${baseUrl}/operational/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: '  mateo   RESTREPO  ',
        email: `mateo.restrepo.${Date.now()}@appresso.co`,
        rol: 'cliente',
        documento: 'CC987654321',
      }),
    });
    assert.equal(userRes.status, 201);
    const userData = await userRes.json();
    assert.equal(userData.user.nombre, 'Mateo Restrepo');
    assert.equal(userData.user.rol, 'cliente');

    // 2. Crear categoría con nombre inconsistente y verificar unificación
    const catRes = await fetch(`${baseUrl}/operational/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: '  bebidas   calientes cafe ',
      }),
    });
    assert.equal(catRes.status, 201);
    const catData = await catRes.json();
    assert.equal(catData.category.nombre, 'Café Caliente');

    // 3. Crear ítem con precio mal escrito y stock inicial 20
    const itemName = `Chemex Especial ${Date.now().toString().slice(-4)}`;
    const itemRes = await fetch(`${baseUrl}/operational/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: itemName,
        categoriaId: catData.category.id,
        precio: '$ 14.500,00',
        stock: 20,
      }),
    });
    assert.equal(itemRes.status, 201);
    const itemData = await itemRes.json();
    assert.equal(Number(itemData.item.precio), 14500);
    assert.equal(Number(itemData.item.stock), 20);

    // 4. Crear pedido multicanal con 3 unidades de ese ítem y verificar descuento de inventario
    const orderRes = await fetch(`${baseUrl}/operational/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuarioId: userData.user.id,
        canal: 'app',
        porcentajeDescuento: 10,
        items: [{ itemId: itemData.item.id, quantity: 3 }],
      }),
    });
    assert.equal(orderRes.status, 201);
    const orderData = await orderRes.json();
    assert.equal(orderData.stockAdjustments[0].remainingStock, 17);

    // 5. Generar factura con impuestos, descuento, consecutivo y hash encadenado
    const invRes = await fetch(`${baseUrl}/operational/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedidoId: orderData.order.id,
        usuarioId: userData.user.id,
        canal: 'app',
        porcentajeDescuento: 10,
      }),
    });
    assert.equal(invRes.status, 201);
    const invData = await invRes.json();
    assert.ok(invData.invoice.numero_consecutivo.startsWith('FAC-'));
    assert.equal(invData.invoice.hash_actual.length, 64);

    // 6. Procesar pago con comprobante adjunto y hash encadenado
    const payRes = await fetch(`${baseUrl}/operational/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facturaId: invData.invoice.id,
        monto: Number(invData.invoice.total),
        metodoPago: 'Transferencia',
        referenciaComprobante: `COMP-TEST-${Date.now()}`,
      }),
    });
    assert.equal(payRes.status, 201);
    const payData = await payRes.json();
    assert.equal(payData.receiptValidation.isValid, true);
    assert.equal(payData.payment.hash_actual.length, 64);
  });

  it('detects hash chain tampering on invoices/payments and restores cryptographic integrity', async () => {
    // Restaurar primero para asegurar estado limpio con el testSecret actual
    await fetch(`${baseUrl}/operational/integrity/restore`, { method: 'POST' });

    const verifyBefore = await (await fetch(`${baseUrl}/operational/integrity/verify`)).json();
    assert.equal(verifyBefore.isSystemIntegrityValid, true);

    // Simular alteración de monto de factura
    const tampered = await (
      await fetch(`${baseUrl}/operational/integrity/tamper-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'invoice_amount' }),
      })
    ).json();
    assert.equal(tampered.isSystemIntegrityValid, false);
    assert.ok(tampered.invoices.CompromisedCount >= 1);

    // Restaurar integridad de la cadena
    const restored = await (
      await fetch(`${baseUrl}/operational/integrity/restore`, { method: 'POST' })
    ).json();
    assert.equal(restored.isSystemIntegrityValid, true);
  });

  it('injects dirty data, generates data quality report, and executes automated cleaning', async () => {
    const seeded = await (
      await fetch(`${baseUrl}/operational/quality/seed-dirty`, { method: 'POST' })
    ).json();
    assert.ok(seeded.report.totalIssues >= 3);

    const cleaned = await (
      await fetch(`${baseUrl}/operational/quality/clean`, { method: 'POST' })
    ).json();
    assert.ok(cleaned.recordsCorrected >= 3);
    assert.ok(cleaned.newScore >= cleaned.previousScore);
  });

  it('executes experimental algorithm benchmarks and Non-LLM AI classification & demand prediction', async () => {
    const benchRes = await fetch(`${baseUrl}/operational/benchmarks?entity=orders&sortBy=date`);
    assert.equal(benchRes.status, 200);
    const benchData = await benchRes.json();
    assert.ok(benchData.experimentalBenchmark.experiments.length >= 3);
    assert.ok(benchData.liveSystemMetrics.topSellingItems.ranking.length >= 1);

    const classifyRes = await fetch(`${baseUrl}/ai/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monto: 320000,
        hora: 3,
        metodoPago: 'Transferencia',
        firmaValida: false,
        frecuencia: 7,
        porcentajeDescuento: 50,
        canal: 'web',
      }),
    });
    assert.equal(classifyRes.status, 200);
    const classifyData = await classifyRes.json();
    assert.equal(classifyData.classification, 'FRAUDULENTA');

    const demandRes = await fetch(`${baseUrl}/ai/predict-demand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailySeries: [20, 22, 25, 28, 30, 34],
        horizonDays: 5,
        dayOfWeek: 6,
        hour: 16,
        canal: 'app',
      }),
    });
    assert.equal(demandRes.status, 200);
    const demandData = await demandRes.json();
    assert.equal(demandData.simpleStatisticsRegression.forecasts.length, 5);
    assert.ok(demandData.kerasNeuralRegression.predictedDemandUnits > 0);

    const profilesRes = await fetch(`${baseUrl}/ai/user-profiles`);
    assert.equal(profilesRes.status, 200);
    const profilesData = await profilesRes.json();
    assert.ok(profilesData.profiles.length >= 1);
  });
});
