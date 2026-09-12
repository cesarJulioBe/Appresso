class OrderQueue {
  constructor() {
    this.items = [];
  }

  enqueue(order) {
    this.items.push(order);
  }

  dequeue() {
    return this.items.shift() || null;
  }

  peek() {
    return this.items[0] || null;
  }

  size() {
    return this.items.length;
  }

  isEmpty() {
    return this.items.length === 0;
  }
}

module.exports = OrderQueue;