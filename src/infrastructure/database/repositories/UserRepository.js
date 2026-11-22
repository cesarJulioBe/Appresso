class UserRepository {
  constructor({ db }) {
    this.db = db;
  }

  async findByEmail(email) {
    const result = await this.db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async findById(id) {
    const result = await this.db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findOrCreate(email, nombre = null) {
    const existing = await this.findByEmail(email);
    if (existing) return existing;

    const displayName = nombre || (email ? String(email).split('@')[0] : 'Cliente');
    const result = await this.db.query(
      `INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING *`,
      [displayName, email]
    );
    return result.rows[0];
  }

  async listAll() {
    const result = await this.db.query('SELECT * FROM usuarios ORDER BY id ASC');
    return result.rows;
  }

  async create({
    nombre,
    nombreNormalizado,
    email,
    rol = 'cliente',
    documento = null,
    telefono = null,
    estado = 'Activo',
  }) {
    const result = await this.db.query(
      `INSERT INTO usuarios (nombre, nombre_normalizado, email, rol, documento, telefono, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [nombre, nombreNormalizado, email, rol, documento, telefono, estado]
    );
    return result.rows[0];
  }

  async update(
    id,
    { nombre, nombreNormalizado, email, rol, documento, telefono, estado }
  ) {
    const result = await this.db.query(
      `UPDATE usuarios
       SET nombre = COALESCE($1, nombre),
           nombre_normalizado = COALESCE($2, nombre_normalizado),
           email = COALESCE($3, email),
           rol = COALESCE($4, rol),
           documento = COALESCE($5, documento),
           telefono = COALESCE($6, telefono),
           estado = COALESCE($7, estado),
           fecha_actualizacion = NOW()
       WHERE id = $8
       RETURNING *`,
      [nombre, nombreNormalizado, email, rol, documento, telefono, estado, id]
    );
    return result.rows[0] || null;
  }

  async delete(id) {
    const result = await this.db.query(
      'DELETE FROM usuarios WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = UserRepository;
