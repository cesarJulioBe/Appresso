const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../src/infrastructure/database/connection');
const { OrderRepository } = require('../../src/infrastructure/database/repositories');

describe('Integration - PostgreSQL Connection & OrderRepository', () => {
  after(async () => {
    await db.close();
  });
  it('connects to PostgreSQL and executes SELECT NOW()', async () => {
    const res = await db.query('SELECT NOW()');
    assert.ok(res.rows[0].now);
  });

  it('creates, retrieves, and paginates orders via OrderRepository', async () => {
    const orderRepository = new OrderRepository({ db });
    const created = await orderRepository.create('Ana Test', [
      { name: 'Coffee', quantity: 2, price: 5000 },
    ]);

    assert.ok(created.id);
    assert.equal(created.customer, 'Ana Test');

    const found = await orderRepository.findById(created.id);
    assert.ok(found);
    assert.equal(found.totalAmount(), 10000);

    const paginated = await orderRepository.findAll(1, 5);
    assert.ok(Array.isArray(paginated.orders));
    assert.ok(paginated.total >= 1);
  });
});
