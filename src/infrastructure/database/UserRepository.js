const pool = require('./connection');

class UserRepository {
  async findByEmail(email) {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async findOrCreate(email, nombre = null) {
    const existing = await this.findByEmail(email);
    if (existing) return existing;

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING *`,
      [nombre, email]
    );
    return result.rows[0];
  }
}

module.exports = new UserRepository();