class ThresholdRepository {
  constructor({ db }) {
    this.db = db;
  }

  async findAll() {
    const result = await this.db.query('SELECT * FROM umbrales_horarios');
    return result.rows;
  }

  async updateThreshold(franja, umbralTransacciones, ventanaSegundos) {
    const result = await this.db.query(
      `UPDATE umbrales_horarios SET umbral_transacciones = $1, ventana_segundos = $2 WHERE franja = $3 RETURNING *`,
      [umbralTransacciones, ventanaSegundos, franja]
    );
    return result.rows[0] || null;
  }
}

module.exports = ThresholdRepository;
