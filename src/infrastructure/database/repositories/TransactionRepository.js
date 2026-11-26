/**
 * @file TransactionRepository.js
 * @description Repositorio de acceso a datos para las transacciones monitoreadas por el motor antifraude (`transacciones`).
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Repositorios).
 * - (b) Responsabilidad única (SRP): Encapsular el almacenamiento, búsqueda de idempotencia por ID externo (`id_txn`),
 *       listado enriquecido y conteo sobre la tabla `transacciones` en PostgreSQL.
 * - (c) Quién lo dispara / invoca:
 *       - Instanciado en `src/container.js` con inyección de `{ db }`.
 *       - Invocado por `TransactionService` (verificación de duplicados y persistencia con firma HMAC),
 *         `FraudReportService` (reporte consolidado de transacciones), `BenchmarkService` y `AiService`.
 * - (d) Buenas prácticas aplicadas:
 *       - Consultas parametrizadas (`$1..$7`) contra inyección SQL.
 *       - Soporte de idempotencia transaccional mediante consulta rápida por `id_txn` (`findByExternalId`).
 *       - Proyección calculada en SQL (`CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS es_anomalia`)
 *         mediante `JOIN` / `LEFT JOIN` para entregar el estado de fraude sin múltiples viajes a la base de datos.
 */

// Define la clase repositorio responsable de interactuar con la tabla 'transacciones'
class TransactionRepository {
  /**
   * Inicializa el repositorio inyectando el adaptador de conexión a PostgreSQL.
   *
   * @param {object} deps - Dependencias inyectadas.
   * @param {object} deps.db - Cliente o pool de base de datos con método `query(text, params)`.
   */
  constructor({ db }) {
    // Guarda la instancia del adaptador de base de datos
    this.db = db;
  }

  /**
   * Registra una nueva transacción financiera junto con su huella criptográfica (`hash`) y marca de tiempo.
   *
   * Consulta ejecutada:
   * `INSERT INTO transacciones (id_txn, usuario_id, valor, fecha_txn, hash, metodo_pago, estado) VALUES ($1..$7) RETURNING *`
   *
   * @param {object} data - Atributos de la transacción validada.
   * @param {string} data.idTxn - Identificador externo único de la transacción (clave de idempotencia).
   * @param {number} data.usuarioId - Clave foránea del usuario en la tabla `usuarios`.
   * @param {number} data.valor - Monto económico de la transacción.
   * @param {Date|string} data.fechaTxn - Fecha y hora exacta en que ocurrió la transacción.
   * @param {string} data.hash - Firma HMAC-SHA256 de integridad calculada para la transacción.
   * @param {string} data.metodoPago - Medio de pago empleado.
   * @param {string} [data.estado='Procesada'] - Estado resultante (`'Procesada'`, `'Sospechosa'`, etc.).
   * @returns {Promise<object>} Registro completo de la transacción recién insertada.
   */
  async create({ idTxn, usuarioId, valor, fechaTxn, hash, metodoPago, estado = 'Procesada' }) {
    // Inserta de forma segura los 7 atributos usando marcadores posicionales y recupera la fila generada
    const result = await this.db.query(
      `INSERT INTO transacciones (id_txn, usuario_id, valor, fecha_txn, hash, metodo_pago, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [idTxn, usuarioId, valor, fechaTxn, hash, metodoPago, estado]
    );
    // Retorna la transacción almacenada incluyendo su ID interno serial
    return result.rows[0];
  }

  /**
   * Busca una transacción previamente registrada a partir de su identificador externo (`id_txn`),
   * permitiendo garantizar idempotencia ante reintentos de red o envíos duplicados.
   *
   * Consulta ejecutada: `SELECT * FROM transacciones WHERE id_txn = $1`
   *
   * @param {string} idTxn - Identificador externo único de la transacción.
   * @returns {Promise<object|null>} Fila de la transacción existente o `null` si aún no ha sido registrada.
   */
  async findByExternalId(idTxn) {
    // Ejecuta búsqueda parametrizada sobre la columna indexada/única 'id_txn'
    const result = await this.db.query(
      'SELECT * FROM transacciones WHERE id_txn = $1',
      [idTxn]
    );
    // Devuelve la transacción encontrada o null si es nueva
    return result.rows[0] || null;
  }

  /**
   * Recupera todas las transacciones ordenadas cronológicamente por `fecha_txn`, enriquecidas con el
   * correo del usuario (`u.email`) y una bandera booleana (`es_anomalia`) que indica si disparó alerta de fraude.
   *
   * Consulta ejecutada:
   * `SELECT t.*, u.email, CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS es_anomalia FROM transacciones t JOIN usuarios u ... LEFT JOIN anomalias a ... ORDER BY t.fecha_txn ASC`
   *
   * @returns {Promise<Array<object>>} Lista cronológica de transacciones con contexto de usuario y estado de anomalía.
   */
  async findAll() {
    // Combina transacciones con usuarios (INNER JOIN) y anomalías opcionales (LEFT JOIN) en una sola consulta SQL
    const result = await this.db.query(`
      SELECT t.*, u.email,
        CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS es_anomalia
      FROM transacciones t
      JOIN usuarios u ON t.usuario_id = u.id
      LEFT JOIN anomalias a ON a.transaccion_id = t.id
      ORDER BY t.fecha_txn ASC
    `);
    // Retorna todas las filas enriquecidas
    return result.rows;
  }

  /**
   * Cuenta el número total de transacciones almacenadas en la tabla `transacciones`.
   *
   * Consulta ejecutada: `SELECT COUNT(*) FROM transacciones`
   *
   * @returns {Promise<number>} Cantidad total entera de transacciones registradas.
   */
  async countAll() {
    // Solicita el conteo agregado directamente al motor PostgreSQL
    const result = await this.db.query('SELECT COUNT(*) FROM transacciones');
    // Convierte el valor string retornado por pg ('count') a número entero base 10
    return parseInt(result.rows[0].count, 10);
  }
}

// Exporta la clase TransactionRepository para el contenedor de dependencias
module.exports = TransactionRepository;
