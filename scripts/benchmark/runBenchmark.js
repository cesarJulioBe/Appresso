/**
 * ============================================================================
 * ARCHIVO: scripts/benchmark/runBenchmark.js
 * CAPA: Script Experimental CLI (`npm run benchmark`)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA:
 *   Ejecutar desde consola la suite experimental unificada de `operationalAlgorithms.js`
 *   comparando algoritmos O(n), O(n²), O(n log n) y O(log n) en distintos tamaños
 *   de entrada (n = 100, 500, 1000, 2500) e imprimir las tablas de operaciones
 *   y milisegundos reales medidos con `process.hrtime.bigint()`.
 * ============================================================================
 */

const {
  runExperimentalBenchmarkSuite,
} = require('../../src/domain/algorithms/operationalAlgorithms');

const sizes = [100, 500, 1000, 2500];
const suite = runExperimentalBenchmarkSuite(sizes);

console.log('\n=== 1. BÚSQUEDA POR ID: LINEAL O(n) vs BINARIA O(log n) & SUMA DE VENTAS O(n) ===');
console.log(
  'n'.padEnd(8),
  '| Lineal O(n)'.padEnd(24),
  '| Binaria O(log n)'.padEnd(24),
  '| Reducción Ops'.padEnd(18),
  '| Suma Ventas O(n)'
);
console.log('-'.repeat(105));

for (const exp of suite.experiments) {
  console.log(
    String(exp.n).padEnd(8),
    `${exp.search.linear.ops} ops / ${exp.search.linear.timeMs.toFixed(3)}ms`.padEnd(24),
    `${exp.search.binary.ops} ops / ${exp.search.binary.timeMs.toFixed(3)}ms`.padEnd(24),
    `${exp.search.opsReductionRatio}x menos`.padEnd(18),
    `${exp.salesSum.ops} ops / ${exp.salesSum.timeMs.toFixed(3)}ms`
  );
}

console.log('\n=== 2. ORDENAMIENTO, CONTEO POR CLIENTE, RANKING TOP ÍTEMS Y NORMALIZACIÓN ===');
console.log(
  'n'.padEnd(8),
  '| BubbleSort O(n²)'.padEnd(24),
  '| MergeSort O(n log n)'.padEnd(24),
  '| Conteo Cliente O(n²)'.padEnd(24),
  '| Conteo Cliente O(n)'.padEnd(22),
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
