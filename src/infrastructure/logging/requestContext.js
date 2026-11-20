const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithContext(context, fn) {
  return storage.run(context, fn);
}

function getContext() {
  return storage.getStore() || {};
}

function getRequestId() {
  const store = storage.getStore();
  return store ? store.requestId : undefined;
}

module.exports = {
  runWithContext,
  getContext,
  getRequestId,
};
