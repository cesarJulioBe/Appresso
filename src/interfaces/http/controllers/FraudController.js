class FraudController {
  constructor({ transactionService, fraudReportService, thresholdService }) {
    this.transactionService = transactionService;
    this.fraudReportService = fraudReportService;
    this.thresholdService = thresholdService;
  }

  receiveTransaction = async (req, res) => {
    const result = await this.transactionService.receive(req.body);
    res.locals.transactionResult = 'created';
    res.status(200).json(result);
  };

  simulateTransaction = async (req, res) => {
    const { user, value, paymentMethod } = req.body;
    const result = await this.transactionService.simulate({ user, value, paymentMethod });
    res.status(201).json(result);
  };

  listTransactions = async (_req, res) => {
    const transactions = await this.transactionService.listTransactions();
    res.json(transactions);
  };

  listAnomalies = async (_req, res) => {
    const anomalies = await this.transactionService.listAnomalies();
    res.json(anomalies);
  };

  getStats = async (_req, res) => {
    const stats = await this.fraudReportService.getStats();
    res.json(stats);
  };

  getDashboard = async (_req, res) => {
    const dashboard = await this.fraudReportService.getDashboard();
    res.json(dashboard);
  };

  listThresholds = async (_req, res) => {
    const thresholds = await this.thresholdService.list();
    res.json(thresholds);
  };

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
