class ActionStack {
  constructor() {
    this.items = [];
  }

  push(action) {
    this.items.push(action);
  }

  pop() {
    return this.items.pop() || null;
  }

  peek() {
    return this.items[this.items.length - 1] || null;
  }

  size() {
    return this.items.length;
  }

  isEmpty() {
    return this.items.length === 0;
  }
}

module.exports = ActionStack;