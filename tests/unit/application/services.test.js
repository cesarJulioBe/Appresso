const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Order = require('../../../src/domain/entities/Order');
const SlidingWindow = require('../../../src/domain/fraud/SlidingWindow');
const { generateTransactionHash } = require('../../../src/domain/fraud/hashUtils');

const OperationalService = require('../../../src/application/operational/OperationalService');
const TransactionService = require('../../../src/application/fraud/TransactionService');
const FraudReportService = require('../../../src/application/fraud/FraudReportService');
const ThresholdService = require('../../../src/application/fraud/ThresholdService');

describe('Application Layer - Unified Services (with DI fakes)', () => {
  it('OperationalService creates multichannel order deducting stock, updates status, and restores stock on cancel', async () => {
    const itemsStore = [
      { id: 1, sku: 'CAF-001', nombre: 'Café Americano', nombre_normalizado: 'cafe americano', precio: 6000, stock: 10 },
    ];
    const ordersStore = [];

    const catalogRepository = {
      async findItemById(id) {
        return itemsStore.find((i) => i.id === Number(id)) || null;
      },
      async adjustStock(id, delta) {
        const item = itemsStore.find((i) => i.id === Number(id));
        if (!item) return null;
        item.stock = Math.max(0, item.stock + delta);
        return { ...item };
      },
    };
    const orderRepository = {
      async createExtended(data) {
        const order = new Order(ordersStore.length + 1, data.customer, data.products, data.status);
        order.canal = data.canal;
        order.subtotal = data.subtotal;
        order.impuestos = data.impuestos;
        order.total = data.total;
        ordersStore.push(order);
        return order;
      },
      async findById(id) {
        return ordersStore.find((o) => o.id === Number(id)) || null;
      },
      async findAll(page = 1, pageSize = 20) {
        return { orders: ordersStore, total: ordersStore.length, page, pageSize, totalPages: 1 };
      },
      async findAllUnpaginated() {
        return [...ordersStore];
      },
      async updateStatus(id, status) {
        const order = ordersStore.find((o) => o.id === Number(id));
        if (!order) return null;
        order.status = status;
        return order;
      },
    };

    const operationalService = new OperationalService({
      userRepository: { async findById() { return { id: 1, nombre: 'Ana Cliente' }; } },
      catalogRepository,
      orderRepository,
      billingRepository: {},
      secret: 'unit_test_secret',
    });

    // Crear pedido de 3 unidades descuenta stock de 10 -> 7
    const created = await operationalService.createOperationalOrder({
      usuarioId: 1,
      canal: 'app',
      items: [{ itemId: 1, quantity: 3 }],
    });
    assert.equal(created.order.canal, 'app');
    assert.equal(itemsStore[0].stock, 7);

    // Actualizar estado válido a In Progress
    const inProgress = await operationalService.updateOperationalOrderStatus(created.order.id, 'In Progress');
    assert.equal(inProgress.order.status, 'In Progress');

    // Rechazar estado inválido
    await assert.rejects(
      () => operationalService.updateOperationalOrderStatus(created.order.id, 'EstadoFalso'),
      { name: 'ValidationError' }
    );

    // Cancelar pedido devuelve las 3 unidades al stock (7 -> 10)
    const cancelled = await operationalService.cancelOrder(created.order.id);
    assert.equal(cancelled.order.status, 'Cancelled');
    assert.equal(itemsStore[0].stock, 10);
  });

  it('TransactionService processes valid transactions, audits invalid hashes, and rejects duplicates', async () => {
    const secret = 'unit_test_secret_key';
    const txStore = [];
    const anomalyStore = [];

    const userRepository = {
      async findOrCreate(email) {
        return { id: 1, email };
      },
    };
    const transactionRepository = {
      async findByExternalId(idTxn) {
        return txStore.find((t) => t.id_txn === idTxn) || null;
      },
      async create(data) {
        const row = { id: txStore.length + 1, id_txn: data.idTxn, ...data };
        txStore.push(row);
        return row;
      },
      async findAll() {
        return txStore;
      },
      async countAll() {
        return txStore.length;
      },
    };
    const anomalyRepository = {
      async create(data) {
        const row = { id: anomalyStore.length + 1, ...data };
        anomalyStore.push(row);
        return row;
      },
      async findAll() {
        return anomalyStore;
      },
      async countAll() {
        return anomalyStore.length;
      },
    };
    const customThresholds = [
      {
        franja: 'mañana',
        hora_inicio: '00:00:00',
        hora_fin: '23:59:59',
        umbral_transacciones: 2,
        ventana_segundos: 10,
      },
    ];

    const fixedDate = new Date('2026-09-23T10:00:00.000Z');
    const service = new TransactionService({
      userRepository,
      transactionRepository,
      anomalyRepository,
      thresholds: customThresholds,
      slidingWindow: new SlidingWindow(),
      secret,
      clock: () => fixedDate,
    });

    const base1 = {
      idTxn: 501,
      user: 'cliente@cafe.com',
      date: '2026-09-23T10:00:00.000Z',
      value: 25000,
      paymentMethod: 'Tarjeta',
    };
    const hash1 = generateTransactionHash(base1, secret);

    const res1 = await service.receive({ ...base1, hash: hash1 });
    assert.equal(res1.transaction.estado, 'Procesada');
    assert.equal(res1.analysis.isAnomaly, false);

    // Duplicate transaction should throw ConflictError (409)
    await assert.rejects(
      () => service.receive({ ...base1, hash: hash1 }),
      (err) => err.statusCode === 409 && err.code === 'DUPLICATE_TRANSACTION'
    );

    // Tampered hash should throw ValidationError (400 INVALID_HASH) AND persist audit records
    const baseTampered = { ...base1, idTxn: 502, value: 999999, hash: hash1 };
    await assert.rejects(
      () => service.receive(baseTampered),
      (err) =>
        err.statusCode === 400 &&
        err.code === 'INVALID_HASH' &&
        err.payload.transaction.estado === 'Hash inválido' &&
        err.payload.anomaly.tipo === 'HASH_INVALIDO'
    );

    const reportService = new FraudReportService({
      transactionRepository,
      anomalyRepository,
    });
    const stats = await reportService.getStats();
    assert.equal(stats.totalTransacciones, 2);
    assert.equal(stats.totalAnomalias, 1);
  });

  it('ThresholdService validates and updates threshold configuration', async () => {
    const thresholdRepository = {
      async findAll() {
        return [{ franja: 'mañana', umbral_transacciones: 10, ventana_segundos: 3 }];
      },
      async updateThreshold(franja, umbralTransacciones, ventanaSegundos) {
        if (franja !== 'mañana') return null;
        return { franja, umbral_transacciones: umbralTransacciones, ventana_segundos: ventanaSegundos };
      },
    };
    const thresholdService = new ThresholdService({ thresholdRepository });

    await assert.rejects(
      () => thresholdService.update('mañana', {}),
      { name: 'ValidationError' }
    );
    await assert.rejects(
      () => thresholdService.update('inexistente', { umbralTransacciones: 5, ventanaSegundos: 3 }),
      { name: 'NotFoundError' }
    );

    const updated = await thresholdService.update('mañana', {
      umbralTransacciones: 8,
      ventanaSegundos: 5,
    });
    assert.equal(updated.umbral_transacciones, 8);
  });
});
