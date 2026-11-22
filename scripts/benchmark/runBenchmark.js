const Order = require('../../src/domain/entities/Order');
const linearSearch = require('../../src/domain/algorithms/linearSearch');
const binarySearch = require('../../src/domain/algorithms/binarySearch');
const calculateStatistics = require('../../src/domain/algorithms/calculateStatistics');
const countByStatusRecursive = require('../../src/domain/algorithms/countByStatusRecursive');
const {
  runExperimentalBenchmarkSuite,
} = require('../../src/domain/algorithms/operationalAlgorithms');

// ===== Generador de pedidos de prueba =====
function generateOrders(size) {
  const orders = [];
  const statuses = ['Requested', 'In Progress', 'Delivered'];
  for (let i = 1; i <= size; i++) {
    orders.push(
      new Order(
        i,
        `Customer${i}`,
        [{ name: 'Coffee', quantity: 1, price: 5000 }],
        statuses[i % 3]
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

// ===== 1. Benchmark de Búsqueda y Estadísticas =====
const sizes = [10, 100, 1000, 10000, 100000];

console.log('\n=== 1. BENCHMARK DE BÚSQUEDA LINEAL O(n) vs BINARIA O(log n) & ESTADÍSTICAS ===');
console.log(
  'n'.padEnd(8),
  '| Linear (found)'.padEnd(20),
  '| Linear (not found)'.padEnd(22),
  '| Binary (found)'.padEnd(20),
  '| Binary (not found)'.padEnd(22),
  '| Stats ops'.padEnd(12),
  '| Recursive ops'
);
console.log('-'.repeat(140));

for (const size of sizes) {
  const orders = generateOrders(size);
  const lastId = size;
  const missingId = size + 1;

  const linearFound = measureTime(() => linearSearch(orders, lastId));
  const linearNotFound = measureTime(() => linearSearch(orders, missingId));
  const binaryFound = measureTime(() => binarySearch(orders, lastId));
  const binaryNotFound = measureTime(() => binarySearch(orders, missingId));
  const stats = measureTime(() => calculateStatistics(orders));

  let recursiveOps;
  try {
    recursiveOps = countByStatusRecursive(orders, 'Delivered');
  } catch (e) {
    recursiveOps = 'ERROR: ' + e.message;
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

// ===== 2. Benchmark Experimental Comparativo O(n) vs O(n²) vs O(n log n) =====
console.log('\n=== 2. BENCHMARK EXPERIMENTAL DE COMPLEJIDAD O(n), O(n²) Y O(n log n) ===');
const suite = runExperimentalBenchmarkSuite([100, 500, 1000, 2500]);

console.log(
  'n'.padEnd(8),
  '| BubbleSort O(n²)'.padEnd(24),
  '| MergeSort O(n log n)'.padEnd(24),
  '| Count Cliente O(n²)'.padEnd(24),
  '| Count Cliente O(n)'.padEnd(22),
  '| Top Ítems O(n log n)'.padEnd(22),
  '| Normalizar O(n)'
);
console.log('-'.repeat(148));

for (const exp of suite.experiments) {
  console.log(
    String(exp.n).padEnd(8),
    `${exp.sortingByDate.bubbleSort.ops} ops / ${exp.sortingByDate.bubbleSort.timeMs.toFixed(2)}ms`.padEnd(24),
    `${exp.sortingByDate.mergeSort.ops} ops / ${exp.sortingByDate.mergeSort.timeMs.toFixed(2)}ms`.padEnd(24),
    `${exp.customerOrderCount.quadratic.ops} ops / ${exp.customerOrderCount.quadratic.timeMs.toFixed(2)}ms`.padEnd(24),
    `${exp.customerOrderCount.linearHash.ops} ops / ${exp.customerOrderCount.linearHash.timeMs.toFixed(2)}ms`.padEnd(22),
    `${exp.topItemsRanking.optimized.ops} ops / ${exp.topItemsRanking.optimized.timeMs.toFixed(2)}ms`.padEnd(22),
    `${exp.stringNormalization.linearHash.ops} ops / ${exp.stringNormalization.linearHash.timeMs.toFixed(2)}ms`
  );
}
