const pool = require('./connection');

class TransactionRepository {
  async create({ usuarioId, valor, fechaTxn, hash, metodoPago, estado = 'Procesada' }) {
    const result = await pool.query(
      `INSERT INTO transacciones (usuario_id, valor, fecha_txn, hash, metodo_pago, estado)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [usuarioId, valor, fechaTxn, hash, metodoPago, estado]
    );
    return result.rows[0];
  }

    async findAll() {
    const result = await pool.query(`
      SELECT t.*, u.email,
        CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS es_anomalia
      FROM transacciones t
      JOIN usuarios u ON t.usuario_id = u.id
      LEFT JOIN anomalias a ON a.transaccion_id = t.id
      ORDER BY t.fecha_txn ASC
    `);
    return result.rows;
  }

  async countAll() {
    const result = await pool.query('SELECT COUNT(*) FROM transacciones');
    return parseInt(result.rows[0].count);
  }
}

module.exports = new TransactionRepository();