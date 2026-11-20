const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const OrderQueue = require('../../../src/domain/delivery/OrderQueue');
const ActionStack = require('../../../src/domain/delivery/ActionStack');
const DeliveryGraph = require('../../../src/domain/delivery/DeliveryGraph');
const estimateGasCost = require('../../../src/domain/delivery/estimateGasCost');

describe('Domain - Delivery Data Structures & Algorithms', () => {
  it('OrderQueue follows FIFO ordering', () => {
    const queue = new OrderQueue();
    assert.equal(queue.isEmpty(), true);

    queue.enqueue('Pedido de Ana');
    queue.enqueue('Pedido de Luis');
    queue.enqueue('Pedido de Marta');

    assert.equal(queue.size(), 3);
    assert.equal(queue.peek(), 'Pedido de Ana');
    assert.equal(queue.dequeue(), 'Pedido de Ana');
    assert.equal(queue.dequeue(), 'Pedido de Luis');
    assert.equal(queue.size(), 1);
  });

  it('ActionStack follows LIFO ordering', () => {
    const stack = new ActionStack();
    assert.equal(stack.isEmpty(), true);

    stack.push('Pedido 1 -> Requested');
    stack.push('Pedido 1 -> In Progress');
    stack.push('Pedido 1 -> Delivered');

    assert.equal(stack.peek(), 'Pedido 1 -> Delivered');
    assert.equal(stack.pop(), 'Pedido 1 -> Delivered');
    assert.equal(stack.peek(), 'Pedido 1 -> In Progress');
    assert.equal(stack.size(), 2);
  });

  it('DeliveryGraph computes shortest route via Dijkstra', () => {
    const graph = new DeliveryGraph();
    graph.addRoute('A', 'B', 10);
    graph.addRoute('A', 'C', 2);
    graph.addRoute('C', 'D', 3);
    graph.addRoute('D', 'B', 1);

    const result = graph.dijkstra('A', 'B');
    assert.deepEqual(result.path, ['A', 'C', 'D', 'B']);
    assert.equal(result.distanceKm, 6);
  });

  it('estimateGasCost computes liters and total cost accurately', () => {
    const gas = estimateGasCost(15, 15, 10500);
    assert.equal(gas.distanceKm, 15);
    assert.equal(gas.liters, 1);
    assert.equal(gas.cost, 10500);
  });
});
