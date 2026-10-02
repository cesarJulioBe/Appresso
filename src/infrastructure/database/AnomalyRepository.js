const pool = require('./connection');

class AnomalyRepository {
  async create({ transaccionId, tipo, nivel, cantidadTransacciones, ventanaSegundos }) {
    const result = await pool.query(
      `INSERT INTO anomalias (transaccion_id, tipo, nivel, cantidad_transacciones, ventana_segundos)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [transaccionId, tipo, nivel, cantidadTransacciones, ventanaSegundos]
    );
    return result.rows[0];
  }

  async findAll() {
    const result = await pool.query(`
      SELECT a.*, t.usuario_id, t.valor, t.fecha_txn, u.email
      FROM anomalias a
      JOIN transacciones t ON a.transaccion_id = t.id
      JOIN usuarios u ON t.usuario_id = u.id
      ORDER BY a.fecha_creacion DESC
    `);
    return result.rows;
  }

  async countAll() {
    const result = await pool.query('SELECT COUNT(*) FROM anomalias');
    return parseInt(result.rows[0].count);
  }
}

module.exports = new AnomalyRepository();