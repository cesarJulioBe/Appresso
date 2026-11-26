/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/controllers/OperationalController.js
 * CAPA: Interfaces HTTP — Controlador Unificado ERP, Calidad, Integridad,
 *       Benchmark Experimental e Inteligencia Artificial No LLM
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP) Y ESTANDARIZACIÓN DE CÓDIGO:
 *   Actuar exclusivamente como adaptador HTTP para los módulos del trabajo final:
 *     1. Módulos Operativos (`OperationalService`): Usuarios, Categorías, Ítems,
 *        Pedidos Multicanal con descuento de stock, Facturas y Pagos.
 *     2. Calidad y Limpieza de Datos (`DataQualityService`).
 *     3. Integridad Criptográfica Hash Chain (`OperationalService`).
 *     4. Algoritmos y Benchmark Experimental (`BenchmarkService`).
 *     5. Modelos de IA No LLM (`AiService`: Keras/TensorFlow + Simple Statistics).
 *
 * BUENA PRÁCTICA APLICADA:
 *   Todos los métodos usan *class field arrow functions* (`fn = async (req, res) =>`),
 *   igual que el resto de controladores del proyecto, permitiendo pasarlos
 *   directamente a `asyncHandler(controller.fn)` sin funciones envolventes repetidas.
 * ============================================================================
 */

class OperationalController {
  constructor({
    operationalService,
    dataQualityService,
    benchmarkService,
    aiService,
  }) {
    // Servicios de casos de uso inyectados desde `src/container.js`
    this.operationalService = operationalService;
    this.dataQualityService = dataQualityService;
    this.benchmarkService = benchmarkService;
    this.aiService = aiService;
  }

  // ===== 1. USUARIOS CON ROLES ('cliente' | 'empleado' | 'admin') =====

  // Dispara: GET /operational/users
  listUsers = async (_req, res) => {
    const users = await this.operationalService.listUsers();
    res.json({ users });
  };

  // Dispara: POST /operational/users
  createUser = async (req, res) => {
    const result = await this.operationalService.createUser(req.body);
    res.status(201).json(result);
  };

  // Dispara: PUT /operational/users/:id
  updateUser = async (req, res) => {
    const result = await this.operationalService.updateUser(
      Number(req.params.id),
      req.body
    );
    res.json(result);
  };

  // Dispara: DELETE /operational/users/:id
  deleteUser = async (req, res) => {
    const deleted = await this.operationalService.deleteUser(Number(req.params.id));
    res.json({ deleted });
  };

  // ===== 2. CATEGORÍAS (CON NORMALIZACIÓN Y UNIFICACIÓN AUTOMÁTICA) =====

  // Dispara: GET /operational/categories
  listCategories = async (_req, res) => {
    const categories = await this.operationalService.listCategories();
    res.json({ categories });
  };

  // Dispara: POST /operational/categories
  createCategory = async (req, res) => {
    const result = await this.operationalService.createCategory(req.body);
    res.status(201).json(result);
  };

  // Dispara: PUT /operational/categories/:id
  updateCategory = async (req, res) => {
    const result = await this.operationalService.updateCategory(
      Number(req.params.id),
      req.body
    );
    res.json(result);
  };

  // Dispara: DELETE /operational/categories/:id
  deleteCategory = async (req, res) => {
    const deleted = await this.operationalService.deleteCategory(Number(req.params.id));
    res.json({ deleted });
  };

  // ===== 3. ÍTEMS / CATÁLOGO DE PRODUCTOS Y STOCK =====

  // Dispara: GET /operational/items
  listItems = async (_req, res) => {
    const items = await this.operationalService.listItems();
    res.json({ items });
  };

  // Dispara: POST /operational/items
  createItem = async (req, res) => {
    const result = await this.operationalService.createItem(req.body);
    res.status(201).json(result);
  };

  // Dispara: PUT /operational/items/:id
  updateItem = async (req, res) => {
    const result = await this.operationalService.updateItem(
      Number(req.params.id),
      req.body
    );
    res.json(result);
  };

  // Dispara: DELETE /operational/items/:id
  deleteItem = async (req, res) => {
    const deleted = await this.operationalService.deleteItem(Number(req.params.id));
    res.json({ deleted });
  };

  // ===== 4. PEDIDOS MULTICANAL CON CONSULTA, ESTADOS Y DESCUENTO DE INVENTARIO =====

  // Dispara: GET /operational/orders?page=1&pageSize=20
  listOperationalOrders = async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const result = await this.operationalService.listOperationalOrders(page, pageSize);
    res.json(result);
  };

  // Dispara: POST /operational/orders
  createOperationalOrder = async (req, res) => {
    const result = await this.operationalService.createOperationalOrder(req.body);
    res.status(201).json(result);
  };

  // Dispara: PATCH /operational/orders/:id/status
  updateOperationalOrderStatus = async (req, res) => {
    const result = await this.operationalService.updateOperationalOrderStatus(
      Number(req.params.id),
      req.body.status
    );
    res.json(result);
  };

  // Dispara: POST /operational/orders/:id/cancel
  cancelOrder = async (req, res) => {
    const result = await this.operationalService.cancelOrder(Number(req.params.id));
    res.json(result);
  };

  // ===== 5. FACTURACIÓN CON IMPUESTOS, DESCUENTOS, CONSECUTIVO Y HASH ENCADENADO =====

  // Dispara: GET /operational/invoices
  listInvoices = async (_req, res) => {
    const invoices = await this.operationalService.listInvoices();
    res.json({ invoices });
  };

  // Dispara: POST /operational/invoices
  createInvoice = async (req, res) => {
    const result = await this.operationalService.generateInvoice(req.body);
    res.status(201).json(result);
  };

  // Dispara: POST /operational/invoices/:id/cancel
  cancelInvoice = async (req, res) => {
    const result = await this.operationalService.cancelInvoice(
      Number(req.params.id),
      req.body?.reason
    );
    res.json(result);
  };

  // ===== 6. PAGOS CON COMPROBANTE ADJUNTO Y HASH ENCADENADO =====

  // Dispara: GET /operational/payments
  listPayments = async (_req, res) => {
    const payments = await this.operationalService.listPayments();
    res.json({ payments });
  };

  // Dispara: POST /operational/payments
  processPayment = async (req, res) => {
    const result = await this.operationalService.processPayment(req.body);
    res.status(201).json(result);
  };

  // ===== 7. CALIDAD Y LIMPIEZA AUTOMÁTICA DE DATOS =====

  // Dispara: GET /operational/quality/report
  getQualityReport = async (_req, res) => {
    const report = await this.dataQualityService.getQualityReport();
    res.json(report);
  };

  // Dispara: POST /operational/quality/clean
  runAutoClean = async (_req, res) => {
    const result = await this.dataQualityService.runAutoClean();
    res.json(result);
  };

  // Dispara: POST /operational/quality/seed-dirty
  seedDirtyData = async (_req, res) => {
    const result = await this.dataQualityService.seedDirtyData();
    res.status(201).json(result);
  };

  // ===== 8. INTEGRIDAD CRIPTOGRÁFICA (CADENA DE HASHES) =====

  // Dispara: GET /operational/integrity/verify
  verifyIntegrity = async (_req, res) => {
    const report = await this.operationalService.verifyIntegrity();
    res.json(report);
  };

  // Dispara: POST /operational/integrity/tamper-demo
  simulateTampering = async (req, res) => {
    const report = await this.operationalService.simulateTampering(req.body || {});
    res.json(report);
  };

  // Dispara: POST /operational/integrity/restore
  restoreIntegrity = async (_req, res) => {
    const report = await this.operationalService.restoreIntegrityChain();
    res.json(report);
  };

  // ===== 9. ALGORITMOS O(n), O(n²), O(n log n) Y BENCHMARK EXPERIMENTAL =====

  // Dispara: GET /operational/benchmarks
  runBenchmarks = async (req, res) => {
    const { searchId, entity = 'orders', sortBy = 'date', maxSize } = req.query;
    const sizes = maxSize
      ? [100, 500, 1000, Math.min(5000, Number(maxSize) || 2500)]
      : [100, 500, 1000, 2500];

    const result = await this.benchmarkService.analyzeSystemData({
      searchId,
      entity,
      sortBy,
      sizes,
    });
    res.json(result);
  };

  // ===== 10. MODELOS DE IA NO LLM (KERAS/TENSORFLOW + SIMPLE STATISTICS) =====

  // Dispara: GET /ai/status
  getAiStatus = async (_req, res) => {
    const status = await this.aiService.getModelsStatus();
    res.json(status);
  };

  // Dispara: POST /ai/train
  trainAiModels = async (req, res) => {
    const result = await this.aiService.trainModels(req.body || {});
    res.json(result);
  };

  // Dispara: POST /ai/classify
  classifyOperation = async (req, res) => {
    const result = await this.aiService.classifyOperation(req.body || {});
    res.json(result);
  };

  // Dispara: GET /ai/classify-recent
  classifyRecentOperations = async (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const result = await this.aiService.classifyRecentOperations(limit);
    res.json(result);
  };

  // Dispara: POST /ai/predict-demand
  predictDemand = async (req, res) => {
    const result = await this.aiService.predictDemandAndAmount(req.body || {});
    res.json(result);
  };

  // Dispara: GET /ai/user-profiles
  getUserProfiles = async (_req, res) => {
    const result = await this.aiService.getUserBehaviorAnomalies();
    res.json(result);
  };

  // Dispara: GET /ai/patterns
  getOperationalPatterns = async (_req, res) => {
    const result = await this.aiService.getOperationalPatterns();
    res.json(result);
  };

  // ===== 11. RESUMEN CONSOLIDADO DEL SISTEMA =====

  // Dispara: GET /operational/summary
  getExecutiveSummary = async (_req, res) => {
    const [
      users,
      categories,
      items,
      invoices,
      payments,
      quality,
      integrity,
      userProfiles,
      aiStatus,
    ] = await Promise.all([
      this.operationalService.listUsers(),
      this.operationalService.listCategories(),
      this.operationalService.listItems(),
      this.operationalService.listInvoices(),
      this.operationalService.listPayments(),
      this.dataQualityService.getQualityReport(),
      this.operationalService.verifyIntegrity(),
      this.aiService.getUserBehaviorAnomalies(),
      this.aiService.getModelsStatus(),
    ]);

    const totalRevenue = invoices
      .filter((i) => i.estado !== 'Anulada')
      .reduce((acc, i) => acc + Number(i.total || 0), 0);

    return res.json({
      counts: {
        users: users.length,
        categories: categories.length,
        items: items.length,
        invoices: invoices.length,
        payments: payments.length,
      },
      totalRevenue: Number(totalRevenue.toFixed(2)),
      qualityScore: quality.qualityScore,
      qualityStatus: quality.status,
      totalQualityIssues: quality.totalIssues,
      isIntegrityValid: integrity.isSystemIntegrityValid,
      compromisedInvoices: integrity.invoices.CompromisedCount,
      compromisedPayments: integrity.payments.compromisedCount,
      suspiciousUsersCount: userProfiles.globalStats.suspiciousUsersCount,
      aiModelsReady: aiStatus.isReady,
    });
  };
}

module.exports = OperationalController;
