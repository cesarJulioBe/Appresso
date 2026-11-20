const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Order = require('../../../src/domain/entities/Order');
const calculateStatistics = require('../../../src/domain/algorithms/calculateStatistics');
const linearSearch = require('../../../src/domain/algorithms/linearSearch');
const binarySearch = require('../../../src/domain/algorithms/binarySearch');
const countByStatusRecursive = require('../../../src/domain/algorithms/countByStatusRecursive');
const {
  nthTerm,
  findPositionForValue,
} = require('../../../src/domain/algorithms/arithmeticProgression');
const linearRegression = require('../../../src/domain/algorithms/linearRegression');

describe('Domain - Entities & Algorithms', () => {
  const sampleOrders = [
    new Order(1, 'Ana', [{ name: 'Coffee', quantity: 2, price: 5000 }], 'Delivered'),
    new Order(2, 'Luis', [{ name: 'Tea', quantity: 1, price: 4000 }], 'In Progress'),
    new Order(3, 'Marta', [{ name: 'Muffin', quantity: 3, price: 8000 }], 'Requested'),
    new Order(4, 'Ana', [{ name: 'Coffee', quantity: 1, price: 5000 }], 'Delivered'),
  ];

  it('calculates totalQuantity and totalAmount on Order entity', () => {
    assert.equal(sampleOrders[0].totalQuantity(), 2);
    assert.equal(sampleOrders[0].totalAmount(), 10000);
  });

  it('calculates statistics grouped by order status', () => {
    const result = calculateStatistics(sampleOrders);
    assert.equal(result.operationsCount, 4);
    assert.deepEqual(result.statistics, {
      Requested: { orderCount: 1, totalProducts: 3, totalMoney: 24000 },
      'In Progress': { orderCount: 1, totalProducts: 1, totalMoney: 4000 },
      Delivered: { orderCount: 2, totalProducts: 3, totalMoney: 15000 },
    });
  });

  it('compares linearSearch and binarySearch on sorted orders', () => {
    const sortedOrders = Array.from({ length: 10 }, (_, idx) => {
      const id = idx + 1;
      return new Order(id, `Customer${id}`, [{ name: 'Coffee', quantity: 1, price: 5000 }], 'Requested');
    });

    const linearRes = linearSearch(sortedOrders, 9);
    const binaryRes = binarySearch(sortedOrders, 9);

    assert.equal(linearRes.order.id, 9);
    assert.equal(linearRes.operationsCount, 9);
    assert.equal(binaryRes.found.id, 9);
    assert.ok(binaryRes.operationsCount < linearRes.operationsCount);
  });

  it('counts orders by status recursively', () => {
    assert.equal(countByStatusRecursive(sampleOrders, 'Delivered'), 2);
    assert.equal(countByStatusRecursive(sampleOrders, 'Requested'), 1);
    assert.equal(countByStatusRecursive(sampleOrders, 'In Progress'), 1);
  });

  it('computes arithmetic progression terms and target positions', () => {
    assert.equal(nthTerm(2, 2, 1), 2);
    assert.equal(nthTerm(2, 2, 21), 42);
    assert.equal(findPositionForValue(2, 2, 42), 21);
    assert.equal(findPositionForValue(2, 2, 72), 36);
    assert.equal(findPositionForValue(2, 2, 120), 60);
  });

  it('computes linear regression slope, intercept, and future sales predictions', () => {
    const salesHistory = [10, 13, 9, 15, 18, 20, 19];
    const model = linearRegression(salesHistory);

    assert.ok(model.slope > 1.5 && model.slope < 2.0);
    assert.ok(Number.isFinite(model.intercept));
    assert.ok(model.predict(7) > model.predict(2));
  });
});
