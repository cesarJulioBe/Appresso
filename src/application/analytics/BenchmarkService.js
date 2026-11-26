/**
 * @file BenchmarkService.js
 * @description Caso de uso de análisis experimental de complejidad algorítmica asintótica
 * ($O(\log n)$, $O(n)$, $O(n \log n)$ y $O(n^2)$) ejecutado tanto sobre los datos reales persistidos
 * en PostgreSQL como sobre baterías sintéticas escalables ($n \in \{100, 500, 1000, 2500\}$).
 *
 * - **Capa arquitectónica:** Aplicación - Casos de Uso (`src/application/analytics`).
 * - **Inyección de Dependencias (`container.js`):** Recibe desde `buildContainer()` en `src/container.js`:
 *   - `orderRepository`: Instancia de `OrderRepository` (`findAllUnpaginated`).
 *   - `billingRepository`: Instancia de `BillingRepository` (`listInvoices`, `listPayments`).
 *   - `transactionRepository`: Instancia de `TransactionRepository` (`findAll`).
 *   - `catalogRepository`: Instancia de `CatalogRepository` (`listItems`).
 *   - `logger`: Logger contextualizado con `childLogger('BenchmarkService')`.
 * - **Controlador HTTP que dispara cada método (`OperationalController` en `src/interfaces/http/routes/operational.routes.js`):**
 *   1. `analyzeSystemData(...)` <- `OperationalController.runBenchmarks` (`GET /operational/benchmarks`).
 * - **Delegación a Dominio y Repositorios:**
 *   - Dominio: `operationalAlgorithms.js` (`measureExecution`, `linearSearchRecord`, `binarySearchRecord`,
 *     `sumSalesLinear`, `countOrdersByCustomerQuadratic`, `countOrdersByCustomerLinear`, `bubbleSortRecords`,
 *     `mergeSortRecords`, `rankTopItemsQuadratic`, `rankTopItemsOptimized`,
 *     `normalizeAndUnifyStringsQuadratic`, `normalizeAndUnifyStringsLinear`, `runExperimentalBenchmarkSuite`).
 *   - Repositorios: `OrderRepository`, `BillingRepository`, `TransactionRepository`, `CatalogRepository`.
 */

// Importa los algoritmos puros de dominio y el cronómetro de alta resolución `measureExecution`
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
  /**
   * Construye el servicio de benchmarking inyectando los cuatro repositorios cuyas tablas alimentan las pruebas reales.
   *
   * @param {Object} deps Dependencias inyectadas por `container.js`.
   * @param {Object} deps.orderRepository Repositorio de pedidos.
   * @param {Object} deps.billingRepository Repositorio de facturación y pagos.
   * @param {Object} deps.transactionRepository Repositorio de transacciones antifraude.
   * @param {Object} deps.catalogRepository Repositorio de catálogo de productos.
   * @param {Object} [deps.logger] Logger estructurado opcional.
   */
  constructor({
    orderRepository,
    billingRepository,
    transactionRepository,
    catalogRepository,
    logger,
  }) {
    // Guarda referencias a los cuatro repositorios de datos operativos
    this.orderRepository = orderRepository;
    this.billingRepository = billingRepository;
    this.transactionRepository = transactionRepository;
    this.catalogRepository = catalogRepository;
    this.logger = logger;
  }

  /**
   * Ejecuta y cronometra comparativamente las versiones ingenuas ($O(n^2)$ / $O(n)$) frente a las
   * versiones optimizadas ($O(\log n)$ / $O(n)$ / $O(n \log n)$) sobre registros reales de la BD
   * y complementa con curvas experimentales sintéticas de escalabilidad.
   *
   * Se dispara desde `OperationalController.runBenchmarks` al recibir `GET /operational/benchmarks`.
   * Nota: Los parámetros de consulta (`entity`, `sortBy`, `sizes`, `searchId`) son opcionales con valores
   * por defecto seguros aplicados UNA SOLA VEZ aquí en el Servicio, sin validaciones redundantes en HTTP.
   *
   * @param {Object} [options={}] Opciones de ejecución del benchmark.
   * @param {number|string|null} [options.searchId=null] ID puntual a buscar (si se omite, busca el último ID para medir el peor caso lineal).
   * @param {string} [options.entity='orders'] Entidad objetivo para búsqueda y ordenamiento (`orders`, `invoices`, `payments`, `transactions`).
   * @param {string} [options.sortBy='date'] Campo criterio de ordenamiento (`date` o `amount`).
   * @param {number[]} [options.sizes=[100, 500, 1000, 2500]] Tamaños de muestra $n$ para la suite sintética escalable.
   * @returns {Promise<Object>} Métricas medidas sobre datos vivos y resultados de la batería experimental.
   */
  async analyzeSystemData({
    searchId = null,
    entity = 'orders',
    sortBy = 'date',
    sizes = [100, 500, 1000, 2500],
  } = {}) {
    // 0. Carga concurrentemente (`Promise.all`) las cinco colecciones reales de PostgreSQL minimizando latencia de E/S
    const [orders, invoices, payments, transactions, items] = await Promise.all([
      this.orderRepository.findAllUnpaginated(),
      this.billingRepository.listInvoices(),
      this.billingRepository.listPayments(),
      this.transactionRepository.findAll(),
      this.catalogRepository.listItems(),
    ]);

    // Diccionario de alias en inglés y español para resolver la colección solicitada en `entity`
    const entityRecordsMap = {
      orders,
      invoices,
      facturas: invoices,
      payments,
      pagos: payments,
      transactions,
      transacciones: transactions,
    };

    // Selecciona la colección correspondiente o recurre a `orders` como colección por defecto
    const selectedRecords = entityRecordsMap[entity] || orders;
    // Crea una copia ordenada ascendentemente por clave primaria (`id` o `id_txn`), precondición obligatoria de `binarySearchRecord`
    const sortedById = [...selectedRecords].sort(
      (a, b) => Number(a.id ?? a.id_txn ?? 0) - Number(b.id ?? b.id_txn ?? 0)
    );

    // Determina el ID a buscar: usa `searchId` si fue provisto; de lo contrario toma el último ID (peor caso de búsqueda lineal O(n))
    const targetId =
      searchId !== null && searchId !== undefined && searchId !== ''
        ? searchId
        : sortedById[sortedById.length - 1]?.id ?? 1;

    // 1. Experimento de Búsqueda por ID: Búsqueda Lineal O(n) vs Búsqueda Binaria O(log n)
    const linearSearchRes = measureExecution(() =>
      linearSearchRecord(sortedById, targetId, 'id')
    );
    const binarySearchRes = measureExecution(() =>
      binarySearchRecord(sortedById, targetId, 'id')
    );

    // 2. Experimento de Agregación en una sola pasada O(n) sobre pedidos y sobre facturas
    const salesOrdersSum = measureExecution(() => sumSalesLinear(orders));
    const salesInvoicesSum = measureExecution(() => sumSalesLinear(invoices));

    // 3. Experimento de Agrupación de Pedidos por Cliente: Bucles anidados O(n²) vs Hash Map O(n)
    const customerCountQuad = measureExecution(() =>
      countOrdersByCustomerQuadratic(orders)
    );
    const customerCountLin = measureExecution(() =>
      countOrdersByCustomerLinear(orders)
    );

    // 4. Experimento de Ordenamiento de Registros: Bubble Sort O(n²) vs Merge Sort O(n log n)
    const bubbleSortDate = measureExecution(() =>
      bubbleSortRecords(selectedRecords, sortBy, 'desc')
    );
    const mergeSortDate = measureExecution(() =>
      mergeSortRecords(selectedRecords, sortBy, 'desc')
    );

    // 5. Experimento de Top-10 Ítems Más Vendidos: Escaneo cuadrático O(n²) vs Mapa + Sort parcial O(n + k log k)
    const topItemsQuad = measureExecution(() => rankTopItemsQuadratic(orders, 10));
    const topItemsOpt = measureExecution(() => rankTopItemsOptimized(orders, 10));

    // 6. Experimento de Normalización y Deduplicación de Textos de Productos: Comparación por pares O(n²) vs Set/Map canónico O(n)
    const allProductStrings = [
      // Extrae nombres actuales del catálogo de inventario
      ...items.map((i) => i.nombre),
      // Extrae nombres históricos embebidos dentro del JSON de productos de cada pedido
      ...orders.flatMap((o) => (o.products || []).map((p) => p.name || p.nombre)),
    ].filter(Boolean); // Filtra nulos o cadenas vacías

    // Mide el tiempo y conteo de operaciones de la deduplicación cuadrática
    const stringNormQuad = measureExecution(() =>
      normalizeAndUnifyStringsQuadratic(allProductStrings)
    );
    // Mide el tiempo y conteo de operaciones de la deduplicación lineal con tabla hash
    const stringNormLin = measureExecution(() =>
      normalizeAndUnifyStringsLinear(allProductStrings)
    );

    // 7. Ejecuta la suite sintética controlada sobre tamaños crecientes `sizes` para graficar curvas empíricas de crecimiento
    const experimentalBenchmark = runExperimentalBenchmarkSuite(sizes);

    // Ensambla y retorna el reporte comparativo completo listo para el dashboard de ingeniería
    return {
      liveSystemMetrics: {
        // Volumen real actual de cada tabla analizada
        datasetCounts: {
          orders: orders.length,
          invoices: invoices.length,
          payments: payments.length,
          transactions: transactions.length,
          items: items.length,
        },
        // Resultados comparativos O(n) vs O(log n) en búsqueda
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
        // Resultados de suma lineal O(n)
        salesAggregation: {
          orders: salesOrdersSum,
          invoices: salesInvoicesSum,
        },
        // Resultados comparativos O(n²) vs O(n) en conteo por cliente
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
        // Resultados comparativos Bubble Sort O(n²) vs Merge Sort O(n log n)
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
        // Resultados comparativos en ranking de productos más vendidos
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
        // Resultados comparativos en unificación canónica de cadenas
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
      // Curvas experimentales multi-escala
      experimentalBenchmark,
    };
  }
}

module.exports = BenchmarkService;
