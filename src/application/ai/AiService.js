const {
  analyzeUserBehaviorProfiles,
  predictDemandWithSimpleStatistics,
  discoverOperationalPatterns,
} = require('../../domain/ai/userBehaviorStats');
const { TfModelManager } = require('../../domain/ai/tfModelManager');

class AiService {
  constructor({
    userRepository,
    orderRepository,
    billingRepository,
    transactionRepository,
    tfModelManager = null,
    logger,
  }) {
    this.userRepository = userRepository;
    this.orderRepository = orderRepository;
    this.billingRepository = billingRepository;
    this.transactionRepository = transactionRepository;
    this.logger = logger;
    this.tfModelManager =
      tfModelManager || new TfModelManager({ logger });
  }

  async #collectSystemOperations() {
    const [users, orders, invoices, payments, transactions] = await Promise.all([
      this.userRepository.listAll(),
      this.orderRepository.findAllUnpaginated(),
      this.billingRepository.listInvoices(),
      this.billingRepository.listPayments(),
      this.transactionRepository.findAll(),
    ]);

    return { users, orders, invoices, payments, transactions };
  }

  /**
   * Obtiene el estado actual de los modelos Keras/TensorFlow y los inicializa si no están listos.
   */
  async getModelsStatus() {
    const { invoices, payments, transactions } = await this.#collectSystemOperations();
    const realOps = [...transactions, ...invoices, ...payments];
    return this.tfModelManager.ensureReady(realOps);
  }

  /**
   * Reentrena y guarda en disco los modelos Keras/TensorFlow con datos del sistema + Data Augmentation.
   */
  async trainModels({ epochs = 35, augmentationFactor = 2 } = {}) {
    const { invoices, payments, transactions } = await this.#collectSystemOperations();
    const realOps = [...transactions, ...invoices, ...payments];

    return this.tfModelManager.trainAndSaveModels({
      realOperations: realOps,
      epochs: Math.min(100, Math.max(5, Number(epochs) || 35)),
      augmentationFactor: Math.min(5, Math.max(1, Number(augmentationFactor) || 2)),
    });
  }

  /**
   * Clasifica una operación individual como NORMAL o FRAUDULENTA usando el modelo Keras/TensorFlow.
   */
  async classifyOperation(operationPayload = {}) {
    return this.tfModelManager.classifyOperation(operationPayload);
  }

  /**
   * Clasifica en lote las operaciones recientes del sistema (facturas, pagos y transacciones).
   */
  async classifyRecentOperations(limit = 20) {
    const { invoices, payments, transactions } = await this.#collectSystemOperations();
    await this.tfModelManager.ensureReady([...transactions, ...invoices, ...payments]);

    const combined = [
      ...invoices.map((inv) => ({
        sourceType: 'Factura',
        reference: inv.numero_consecutivo,
        user: inv.cliente_nombre || inv.cliente_email || `Usuario #${inv.usuario_id || 1}`,
        monto: Number(inv.total),
        fecha: inv.created_at,
        metodoPago: 'Tarjeta',
        firmaValida: inv.estado !== 'Alterada',
        frecuencia: 1,
        porcentajeDescuento: Number(inv.porcentaje_descuento || 0),
        tasaAnulacionUsuario: inv.estado === 'Anulada' ? 35 : 0,
        canal: inv.canal || 'presencial',
      })),
      ...payments.map((pay) => ({
        sourceType: 'Pago',
        reference: pay.referencia_comprobante,
        user: pay.cliente_nombre || pay.cliente_email || `Usuario #${pay.usuario_id || 1}`,
        monto: Number(pay.monto),
        fecha: pay.fecha_pago,
        metodoPago: pay.metodo_pago,
        firmaValida: pay.comprobante_valido !== false,
        frecuencia: 1,
        porcentajeDescuento: 0,
        tasaAnulacionUsuario: 0,
        canal: 'presencial',
      })),
      ...transactions.slice(-15).map((txn) => ({
        sourceType: 'Transacción',
        reference: `TXN-${txn.id_txn || txn.id}`,
        user: txn.email || `Usuario #${txn.usuario_id || 1}`,
        monto: Number(txn.valor),
        fecha: txn.fecha_txn,
        metodoPago: txn.metodo_pago,
        firmaValida: txn.estado !== 'Hash inválido',
        frecuencia: txn.es_anomalia ? 6 : 1,
        porcentajeDescuento: 0,
        tasaAnulacionUsuario: 0,
        canal: 'web',
      })),
    ];

    const slice = combined.slice(-limit).reverse();
    const results = [];

    for (const op of slice) {
      const prediction = await this.tfModelManager.classifyOperation(op);
      results.push({
        ...op,
        prediction,
      });
    }

    const fraudulentCount = results.filter((r) => r.prediction.isFraudulent).length;

    return {
      totalEvaluated: results.length,
      normalCount: results.length - fraudulentCount,
      fraudulentCount,
      results,
    };
  }

  /**
   * Predice la demanda futura y el monto esperado combinando:
   * 1. Regresión Lineal Simple con Simple Statistics (ss.linearRegression, ss.rSquared)
   * 2. Red Neuronal de Regresión Keras/TensorFlow
   */
  async predictDemandAndAmount(payload = {}) {
    const { orders, invoices } = await this.#collectSystemOperations();

    const defaultSeries =
      orders.length >= 4
        ? orders.slice(-10).map((o) =>
            typeof o.totalQuantity === 'function'
              ? o.totalQuantity() * 10
              : Number(o.total || 20000) / 1000
          )
        : [18, 21, 24, 23, 27, 31, 34];

    const series =
      Array.isArray(payload.dailySeries) && payload.dailySeries.length >= 2
        ? payload.dailySeries
        : defaultSeries;

    const horizonDays = Math.min(14, Math.max(1, Number(payload.horizonDays) || 7));
    const simpleStatsRegression = predictDemandWithSimpleStatistics(series, horizonDays);

    const kerasPrediction = await this.tfModelManager.predictExpectedDemandAndAmount({
      dayOfWeek: payload.dayOfWeek ?? 5,
      hour: payload.hour ?? 14,
      canal: payload.canal ?? 'presencial',
      porcentajeDescuento: payload.porcentajeDescuento ?? 5,
      promedioHistoricoUnidades:
        simpleStatsRegression.historicalStats.mean || 24,
    });

    return {
      simpleStatisticsRegression: simpleStatsRegression,
      kerasNeuralRegression: kerasPrediction,
      activeInvoicesCount: invoices.length,
    };
  }

  /**
   * Obtiene los perfiles estadísticos de comportamiento y anomalías por usuario (Simple Statistics).
   */
  async getUserBehaviorAnomalies() {
    const data = await this.#collectSystemOperations();
    return analyzeUserBehaviorProfiles(data);
  }

  /**
   * Obtiene los patrones globales de operación (horarios, montos, frecuencia, canal, método de pago).
   */
  async getOperationalPatterns() {
    const data = await this.#collectSystemOperations();
    return discoverOperationalPatterns(data);
  }
}

module.exports = AiService;
