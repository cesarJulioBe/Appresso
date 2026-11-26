/**
 * @file FraudReportService.js
 * @description Caso de uso de reportería ejecutiva y tablero analítico de monitoreo antifraude:
 * consolida indicadores KPI globales, cortes temporales (hoy, esta semana, este mes), distribución
 * por medios de pago, niveles de criticidad, histograma horario de anomalías y línea de tiempo reciente.
 *
 * - **Capa arquitectónica:** Aplicación - Casos de Uso (`src/application/fraud`).
 * - **Inyección de Dependencias (`container.js`):** Recibe desde `buildContainer()` en `src/container.js`:
 *   - `transactionRepository`: Instancia de `TransactionRepository` (`countAll`, `findAll`).
 *   - `anomalyRepository`: Instancia de `AnomalyRepository` (`countAll`, `findAll`).
 *   - `logger`: Logger contextualizado con `childLogger('FraudReportService')`.
 * - **Controlador HTTP que dispara cada método (`FraudController` en `src/interfaces/http/routes/fraud.routes.js`):**
 *   1. `getStats()` <- `FraudController.getStats` (`GET /fraud/stats`).
 *   2. `getDashboard()` <- `FraudController.getDashboard` (`GET /fraud/dashboard`).
 *   *(Además es invocado directamente en pruebas unitarias desde `tests/unit/application/services.test.js`).*
 * - **Delegación a Dominio y Repositorios:**
 *   - Dominio: Agregaciones estadísticas puras en memoria sobre entidades leídas.
 *   - Repositorios: `TransactionRepository` y `AnomalyRepository`.
 */

class FraudReportService {
  /**
   * Inicializa el servicio de reportes antifraude con acceso de lectura a transacciones y anomalías.
   *
   * @param {Object} deps Dependencias inyectadas por `container.js` o `services.test.js`.
   * @param {Object} deps.transactionRepository Repositorio de transacciones.
   * @param {Object} deps.anomalyRepository Repositorio de anomalías.
   * @param {Object} [deps.logger] Logger estructurado opcional.
   */
  constructor({ transactionRepository, anomalyRepository, logger }) {
    // Repositorio para conteos y listados completos de transacciones
    this.transactionRepository = transactionRepository;
    // Repositorio para conteos y listados completos de anomalías
    this.anomalyRepository = anomalyRepository;
    // Logger contextual del servicio
    this.logger = logger;
  }

  /**
   * Calcula las métricas resumidas rápidas de volumen transaccional, total de anomalías y tasa porcentual.
   * Se dispara desde `FraudController.getStats` al recibir `GET /fraud/stats` (y en `services.test.js`).
   *
   * @returns {Promise<{ totalTransacciones: number, totalAnomalias: number, porcentajeAnomalias: number }>}
   */
  async getStats() {
    // Consulta el conteo total de filas en la tabla `transacciones`
    const totalTransacciones = await this.transactionRepository.countAll();
    // Consulta el conteo total de filas en la tabla `anomalias`
    const totalAnomalias = await this.anomalyRepository.countAll();

    // Calcula el porcentaje de incidencia evitando división entre cero cuando aún no existen transacciones
    const porcentajeAnomalias = totalTransacciones > 0
      ? ((totalAnomalias / totalTransacciones) * 100).toFixed(2)
      : '0.00';

    // Retorna los tres KPIs numéricos listos para serialización JSON
    return {
      totalTransacciones,
      totalAnomalias,
      porcentajeAnomalias: parseFloat(porcentajeAnomalias),
    };
  }

  /**
   * Construye el modelo de datos completo del Dashboard de Fraude agrupando métricas por ventana temporal,
   * usuarios únicos/afectados, medios de pago, severidad, distribución por hora del día y eventos recientes.
   * Se dispara desde `FraudController.getDashboard` al recibir `GET /fraud/dashboard`.
   *
   * @returns {Promise<Object>} Objeto estructurado con `periods`, `totals`, `statuses`, `paymentMethods`, `levels`, `hourlyAnomalies` y `timeline`.
   */
  async getDashboard() {
    // Carga concurrentemente todas las transacciones y anomalías en una sola ronda de promesas
    const [transactions, anomalies] = await Promise.all([
      this.transactionRepository.findAll(),
      this.anomalyRepository.findAll(),
    ]);

    // Marca de tiempo actual en milisegundos para calcular antigüedad de anomalías nuevas (últimas 24h)
    const now = Date.now();
    // Calcula la medianoche (00:00:00.000) del día calendario actual
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // Calcula el inicio de la semana actual tomando el lunes como primer día (si hoy es domingo `0`, retrocede 6 días)
    const startOfWeek = new Date(startOfDay);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
    // Calcula el primer día (día 1 a las 00:00) del mes calendario en curso
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    // Define los tres cortes temporales que se presentarán en las tarjetas comparativas del panel
    const periods = [
      { key: 'hoy', label: 'Hoy', start: startOfDay.getTime() },
      { key: 'semana', label: 'Esta semana', start: startOfWeek.getTime() },
      { key: 'mes', label: 'Este mes', start: startOfMonth.getTime() },
    ];

    // Predicado auxiliar que evalúa si una fecha pertenece al intervalo `[start, ∞)`
    const inPeriod = (date, start) => new Date(date).getTime() >= start;
    // Reduce los tres periodos calculando volumen de transacciones, anomalías y porcentaje en cada corte
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

    // Conjuntos `Set` en O(n) para contabilizar usuarios únicos totales y usuarios con al menos una anomalía
    const users = new Set(transactions.map((t) => t.email));
    const affectedUsers = new Set(anomalies.map((a) => a.email));

    // Agrupa el conteo total de transacciones según método de pago utilizado
    const paymentMethods = transactions.reduce((result, transaction) => {
      const method = transaction.metodo_pago || 'No especificado';
      result[method] = (result[method] || 0) + 1;
      return result;
    }, {});

    // Agrupa el conteo de anomalías según su nivel de severidad ('Crítico', 'Alto', etc.)
    const levels = anomalies.reduce((result, anomaly) => {
      const level = anomaly.nivel || 'Sin nivel';
      result[level] = (result[level] || 0) + 1;
      return result;
    }, {});

    // Construye el histograma de 24 horas (00:00 a 23:00) contando cuántas anomalías ocurrieron en cada hora
    const hourlyAnomalies = Array.from({ length: 24 }, (_, hour) => ({
      hora: `${String(hour).padStart(2, '0')}:00`,
      cantidad: anomalies.filter((a) => new Date(a.fecha_txn).getHours() === hour).length,
    }));

    // Suma el monto económico total comprometido en las operaciones marcadas como anómalas
    const suspiciousValue = anomalies.reduce(
      (sum, anomaly) => sum + Number(anomaly.valor || 0),
      0
    );

    // Extrae las 12 anomalías más recientes asegurando un estado visual por defecto ('Abierta')
    const recentTimeline = anomalies.slice(0, 12).map((anomaly) => ({
      ...anomaly,
      estado: anomaly.estado || 'Abierta',
    }));

    // Ensambla y retorna toda la carga analítica para el frontend antifraude
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
        // Cuenta anomalías ocurridas en las últimas 24 horas (86.400.000 ms)
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
