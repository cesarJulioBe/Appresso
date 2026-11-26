/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/controllers/FraudController.js
 * CAPA: Interfaces HTTP — Controlador de Monitoreo Transaccional y Antifraude
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Gestionar la entrada HTTP de transacciones firmadas con HMAC-SHA256,
 *   simulaciones interactivas, reportes ejecutivos de anomalías y configuración
 *   dinámica de umbrales por franja horaria.
 * ============================================================================
 */

class FraudController {
  constructor({ transactionService, fraudReportService, thresholdService }) {
    // Servicios antifraude inyectados desde `src/container.js`
    this.transactionService = transactionService;
    this.fraudReportService = fraudReportService;
    this.thresholdService = thresholdService;
  }

  // Dispara: POST /transactions (y alias compatibles) -> Valida esquema, HMAC y ventana deslizante
  receiveTransaction = async (req, res) => {
    const result = await this.transactionService.receive(req.body);
    // Etiquetamos el resultado en `res.locals` para telemetría en `httpLoggerMiddleware`
    res.locals.transactionResult = 'created';
    res.status(200).json(result);
  };

  // Dispara: POST /fraud/simulate -> Genera y evalúa una transacción firmada desde el panel React
  simulateTransaction = async (req, res) => {
    const { user, value, paymentMethod } = req.body;
    const result = await this.transactionService.simulate({ user, value, paymentMethod });
    res.status(201).json(result);
  };

  // Dispara: GET /fraud/transactions -> Lista historial de transacciones indicando si son anomalías
  listTransactions = async (_req, res) => {
    const transactions = await this.transactionService.listTransactions();
    res.json(transactions);
  };

  // Dispara: GET /fraud/anomalies -> Lista alertas de fraude registradas para auditoría
  listAnomalies = async (_req, res) => {
    const anomalies = await this.transactionService.listAnomalies();
    res.json(anomalies);
  };

  // Dispara: GET /fraud/stats -> Resumen porcentual de anomalías sobre el total transaccional
  getStats = async (_req, res) => {
    const stats = await this.fraudReportService.getStats();
    res.json(stats);
  };

  // Dispara: GET /fraud/dashboard -> Métricas por periodo (hoy/semana/mes), horas y métodos de pago
  getDashboard = async (_req, res) => {
    const dashboard = await this.fraudReportService.getDashboard();
    res.json(dashboard);
  };

  // Dispara: GET /fraud/thresholds -> Obtiene umbrales activos por franja horaria
  listThresholds = async (_req, res) => {
    const thresholds = await this.thresholdService.list();
    res.json(thresholds);
  };

  // Dispara: PUT /fraud/thresholds/:franja -> Actualiza umbral y ventana en RAM y PostgreSQL
  updateThreshold = async (req, res) => {
    const { franja } = req.params;
    const { umbralTransacciones, ventanaSegundos } = req.body;
    const updated = await this.thresholdService.update(franja, {
      umbralTransacciones,
      ventanaSegundos,
    });
    res.json(updated);
  };
}

module.exports = FraudController;
