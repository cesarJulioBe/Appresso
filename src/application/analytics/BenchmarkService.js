const {
  measureExecution,
  linearSearchRecord,
  binarySearchRecord,
  sumSalesLinear,
  countOrdersByCustomerQuadratic,
  countOrdersByCustomerLinear,
  bubbleSortRecords,
  mergeSortRecords,
  rankTopItemsQuadratic,
  rankTopItemsOptimized,
  normalizeAndUnifyStringsQuadratic,
  normalizeAndUnifyStringsLinear,
  runExperimentalBenchmarkSuite,
} = require('../../domain/algorithms/operationalAlgorithms');

class BenchmarkService {
  constructor({
    orderRepository,
    billingRepository,
    transactionRepository,
    catalogRepository,
    logger,
  }) {
    this.orderRepository = orderRepository;
    this.billingRepository = billingRepository;
    this.transactionRepository = transactionRepository;
    this.catalogRepository = catalogRepository;
    this.logger = logger;
  }

  /**
   * Ejecuta y compara todos los algoritmos O(n), O(n²), O(n log n) y O(log n)
   * sobre los datos reales almacenados en la base de datos.
   */
  async analyzeSystemData({
    searchId = null,
    entity = 'orders',
    sortBy = 'date',
    sizes = [100, 500, 1000, 2500],
  } = {}) {
    const [orders, invoices, payments, transactions, items] = await Promise.all([
      this.orderRepository.findAllUnpaginated(),
      this.billingRepository.listInvoices(),
      this.billingRepository.listPayments(),
      this.transactionRepository.findAll(),
      this.catalogRepository.listItems(),
    ]);

    const entityRecordsMap = {
      orders,
      invoices,
      facturas: invoices,
      payments,
      pagos: payments,
      transactions,
      transacciones: transactions,
    };

    const selectedRecords = entityRecordsMap[entity] || orders;
    const sortedById = [...selectedRecords].sort(
      (a, b) => Number(a.id ?? a.id_txn ?? 0) - Number(b.id ?? b.id_txn ?? 0)
    );

    const targetId =
      searchId !== null && searchId !== undefined && searchId !== ''
        ? searchId
        : sortedById[sortedById.length - 1]?.id ?? 1;

    // 1. Búsqueda por ID: Lineal O(n) vs Binaria O(log n)
    const linearSearchRes = measureExecution(() =>
      linearSearchRecord(sortedById, targetId, 'id')
    );
    const binarySearchRes = measureExecution(() =>
      binarySearchRecord(sortedById, targetId, 'id')
    );

    // 2. Suma de ventas O(n)
    const salesOrdersSum = measureExecution(() => sumSalesLinear(orders));
    const salesInvoicesSum = measureExecution(() => sumSalesLinear(invoices));

    // 3. Conteo de pedidos por cliente O(n²) vs O(n)
    const customerCountQuad = measureExecution(() =>
      countOrdersByCustomerQuadratic(orders)
    );
    const customerCountLin = measureExecution(() =>
      countOrdersByCustomerLinear(orders)
    );

    // 4. Ordenamiento por fecha y por monto: O(n²) Bubble Sort vs O(n log n) Merge Sort
    const bubbleSortDate = measureExecution(() =>
      bubbleSortRecords(selectedRecords, sortBy, 'desc')
    );
    const mergeSortDate = measureExecution(() =>
      mergeSortRecords(selectedRecords, sortBy, 'desc')
    );

    // 5. Ranking de ítems más vendidos: O(n²) vs O(n + k log k)
    const topItemsQuad = measureExecution(() => rankTopItemsQuadratic(orders, 10));
    const topItemsOpt = measureExecution(() => rankTopItemsOptimized(orders, 10));

    // 6. Normalización y unificación de strings: O(n²) vs O(n)
    const allProductStrings = [
      ...items.map((i) => i.nombre),
      ...orders.flatMap((o) => (o.products || []).map((p) => p.name || p.nombre)),
    ].filter(Boolean);

    const stringNormQuad = measureExecution(() =>
      normalizeAndUnifyStringsQuadratic(allProductStrings)
    );
    const stringNormLin = measureExecution(() =>
      normalizeAndUnifyStringsLinear(allProductStrings)
    );

    // 7. Benchmark experimental escalable (n = 100, 500, 1000, 2500)
    const experimentalBenchmark = runExperimentalBenchmarkSuite(sizes);

    return {
      liveSystemMetrics: {
        datasetCounts: {
          orders: orders.length,
          invoices: invoices.length,
          payments: payments.length,
          transactions: transactions.length,
          items: items.length,
        },
        searchById: {
          entity,
          targetId,
          foundRecord: linearSearchRes.found || binarySearchRes.found,
          linear: {
            operationsCount: linearSearchRes.operationsCount,
            timeMs: linearSearchRes.timeMs,
            complexity: 'O(n)',
          },
          binary: {
            operationsCount: binarySearchRes.operationsCount,
            timeMs: binarySearchRes.timeMs,
            complexity: 'O(log n)',
          },
        },
        salesAggregation: {
          orders: salesOrdersSum,
          invoices: salesInvoicesSum,
        },
        customerOrderCounts: {
          customers: customerCountLin.customers.slice(0, 15),
          uniqueCustomers: customerCountLin.uniqueCustomers,
          quadratic: {
            operationsCount: customerCountQuad.operationsCount,
            timeMs: customerCountQuad.timeMs,
            complexity: 'O(n²)',
          },
          linearOptimized: {
            operationsCount: customerCountLin.operationsCount,
            timeMs: customerCountLin.timeMs,
            complexity: 'O(n)',
          },
        },
        sortingComparison: {
          entity,
          sortBy,
          sampleTop5: mergeSortDate.sorted.slice(0, 5),
          bubbleSort: {
            operationsCount: bubbleSortDate.operationsCount,
            timeMs: bubbleSortDate.timeMs,
            complexity: 'O(n²)',
          },
          mergeSort: {
            operationsCount: mergeSortDate.operationsCount,
            timeMs: mergeSortDate.timeMs,
            complexity: 'O(n log n)',
          },
        },
        topSellingItems: {
          ranking: topItemsOpt.ranking,
          totalUniqueItems: topItemsOpt.totalUniqueItems,
          quadratic: {
            operationsCount: topItemsQuad.operationsCount,
            timeMs: topItemsQuad.timeMs,
            complexity: 'O(n²)',
          },
          optimized: {
            operationsCount: topItemsOpt.operationsCount,
            timeMs: topItemsOpt.timeMs,
            complexity: 'O(n + k log k)',
          },
        },
        stringNormalization: {
          totalStringsEvaluated: allProductStrings.length,
          unifiedCount: stringNormLin.unifiedCount,
          duplicatesRemoved: stringNormLin.duplicatesRemoved,
          sampleGroups: stringNormLin.groups.slice(0, 10),
          quadratic: {
            operationsCount: stringNormQuad.operationsCount,
            timeMs: stringNormQuad.timeMs,
            complexity: 'O(n²)',
          },
          linearOptimized: {
            operationsCount: stringNormLin.operationsCount,
            timeMs: stringNormLin.timeMs,
            complexity: 'O(n)',
          },
        },
      },
      experimentalBenchmark,
    };
  }
}

module.exports = BenchmarkService;
