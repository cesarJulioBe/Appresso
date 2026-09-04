const Order = require('../domain/entities/Order');
const linearSearch = require('../domain/algorithms/linearSearch');
const binarySearch = require('../domain/algorithms/binarySearch');
const calculateStatistics = require('../domain/algorithms/calculateStatistics');
const countByStatusRecursive = require('../domain/algorithms/countByStatusRecursive');

// ===== Generador de pedidos de prueba =====
function generateOrders(size) {
  const orders = [];
  const statuses = ["Requested", "In Progress", "Delivered"];
  for (let i = 1; i <= size; i++) {
    orders.push(
      new Order(
        i,
        `Customer${i}`,
        [{ name: "Coffee", quantity: 1, price: 5000 }],
        statuses[i % 3] // reparte los pedidos entre los 3 estados
      )
    );
  }
  return orders;
}

// ===== Utilidad para medir tiempo real =====
function measureTime(fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1_000_000;
  return { result, ms };
}

// ===== Tamaños de entrada a probar =====
const sizes = [10, 100, 1000, 10000, 100000];

console.log("n".padEnd(8), "| Linear (found)".padEnd(20), "| Linear (not found)".padEnd(22), "| Binary (found)".padEnd(20), "| Binary (not found)".padEnd(22), "| Stats ops".padEnd(12), "| Recursive ops");
console.log("-".repeat(140));

for (const size of sizes) {
  const orders = generateOrders(size);
  const lastId = size;        // peor caso real para lineal: existe, pero está al final
  const missingId = size + 1; // peor caso absoluto: no existe

  const linearFound = measureTime(() => linearSearch(orders, lastId));
  const linearNotFound = measureTime(() => linearSearch(orders, missingId));
  const binaryFound = measureTime(() => binarySearch(orders, lastId));
  const binaryNotFound = measureTime(() => binarySearch(orders, missingId));
  const stats = measureTime(() => calculateStatistics(orders));

  // La recursión con arrays muy grandes puede fallar por límite de pila (stack overflow)
  let recursiveOps;
  try {
    recursiveOps = countByStatusRecursive(orders, "Delivered");
  } catch (e) {
    recursiveOps = "ERROR: " + e.message;
  }

  console.log(
    String(size).padEnd(8),
    `${linearFound.result.operationsCount} ops / ${linearFound.ms.toFixed(3)}ms`.padEnd(20),
    `${linearNotFound.result.operationsCount} ops / ${linearNotFound.ms.toFixed(3)}ms`.padEnd(22),
    `${binaryFound.result.operationsCount} ops / ${binaryFound.ms.toFixed(3)}ms`.padEnd(20),
    `${binaryNotFound.result.operationsCount} ops / ${binaryNotFound.ms.toFixed(3)}ms`.padEnd(22),
    `${stats.result.operationsCount} ops`.padEnd(12),
    `${recursiveOps}`
  );
}