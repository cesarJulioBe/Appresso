/**
 * @file AnomalyRepository.js
 * @description Repositorio de acceso a datos para las alertas de fraude en la tabla `anomalias`.
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Repositorios).
 * - (b) Responsabilidad única (SRP): Persistir y consultar los eventos de anomalías financieras detectados
 *       por exceso de velocidad transaccional sobre la tabla `anomalias` en PostgreSQL.
 * - (c) Quién lo dispara / invoca:
 *       - Instanciado en `src/container.js` con inyección de `{ db }`.
 *       - Invocado por `TransactionService` (al detectar ráfagas sospechosas con `SlidingWindow`)
 *         y por `FraudReportService` (para generar tableros y reportes ejecutivos de fraude).
 * - (d) Buenas prácticas aplicadas:
 *       - Sentencias parametrizadas (`$1..$5`) que eliminan el riesgo de inyección SQL.
 *       - Consultas relacionales enriquecidas mediante `JOIN` doble hacia `transacciones` y `usuarios`
 *         para entregar trazabilidad completa en una sola lectura.
 */

// Define la clase repositorio encargada de la tabla 'anomalias'
class AnomalyRepository {
  /**
   * Inicializa el repositorio con la conexión a base de datos inyectada.
   *
   * @param {object} deps - Dependencias requeridas.
   * @param {object} deps.db - Adaptador de PostgreSQL con método `query(text, params)`.
   */
  constructor({ db }) {
    // Almacena la instancia del cliente/pool de base de datos
    this.db = db;
  }

  /**
   * Inserta un nuevo registro de anomalía vinculado a la transacción que superó el umbral permitido.
   *
   * Consulta ejecutada:
   * `INSERT INTO anomalias (transaccion_id, tipo, nivel, cantidad_transacciones, ventana_segundos) VALUES ($1..$5) RETURNING *`
   *
   * @param {object} data - Datos diagnósticos de la anomalía detectada.
   * @param {number} data.transaccionId - ID primario de la transacción detonante en `transacciones`.
   * @param {string} data.tipo - Clasificación del patrón anómalo (ej. exceso de frecuencia en franja horaria).
   * @param {string} data.nivel - Severidad de la alerta (ej. `'Medio'`, `'Alto'`, `'Crítico'`).
   * @param {number} data.cantidadTransacciones - Número de operaciones acumuladas dentro de la ventana deslizante.
   * @param {number} data.ventanaSegundos - Tamaño en segundos de la ventana temporal evaluada.
   * @returns {Promise<object>} Registro completo de la anomalía creada en PostgreSQL.
   */
  async create({ transaccionId, tipo, nivel, cantidadTransacciones, ventanaSegundos }) {
    // Ejecuta la inserción parametrizada devolviendo todas las columnas generadas (id, fecha_creacion, etc.)
    const result = await this.db.query(
      `INSERT INTO anomalias (transaccion_id, tipo, nivel, cantidad_transacciones, ventana_segundos)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [transaccionId, tipo, nivel, cantidadTransacciones, ventanaSegundos]
    );
    // Retorna la fila recién insertada
    return result.rows[0];
  }

  /**
   * Recupera todas las anomalías registradas de la más reciente a la más antigua,
   * incluyendo el monto, fecha de transacción y correo electrónico del usuario involucrado.
   *
   * Consulta ejecutada:
   * `SELECT a.*, t.usuario_id, t.valor, t.fecha_txn, u.email FROM anomalias a JOIN transacciones t ... JOIN usuarios u ... ORDER BY a.fecha_creacion DESC`
   *
   * @returns {Promise<Array<object>>} Lista enriquecida de anomalías ordenadas descendentemente por creación.
   */
  async findAll() {
    // Realiza doble INNER JOIN con 'transacciones' y 'usuarios' para construir el reporte completo en una consulta
    const result = await this.db.query(`
      SELECT a.*, t.usuario_id, t.valor, t.fecha_txn, u.email
      FROM anomalias a
      JOIN transacciones t ON a.transaccion_id = t.id
      JOIN usuarios u ON t.usuario_id = u.id
      ORDER BY a.fecha_creacion DESC
    `);
    // Devuelve los registros listos para auditoría antifraude
    return result.rows;
  }

  /**
   * Obtiene el conteo total de anomalías históricas almacenadas en la base de datos.
   *
   * Consulta ejecutada: `SELECT COUNT(*) FROM anomalias`
   *
   * @returns {Promise<number>} Total entero de alertas de anomalía registradas.
   */
  async countAll() {
    // Consulta agregada rápida sobre la tabla 'anomalias'
    const result = await this.db.query('SELECT COUNT(*) FROM anomalias');
    // Convierte el conteo textual de PostgreSQL a entero en base 10
    return parseInt(result.rows[0].count, 10);
  }
}

// Exporta la clase AnomalyRepository para su inyección desde container.js
module.exports = AnomalyRepository;
