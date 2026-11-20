class FraudReportService {
  constructor({ transactionRepository, anomalyRepository, logger }) {
    this.transactionRepository = transactionRepository;
    this.anomalyRepository = anomalyRepository;
    this.logger = logger;
  }

  async getStats() {
    const totalTransacciones = await this.transactionRepository.countAll();
    const totalAnomalias = await this.anomalyRepository.countAll();

    const porcentajeAnomalias = totalTransacciones > 0
      ? ((totalAnomalias / totalTransacciones) * 100).toFixed(2)
      : '0.00';

    return {
      totalTransacciones,
      totalAnomalias,
      porcentajeAnomalias: parseFloat(porcentajeAnomalias),
    };
  }

  async getDashboard() {
    const [transactions, anomalies] = await Promise.all([
      this.transactionRepository.findAll(),
      this.anomalyRepository.findAll(),
    ]);

    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const periods = [
      { key: 'hoy', label: 'Hoy', start: startOfDay.getTime() },
      { key: 'semana', label: 'Esta semana', start: startOfWeek.getTime() },
      { key: 'mes', label: 'Este mes', start: startOfMonth.getTime() },
    ];

    const inPeriod = (date, start) => new Date(date).getTime() >= start;
    const periodStats = periods.reduce((result, period) => {
      const periodTransactions = transactions.filter((t) => inPeriod(t.fecha_txn, period.start));
      const periodAnomalies = anomalies.filter((a) => inPeriod(a.fecha_txn, period.start));
      result[period.key] = {
        label: period.label,
        transacciones: periodTransactions.length,
        anomalias: periodAnomalies.length,
        porcentajeAnomalias: periodTransactions.length
          ? Number(((periodAnomalies.length / periodTransactions.length) * 100).toFixed(2))
          : 0,
      };
      return result;
    }, {});

    const users = new Set(transactions.map((t) => t.email));
    const affectedUsers = new Set(anomalies.map((a) => a.email));

    const paymentMethods = transactions.reduce((result, transaction) => {
      const method = transaction.metodo_pago || 'No especificado';
      result[method] = (result[method] || 0) + 1;
      return result;
    }, {});

    const levels = anomalies.reduce((result, anomaly) => {
      const level = anomaly.nivel || 'Sin nivel';
      result[level] = (result[level] || 0) + 1;
      return result;
    }, {});

    const hourlyAnomalies = Array.from({ length: 24 }, (_, hour) => ({
      hora: `${String(hour).padStart(2, '0')}:00`,
      cantidad: anomalies.filter((a) => new Date(a.fecha_txn).getHours() === hour).length,
    }));

    const suspiciousValue = anomalies.reduce(
      (sum, anomaly) => sum + Number(anomaly.valor || 0),
      0
    );

    const recentTimeline = anomalies.slice(0, 12).map((anomaly) => ({
      ...anomaly,
      estado: anomaly.estado || 'Abierta',
    }));

    return {
      periods: periodStats,
      totals: {
        transacciones: transactions.length,
        anomalias: anomalies.length,
        usuarios: users.size,
        usuariosAfectados: affectedUsers.size,
        valorSospechoso: suspiciousValue,
        promedioPorUsuario: users.size
          ? Number((transactions.length / users.size).toFixed(2))
          : 0,
        anomaliasNuevas: anomalies.filter(
          (a) => now - new Date(a.fecha_creacion || a.fecha_txn).getTime() <= 86400000
        ).length,
      },
      statuses: { abiertas: anomalies.length, revisadas: 0, descartadas: 0 },
      paymentMethods,
      levels,
      hourlyAnomalies,
      timeline: recentTimeline,
    };
  }
}

module.exports = FraudReportService;
