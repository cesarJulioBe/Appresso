class OperationalController {
  constructor({
    operationalService,
    dataQualityService,
    benchmarkService,
    aiService,
  }) {
    this.operationalService = operationalService;
    this.dataQualityService = dataQualityService;
    this.benchmarkService = benchmarkService;
    this.aiService = aiService;
  }

  // ===== USUARIOS =====

  async listUsers(_req, res) {
    const users = await this.operationalService.listUsers();
    res.json({ users });
  }

  async createUser(req, res) {
    const result = await this.operationalService.createUser(req.body);
    res.status(201).json(result);
  }

  async updateUser(req, res) {
    const result = await this.operationalService.updateUser(
      Number(req.params.id),
      req.body
    );
    res.json(result);
  }

  async deleteUser(req, res) {
    const deleted = await this.operationalService.deleteUser(Number(req.params.id));
    res.json({ deleted });
  }

  // ===== CATEGORÍAS =====

  async listCategories(_req, res) {
    const categories = await this.operationalService.listCategories();
    res.json({ categories });
  }

  async createCategory(req, res) {
    const result = await this.operationalService.createCategory(req.body);
    res.status(201).json(result);
  }

  async updateCategory(req, res) {
    const result = await this.operationalService.updateCategory(
      Number(req.params.id),
      req.body
    );
    res.json(result);
  }

  async deleteCategory(req, res) {
    const deleted = await this.operationalService.deleteCategory(Number(req.params.id));
    res.json({ deleted });
  }

  // ===== ÍTEMS (INVENTARIO) =====

  async listItems(_req, res) {
    const items = await this.operationalService.listItems();
    res.json({ items });
  }

  async createItem(req, res) {
    const result = await this.operationalService.createItem(req.body);
    res.status(201).json(result);
  }

  async updateItem(req, res) {
    const result = await this.operationalService.updateItem(
      Number(req.params.id),
      req.body
    );
    res.json(result);
  }

  async deleteItem(req, res) {
    const deleted = await this.operationalService.deleteItem(Number(req.params.id));
    res.json({ deleted });
  }

  // ===== PEDIDOS MULTICANAL =====

  async createOperationalOrder(req, res) {
    const result = await this.operationalService.createOperationalOrder(req.body);
    res.status(201).json(result);
  }

  async cancelOrder(req, res) {
    const result = await this.operationalService.cancelOrder(Number(req.params.id));
    res.json(result);
  }

  // ===== FACTURAS =====

  async listInvoices(_req, res) {
    const invoices = await this.operationalService.listInvoices();
    res.json({ invoices });
  }

  async createInvoice(req, res) {
    const result = await this.operationalService.generateInvoice(req.body);
    res.status(201).json(result);
  }

  async cancelInvoice(req, res) {
    const result = await this.operationalService.cancelInvoice(
      Number(req.params.id),
      req.body?.reason
    );
    res.json(result);
  }

  // ===== PAGOS CON COMPROBANTE =====

  async listPayments(_req, res) {
    const payments = await this.operationalService.listPayments();
    res.json({ payments });
  }

  async processPayment(req, res) {
    const result = await this.operationalService.processPayment(req.body);
    res.status(201).json(result);
  }

  // ===== CALIDAD Y LIMPIEZA DE DATOS =====

  async getQualityReport(_req, res) {
    const report = await this.dataQualityService.getQualityReport();
    res.json(report);
  }

  async runAutoClean(_req, res) {
    const result = await this.dataQualityService.runAutoClean();
    res.json(result);
  }

  async seedDirtyData(_req, res) {
    const result = await this.dataQualityService.seedDirtyData();
    res.status(201).json(result);
  }

  // ===== INTEGRIDAD Y HASH ENCADENADO =====

  async verifyIntegrity(_req, res) {
    const report = await this.operationalService.verifyIntegrity();
    res.json(report);
  }

  async simulateTampering(req, res) {
    const report = await this.operationalService.simulateTampering(req.body || {});
    res.json(report);
  }

  async restoreIntegrity(_req, res) {
    const report = await this.operationalService.restoreIntegrityChain();
    res.json(report);
  }

  // ===== ALGORITMOS Y BENCHMARK EXPERIMENTAL =====

  async runBenchmarks(req, res) {
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
  }

  // ===== INTELIGENCIA ARTIFICIAL NO LLM (KERAS/TENSORFLOW + SIMPLE STATISTICS) =====

  async getAiStatus(_req, res) {
    const status = await this.aiService.getModelsStatus();
    res.json(status);
  }

  async trainAiModels(req, res) {
    const result = await this.aiService.trainModels(req.body || {});
    res.json(result);
  }

  async classifyOperation(req, res) {
    const result = await this.aiService.classifyOperation(req.body || {});
    res.json(result);
  }

  async classifyRecentOperations(req, res) {
    const limit = Number(req.query.limit) || 20;
    const result = await this.aiService.classifyRecentOperations(limit);
    res.json(result);
  }

  async predictDemand(req, res) {
    const result = await this.aiService.predictDemandAndAmount(req.body || {});
    res.json(result);
  }

  async getUserProfiles(_req, res) {
    const result = await this.aiService.getUserBehaviorAnomalies();
    res.json(result);
  }

  async getOperationalPatterns(_req, res) {
    const result = await this.aiService.getOperationalPatterns();
    res.json(result);
  }

  // ===== RESUMEN EJECUTIVO DEL PANEL =====

  async getExecutiveSummary(_req, res) {
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
  }
}

module.exports = OperationalController;
