/**
 * @file AiService.js
 * @description Caso de uso orquestador de Inteligencia Artificial No-LLM de Appresso:
 * conecta los repositorios transaccionales de PostgreSQL con los dos motores puros de Dominio IA:
 * 1. Redes Neuronales Keras / TensorFlow.js (`TfModelManager`) para clasificación de fraude y regresión de demanda.
 * 2. Estadística inferencial y descriptiva con `simple-statistics` (`userBehaviorStats.js`) para cuartiles,
 *    detección de outliers, regresión lineal OLS y descubrimiento de patrones horarios/canales.
 *
 * - **Capa arquitectónica:** Aplicación - Casos de Uso (`src/application/ai`).
 * - **Inyección de Dependencias (`container.js`):** Recibe desde `buildContainer()` en `src/container.js`:
 *   - `userRepository`: Instancia de `UserRepository` (`listAll`).
 *   - `orderRepository`: Instancia de `OrderRepository` (`findAllUnpaginated`).
 *   - `billingRepository`: Instancia de `BillingRepository` (`listInvoices`, `listPayments`).
 *   - `transactionRepository`: Instancia de `TransactionRepository` (`findAll`).
 *   - `tfModelManager`: Opcional (si es `null`, instancia `new TfModelManager({ logger })`).
 *   - `logger`: Logger contextualizado con `childLogger('AiService')`.
 *   *(Además `aiService` es inyectado en `OperationalService` desde `container.js` para clasificar facturas y pagos en caliente).*
 * - **Controlador HTTP que dispara cada método (`OperationalController` en `src/interfaces/http/routes/operational.routes.js`):**
 *   1. `getModelsStatus()` <- `OperationalController.getAiStatus` (`GET /ai/status`)
 *      y `OperationalController.getExecutiveSummary` (`GET /operational/summary`).
 *   2. `trainModels(...)` <- `OperationalController.trainAiModels` (`POST /ai/train`).
 *   3. `classifyOperation(...)` <- `OperationalController.classifyOperation` (`POST /ai/classify`),
 *      `OperationalService.generateInvoice` (`POST /operational/invoices`) y
 *      `OperationalService.processPayment` (`POST /operational/payments`).
 *   4. `classifyRecentOperations(limit)` <- `OperationalController.classifyRecentOperations` (`GET /ai/classify-recent`).
 *   5. `predictDemandAndAmount(...)` <- `OperationalController.predictDemand` (`POST /ai/predict-demand`).
 *   6. `getUserBehaviorAnomalies()` <- `OperationalController.getUserProfiles` (`GET /ai/user-profiles`)
 *      y `OperationalController.getExecutiveSummary` (`GET /operational/summary`).
 *   7. `getOperationalPatterns()` <- `OperationalController.getOperationalPatterns` (`GET /ai/patterns`).
 * - **Delegación a Dominio y Repositorios:**
 *   - Dominio IA: `TfModelManager` (`src/domain/ai/tfModelManager.js`) y `userBehaviorStats.js`
 *     (`analyzeUserBehaviorProfiles`, `predictDemandWithSimpleStatistics`, `discoverOperationalPatterns`).
 *   - Repositorios: `UserRepository`, `OrderRepository`, `BillingRepository`, `TransactionRepository`.
 */

// Funciones estadísticas puras de Dominio IA basadas en `simple-statistics`
const {
  analyzeUserBehaviorProfiles,
  predictDemandWithSimpleStatistics,
  discoverOperationalPatterns,
} = require('../../domain/ai/userBehaviorStats');
// Gestor de redes neuronales Keras / TensorFlow.js con persistencia en disco y Data Augmentation
const { TfModelManager } = require('../../domain/ai/tfModelManager');

class AiService {
  /**
   * Inicializa el orquestador de IA con los cuatro repositorios de datos históricos y el gestor Keras.
   *
   * @param {Object} deps Dependencias inyectadas por `container.js`.
   */
  constructor({
    userRepository,
    orderRepository,
    billingRepository,
    transactionRepository,
    tfModelManager = null,
    logger,
  }) {
    // Repositorios de lectura para consolidar el dataset real del negocio
    this.userRepository = userRepository;
    this.orderRepository = orderRepository;
    this.billingRepository = billingRepository;
    this.transactionRepository = transactionRepository;
    this.logger = logger;
    // Usa el `tfModelManager` inyectado (útil en tests) o crea la instancia estándar de dominio
    this.tfModelManager =
      tfModelManager || new TfModelManager({ logger });
  }

  /**
   * Método privado que recolecta en paralelo todas las entidades operativas desde PostgreSQL.
   * Evita consultas secuenciales lentas antes de entrenar modelos o calcular perfiles estadísticos.
   *
   * @returns {Promise<{ users: Array, orders: Array, invoices: Array, payments: Array, transactions: Array }>}
   */
  async #collectSystemOperations() {
    // Ejecuta las cinco lecturas concurrentemente mediante `Promise.all`
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
   * Consulta el estado de los modelos Keras/TensorFlow garantizando que estén cargados desde disco
   * o entrenados inicialmente con las operaciones reales actuales.
   * Se dispara desde `OperationalController.getAiStatus` (`GET /ai/status`) y `getExecutiveSummary` (`GET /operational/summary`).
   *
   * @returns {Promise<Object>} Estado técnico de los modelos, arquitectura, pérdida, accuracy y scaler.
   */
  async getModelsStatus() {
    // Recolecta facturas, pagos y transacciones reales para nutrir el entrenamiento inicial si no hubiera pesos en disco
    const { invoices, payments, transactions } = await this.#collectSystemOperations();
    const realOps = [...transactions, ...invoices, ...payments];
    // Delega en `TfModelManager.ensureReady` la carga perezosa o el entrenamiento inicial
    return this.tfModelManager.ensureReady(realOps);
  }

  /**
   * Fuerza el reentrenamiento supervisado de ambos modelos Keras (Clasificador de Fraude y Regresor de Demanda)
   * combinando operaciones reales de BD con Data Augmentation, y guarda los nuevos pesos en disco.
   * Se dispara desde `OperationalController.trainAiModels` al recibir `POST /ai/train`.
   *
   * @param {Object} [params={}] Hiperparámetros solicitados.
   * @param {number} [params.epochs=35] Épocas de entrenamiento (acotadas en `[5, 100]` UNA SOLA VEZ aquí en el Servicio).
   * @param {number} [params.augmentationFactor=2] Factor de aumento sintético (acotado en `[1, 5]` UNA SOLA VEZ aquí).
   * @returns {Promise<Object>} Nuevo estado y métricas post-entrenamiento.
   */
  async trainModels({ epochs = 35, augmentationFactor = 2 } = {}) {
    // Reúne todos los registros financieros reales disponibles en BD
    const { invoices, payments, transactions } = await this.#collectSystemOperations();
    const realOps = [...transactions, ...invoices, ...payments];

    // Acotamiento defensivo de hiperparámetros de negocio: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en HTTP
    return this.tfModelManager.trainAndSaveModels({
      realOperations: realOps,
      epochs: Math.min(100, Math.max(5, Number(epochs) || 35)),
      augmentationFactor: Math.min(5, Math.max(1, Number(augmentationFactor) || 2)),
    });
  }

  /**
   * Evalúa una operación individual mediante la red neuronal Keras clasificándola en `NORMAL` o `FRAUDULENTA`.
   * Se dispara desde `OperationalController.classifyOperation` (`POST /ai/classify`) y también en tiempo real
   * desde `OperationalService.generateInvoice` y `OperationalService.processPayment`.
   *
   * @param {Object} [operationPayload={}] Parámetros de la operación a inspeccionar.
   * @returns {Promise<Object>} Probabilidad de fraude, nivel de riesgo, features normalizadas y razones XAI.
   */
  async classifyOperation(operationPayload = {}) {
    // Delega directamente la vectorización, escalamiento e inferencia tensorial a `TfModelManager`
    return this.tfModelManager.classifyOperation(operationPayload);
  }

  /**
   * Clasifica en lote las últimas `limit` operaciones registradas transversalmente en facturas, pagos y transacciones.
   * Se dispara desde `OperationalController.classifyRecentOperations` al recibir `GET /ai/classify-recent`.
   *
   * @param {number} [limit=20] Cantidad máxima de operaciones recientes a evaluar.
   * @returns {Promise<Object>} Conteos de normales vs fraudulentas y arreglo detallado de predicciones.
   */
  async classifyRecentOperations(limit = 20) {
    // Carga el historial actual y garantiza que el clasificador Keras esté listo en memoria
    const { invoices, payments, transactions } = await this.#collectSystemOperations();
    await this.tfModelManager.ensureReady([...transactions, ...invoices, ...payments]);

    // Homologa facturas, pagos y las últimas 15 transacciones bajo un esquema uniforme de evaluación
    const combined = [
      // Proyecta cada factura hacia descriptores comprensibles por `extractOperationFeatures`
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
      // Proyecta cada pago incorporando la validez criptográfica de su comprobante
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
      // Proyecta las transacciones recientes del módulo antifraude
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

    // Recorta las últimas `limit` entradas ordenadas de más reciente a más antigua
    const slice = combined.slice(-limit).reverse();
    const results = [];

    // Ejecuta inferencia Keras sobre cada operación seleccionada
    for (const op of slice) {
      const prediction = await this.tfModelManager.classifyOperation(op);
      results.push({
        ...op,
        prediction,
      });
    }

    // Contabiliza cuántas de las operaciones evaluadas resultaron clasificadas como fraudulentas
    const fraudulentCount = results.filter((r) => r.prediction.isFraudulent).length;

    return {
      totalEvaluated: results.length,
      normalCount: results.length - fraudulentCount,
      fraudulentCount,
      results,
    };
  }

  /**
   * Predice demanda futura e ingresos esperados combinando dos enfoques complementarios No-LLM:
   * 1. Regresión Lineal Simple (`simple-statistics`: pendiente $m$, intercepto $b$, $R^2$ y serie temporal).
   * 2. Red Neuronal Regresora Keras (`TfModelManager`: predicción multivariable por día, hora, canal y descuento).
   *
   * Se dispara desde `OperationalController.predictDemand` al recibir `POST /ai/predict-demand`.
   *
   * @param {Object} [payload={}] Serie diaria opcional, horizonte en días y contexto comercial.
   * @returns {Promise<Object>} Pronóstico estadístico lineal + pronóstico neuronal Keras.
   */
  async predictDemandAndAmount(payload = {}) {
    // Lee pedidos y facturas reales para construir una serie base realista cuando el cliente no envía `dailySeries`
    const { orders, invoices } = await this.#collectSystemOperations();

    // Si existen al menos 4 pedidos, deriva la serie de los últimos 10 pedidos; si no, usa serie semilla representativa
    const defaultSeries =
      orders.length >= 4
        ? orders.slice(-10).map((o) =>
            typeof o.totalQuantity === 'function'
              ? o.totalQuantity() * 10
              : Number(o.total || 20000) / 1000
          )
        : [18, 21, 24, 23, 27, 31, 34];

    // Validación/selección de serie de negocio: vive UNA SOLA VEZ aquí en el Servicio sin repetirse en HTTP
    const series =
      Array.isArray(payload.dailySeries) && payload.dailySeries.length >= 2
        ? payload.dailySeries
        : defaultSeries;

    // Acota el horizonte de proyección entre 1 y 14 días (7 días por defecto)
    const horizonDays = Math.min(14, Math.max(1, Number(payload.horizonDays) || 7));
    // Ejecuta regresión lineal con `simple-statistics` en Dominio IA
    const simpleStatsRegression = predictDemandWithSimpleStatistics(series, horizonDays);

    // Ejecuta inferencia multivariable con la red neuronal regresora Keras alimentando la media histórica recién calculada
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
   * Genera el análisis conductual por usuario (cuartiles $Q_1, Q_2, Q_3$, $IQR$, $Z\text{-Score}$ y `anomalyScore`).
   * Se dispara desde `OperationalController.getUserProfiles` (`GET /ai/user-profiles`) y `getExecutiveSummary`.
   *
   * @returns {Promise<Object>} Estadísticas globales y perfiles ordenados de mayor a menor riesgo.
   */
  async getUserBehaviorAnomalies() {
    // Recolecta todo el grafo transaccional del sistema
    const data = await this.#collectSystemOperations();
    // Delega el cálculo matemático puro en `analyzeUserBehaviorProfiles` (`userBehaviorStats.js`)
    return analyzeUserBehaviorProfiles(data);
  }

  /**
   * Descubre patrones operativos agregados por hora del día, canal de venta y método de pago.
   * Se dispara desde `OperationalController.getOperationalPatterns` al recibir `GET /ai/patterns`.
   *
   * @returns {Promise<Object>} Hora pico, hora crítica de anomalías, canal dominante y desgloses.
   */
  async getOperationalPatterns() {
    // Recolecta los datos históricos desde los repositorios
    const data = await this.#collectSystemOperations();
    // Delega la agregación estadística en `discoverOperationalPatterns` (`userBehaviorStats.js`)
    return discoverOperationalPatterns(data);
  }
}

module.exports = AiService;
