const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Order = require('../../../src/domain/entities/Order');
const ActionStack = require('../../../src/domain/delivery/ActionStack');
const SlidingWindow = require('../../../src/domain/fraud/SlidingWindow');
const { generateTransactionHash } = require('../../../src/domain/fraud/hashUtils');

const OrderService = require('../../../src/application/orders/OrderService');
const QueueService = require('../../../src/application/delivery/QueueService');
const RouteService = require('../../../src/application/delivery/RouteService');
const AnalyticsService = require('../../../src/application/analytics/AnalyticsService');
const TransactionService = require('../../../src/application/fraud/TransactionService');
const FraudReportService = require('../../../src/application/fraud/FraudReportService');
const ThresholdService = require('../../../src/application/fraud/ThresholdService');

function createFakeOrderRepository(initialOrders = []) {
  const store = [...initialOrders];
  let nextId = store.length + 1;

  return {
    async create(customer, products) {
      const order = new Order(nextId++, customer, products, 'Requested');
      store.push(order);
      return order;
    },
    async findById(id) {
      return store.find((o) => o.id === Number(id)) || null;
    },
    async findAll(page = 1, pageSize = 20) {
      const start = (page - 1) * pageSize;
      return {
        orders: store.slice(start, start + pageSize),
        total: store.length,
        page,
        pageSize,
        totalPages: Math.ceil(store.length / pageSize),
      };
    },
    async findAllUnpaginated() {
      return [...store];
    },
    async findByStatus(status) {
      return store.filter((o) => o.status === status);
    },
    async updateStatus(id, status) {
      const order = store.find((o) => o.id === Number(id));
      if (!order) return null;
      order.status = status;
      return order;
    },
  };
}

describe('Application Layer - Services (with DI fakes)', () => {
  it('OrderService updates status, pushes to ActionStack only on success, and undoes last change', async () => {
    const orderRepository = createFakeOrderRepository([
      new Order(1, 'Ana', [{ name: 'Coffee', quantity: 1, price: 5000 }], 'Requested'),
    ]);
    const actionStack = new ActionStack();
    const orderService = new OrderService({ orderRepository, actionStack });

    // Non-existent order should throw 404 AND NOT push to actionStack
    await assert.rejects(
      () => orderService.updateStatus(999, 'Delivered'),
      { name: 'NotFoundError', message: 'Pedido no encontrado' }
    );
    assert.equal(actionStack.size(), 0);

    // Valid status update pushes to actionStack
    const updated = await orderService.updateStatus(1, 'In Progress');
    assert.equal(updated.status, 'In Progress');
    assert.equal(actionStack.size(), 1);

    // Undo restores previous status
    const undone = await orderService.undoLastChange();
    assert.equal(undone.order.status, 'Requested');
    assert.equal(actionStack.size(), 0);
  });

  it('QueueService attends next pending order in FIFO order and records undo action', async () => {
    const orderRepository = createFakeOrderRepository([
      new Order(1, 'Ana', [{ name: 'Coffee', quantity: 1, price: 5000 }], 'Requested'),
      new Order(2, 'Luis', [{ name: 'Tea', quantity: 1, price: 4000 }], 'Requested'),
    ]);
    const actionStack = new ActionStack();
    const queueService = new QueueService({ orderRepository, actionStack });

    const pendingBefore = await queueService.getPending();
    assert.equal(pendingBefore.totalPending, 2);
    assert.equal(pendingBefore.next.id, 1);

    const attended = await queueService.attendNext();
    assert.equal(attended.id, 1);
    assert.equal(attended.status, 'In Progress');
    assert.equal(actionStack.size(), 1);
  });

  it('RouteService calculates shortest route and gas cost from repository edges', async () => {
    const routeRepository = {
      async findAll() {
        return [
          { origin: 'Medellin', destination: 'Envigado', distance_km: '10' },
          { origin: 'Envigado', destination: 'Sabaneta', distance_km: '5' },
        ];
      },
      async findCities() {
        return ['Envigado', 'Medellin', 'Sabaneta'];
      },
    };
    const routeService = new RouteService({ routeRepository });
    const result = await routeService.calculateRoute({
      from: 'Medellin',
      to: 'Sabaneta',
      kmPerLiter: 15,
      pricePerLiter: 15000,
    });

    assert.deepEqual(result.path, ['Medellin', 'Envigado', 'Sabaneta']);
    assert.equal(result.distanceKm, 15);
    assert.equal(result.gas.liters, 1);
    assert.equal(result.gas.cost, 15000);
  });

  it('AnalyticsService computes statistics, loyalty progression, and sales predictions', async () => {
    const orderRepository = createFakeOrderRepository([
      new Order(1, 'Ana', [{ name: 'Coffee', quantity: 2, price: 5000 }], 'Delivered'),
    ]);
    const analyticsService = new AnalyticsService({ orderRepository });

    const stats = await analyticsService.getStatistics();
    assert.equal(stats.statistics.Delivered.orderCount, 1);

    const loyalty = analyticsService.getLoyaltyProgression({ firstTerm: 2, commonDifference: 2 });
    assert.equal(loyalty.results.length, 3);

    const sales = analyticsService.predictSales([10, 20, 30]);
    assert.equal(sales.predictions.length, 3);
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
