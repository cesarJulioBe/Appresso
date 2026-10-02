const pool = require('./connection');

class ThresholdRepository {
  async findAll() {
    const result = await pool.query('SELECT * FROM umbrales_horarios');
    return result.rows;
  }

  async updateThreshold(franja, umbralTransacciones, ventanaSegundos) {
    const result = await pool.query(
      `UPDATE umbrales_horarios SET umbral_transacciones = $1, ventana_segundos = $2 WHERE franja = $3 RETURNING *`,
      [umbralTransacciones, ventanaSegundos, franja]
    );
    return result.rows[0] || null;
  }
}

module.exports = new ThresholdRepository();