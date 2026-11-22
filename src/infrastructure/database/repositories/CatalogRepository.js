class CatalogRepository {
  constructor({ db }) {
    this.db = db;
  }

  // ===== CATEGORÍAS =====

  async listCategories() {
    const result = await this.db.query(`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM items i WHERE i.categoria_id = c.id) AS total_items
      FROM categorias c
      ORDER BY c.id ASC
    `);
    return result.rows;
  }

  async findCategoryById(id) {
    const result = await this.db.query('SELECT * FROM categorias WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findCategoryByNormalizedName(nombreNormalizado) {
    const result = await this.db.query(
      'SELECT * FROM categorias WHERE nombre_normalizado = $1 ORDER BY id ASC LIMIT 1',
      [nombreNormalizado]
    );
    return result.rows[0] || null;
  }

  async createCategory({ nombre, nombreNormalizado, descripcion = '', estado = 'Activa' }) {
    const result = await this.db.query(
      `INSERT INTO categorias (nombre, nombre_normalizado, descripcion, estado)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre, nombreNormalizado, descripcion, estado]
    );
    return result.rows[0];
  }

  async updateCategory(id, { nombre, nombreNormalizado, descripcion, estado }) {
    const result = await this.db.query(
      `UPDATE categorias
       SET nombre = COALESCE($1, nombre),
           nombre_normalizado = COALESCE($2, nombre_normalizado),
           descripcion = COALESCE($3, descripcion),
           estado = COALESCE($4, estado),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [nombre, nombreNormalizado, descripcion, estado, id]
    );
    return result.rows[0] || null;
  }

  async deleteCategory(id) {
    const result = await this.db.query(
      'DELETE FROM categorias WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  // ===== ÍTEMS (PRODUCTOS E INVENTARIO) =====

  async listItems() {
    const result = await this.db.query(`
      SELECT i.*, c.nombre AS categoria_nombre
      FROM items i
      LEFT JOIN categorias c ON i.categoria_id = c.id
      ORDER BY i.id ASC
    `);
    return result.rows;
  }

  async findItemById(id) {
    const result = await this.db.query(
      `SELECT i.*, c.nombre AS categoria_nombre
       FROM items i
       LEFT JOIN categorias c ON i.categoria_id = c.id
       WHERE i.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findItemByNormalizedName(nombreNormalizado) {
    const result = await this.db.query(
      'SELECT * FROM items WHERE nombre_normalizado = $1 ORDER BY id ASC LIMIT 1',
      [nombreNormalizado]
    );
    return result.rows[0] || null;
  }

  async createItem({
    sku,
    nombre,
    nombreNormalizado,
    categoriaId = null,
    precio,
    stock = 0,
    estado = 'Activo',
  }) {
    const result = await this.db.query(
      `INSERT INTO items (sku, nombre, nombre_normalizado, categoria_id, precio, stock, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [sku, nombre, nombreNormalizado, categoriaId, precio, stock, estado]
    );
    return result.rows[0];
  }

  async updateItem(
    id,
    { sku, nombre, nombreNormalizado, categoriaId, precio, stock, estado }
  ) {
    const result = await this.db.query(
      `UPDATE items
       SET sku = COALESCE($1, sku),
           nombre = COALESCE($2, nombre),
           nombre_normalizado = COALESCE($3, nombre_normalizado),
           categoria_id = COALESCE($4, categoria_id),
           precio = COALESCE($5, precio),
           stock = COALESCE($6, stock),
           estado = COALESCE($7, estado),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [sku, nombre, nombreNormalizado, categoriaId, precio, stock, estado, id]
    );
    return result.rows[0] || null;
  }

  async adjustStock(itemId, deltaQuantity) {
    const result = await this.db.query(
      `UPDATE items
       SET stock = GREATEST(0, stock + $1),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [deltaQuantity, itemId]
    );
    return result.rows[0] || null;
  }

  async deleteItem(id) {
    const result = await this.db.query('DELETE FROM items WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}

module.exports = CatalogRepository;
