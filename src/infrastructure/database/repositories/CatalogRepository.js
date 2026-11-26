/**
 * @file CatalogRepository.js
 * @description Repositorio de acceso a datos para las tablas `categorias` e `items` (catálogo e inventario).
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Repositorios).
 * - (b) Responsabilidad única (SRP): Gestionar todas las consultas y mutaciones SQL del catálogo comercial
 *       (categorías de productos, ítems vendibles y ajustes atómicos de existencias/stock) en PostgreSQL.
 * - (c) Quién lo dispara / invoca:
 *       - Instanciado en `src/container.js` con inyección de `{ db }`.
 *       - Invocado por `OperationalService` (CRUD de catálogo y descuento/reposición de stock al facturar),
 *         `DataQualityService` (detección de nombres duplicados y normalización canónica) y `BenchmarkService`.
 * - (d) Buenas prácticas aplicadas:
 *       - Consultas parametrizadas (`$1, $2...`) en todas las operaciones para blindaje contra SQL Injection.
 *       - Ajuste atómico de inventario en el motor SQL (`GREATEST(0, stock + $1)`) evitando condiciones de carrera
 *         y garantizando que el stock jamás caiga a números negativos.
 *       - Uso de `COALESCE` en actualizaciones parciales y subconsultas/`LEFT JOIN` para enriquecer lecturas sin N+1 queries.
 */

// Define la clase repositorio que administra la persistencia de categorías y productos
class CatalogRepository {
  /**
   * Inicializa el repositorio con el adaptador de conexión a base de datos inyectado.
   *
   * @param {object} deps - Dependencias inyectadas.
   * @param {object} deps.db - Pool o cliente de PostgreSQL con método `query(text, params)`.
   */
  constructor({ db }) {
    // Conserva la referencia al adaptador de base de datos para todas las consultas del catálogo
    this.db = db;
  }

  // ===== CATEGORÍAS =====

  /**
   * Lista todas las categorías ordenadas por ID, incluyendo el conteo exacto de ítems asociados (`total_items`).
   *
   * Consulta ejecutada: `SELECT c.*, (SELECT COUNT(*)::int FROM items i WHERE i.categoria_id = c.id) AS total_items FROM categorias c ORDER BY c.id ASC`
   *
   * @returns {Promise<Array<object>>} Arreglo de categorías enriquecidas con la propiedad numérica `total_items`.
   */
  async listCategories() {
    // Ejecuta consulta con subconsulta correlacionada casteada a entero para evitar N+1 consultas desde JS
    const result = await this.db.query(`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM items i WHERE i.categoria_id = c.id) AS total_items
      FROM categorias c
      ORDER BY c.id ASC
    `);
    // Retorna todas las filas de categorías obtenidas
    return result.rows;
  }

  /**
   * Busca una categoría específica por su clave primaria.
   *
   * Consulta ejecutada: `SELECT * FROM categorias WHERE id = $1`
   *
   * @param {number|string} id - Identificador primario de la categoría.
   * @returns {Promise<object|null>} Registro de la categoría o `null` si no existe.
   */
  async findCategoryById(id) {
    // Consulta parametrizada por clave primaria sobre la tabla 'categorias'
    const result = await this.db.query('SELECT * FROM categorias WHERE id = $1', [id]);
    // Retorna la categoría hallada o null si no hubo coincidencias
    return result.rows[0] || null;
  }

  /**
   * Busca la primera categoría que coincida con una clave de nombre normalizado (sin tildes ni mayúsculas).
   * Permite prevenir categorías duplicadas con variaciones ortográficas.
   *
   * Consulta ejecutada: `SELECT * FROM categorias WHERE nombre_normalizado = $1 ORDER BY id ASC LIMIT 1`
   *
   * @param {string} nombreNormalizado - Clave canónica normalizada del nombre de la categoría.
   * @returns {Promise<object|null>} Categoría coincidente más antigua o `null` si no existe.
   */
  async findCategoryByNormalizedName(nombreNormalizado) {
    // Ejecuta búsqueda parametrizada sobre la columna 'nombre_normalizado' limitando a 1 resultado determinista
    const result = await this.db.query(
      'SELECT * FROM categorias WHERE nombre_normalizado = $1 ORDER BY id ASC LIMIT 1',
      [nombreNormalizado]
    );
    // Devuelve el registro encontrado o null
    return result.rows[0] || null;
  }

  /**
   * Inserta una nueva categoría en el catálogo.
   *
   * Consulta ejecutada: `INSERT INTO categorias (nombre, nombre_normalizado, descripcion, estado) VALUES ($1, $2, $3, $4) RETURNING *`
   *
   * @param {object} data - Datos de la categoría a registrar.
   * @param {string} data.nombre - Nombre comercial visible.
   * @param {string} data.nombreNormalizado - Nombre canónico normalizado.
   * @param {string} [data.descripcion=''] - Descripción opcional de la categoría.
   * @param {string} [data.estado='Activa'] - Estado operativo inicial (`'Activa'` / `'Inactiva'`).
   * @returns {Promise<object>} Fila completa de la categoría recién insertada.
   */
  async createCategory({ nombre, nombreNormalizado, descripcion = '', estado = 'Activa' }) {
    // Inserta de forma parametrizada devolviendo todas las columnas generadas (id, created_at, etc.)
    const result = await this.db.query(
      `INSERT INTO categorias (nombre, nombre_normalizado, descripcion, estado)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre, nombreNormalizado, descripcion, estado]
    );
    // Retorna el objeto creado en base de datos
    return result.rows[0];
  }

  /**
   * Actualiza parcialmente una categoría existente preservando valores actuales cuando algún campo es `null`/`undefined`.
   *
   * Consulta ejecutada: `UPDATE categorias SET ... updated_at = NOW() WHERE id = $5 RETURNING *`
   *
   * @param {number|string} id - Identificador primario de la categoría a actualizar.
   * @param {object} fields - Campos a modificar (`nombre`, `nombreNormalizado`, `descripcion`, `estado`).
   * @returns {Promise<object|null>} Categoría actualizada o `null` si el `id` no existe.
   */
  async updateCategory(id, { nombre, nombreNormalizado, descripcion, estado }) {
    // Actualiza columnas con respaldo COALESCE y refresca la marca temporal 'updated_at'
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
    // Devuelve la fila modificada o null si no existía la categoría
    return result.rows[0] || null;
  }

  /**
   * Elimina una categoría por su identificador primario (los ítems asociados quedan con `categoria_id = NULL` por `ON DELETE SET NULL`).
   *
   * Consulta ejecutada: `DELETE FROM categorias WHERE id = $1 RETURNING *`
   *
   * @param {number|string} id - Identificador de la categoría a borrar.
   * @returns {Promise<object|null>} Registro eliminado o `null` si no se encontró.
   */
  async deleteCategory(id) {
    // Ejecuta DELETE parametrizado retornando los datos de la fila eliminada
    const result = await this.db.query(
      'DELETE FROM categorias WHERE id = $1 RETURNING *',
      [id]
    );
    // Retorna la categoría borrada o null
    return result.rows[0] || null;
  }

  // ===== ÍTEMS (PRODUCTOS E INVENTARIO) =====

  /**
   * Lista todos los productos del catálogo junto con el nombre legible de su categoría mediante `LEFT JOIN`.
   *
   * Consulta ejecutada: `SELECT i.*, c.nombre AS categoria_nombre FROM items i LEFT JOIN categorias c ON i.categoria_id = c.id ORDER BY i.id ASC`
   *
   * @returns {Promise<Array<object>>} Arreglo completo de ítems enriquecidos con `categoria_nombre`.
   */
  async listItems() {
    // Une cada ítem con su categoría opcional sin excluir productos que tengan categoria_id nulo
    const result = await this.db.query(`
      SELECT i.*, c.nombre AS categoria_nombre
      FROM items i
      LEFT JOIN categorias c ON i.categoria_id = c.id
      ORDER BY i.id ASC
    `);
    // Devuelve el listado ordenado de productos
    return result.rows;
  }

  /**
   * Consulta un producto específico por su ID primario incluyendo el nombre de su categoría asociada.
   *
   * Consulta ejecutada: `SELECT i.*, c.nombre AS categoria_nombre FROM items i LEFT JOIN categorias c ON i.categoria_id = c.id WHERE i.id = $1`
   *
   * @param {number|string} id - Identificador primario del ítem.
   * @returns {Promise<object|null>} Objeto del producto encontrado o `null` si no existe.
   */
  async findItemById(id) {
    // Ejecuta consulta parametrizada con LEFT JOIN a 'categorias' para devolver contexto completo
    const result = await this.db.query(
      `SELECT i.*, c.nombre AS categoria_nombre
       FROM items i
       LEFT JOIN categorias c ON i.categoria_id = c.id
       WHERE i.id = $1`,
      [id]
    );
    // Retorna la fila hallada o null si el ID no existe
    return result.rows[0] || null;
  }

  /**
   * Busca un producto a partir de su nombre canónico normalizado para detección de duplicados y validación de catálogo.
   *
   * Consulta ejecutada: `SELECT * FROM items WHERE nombre_normalizado = $1 ORDER BY id ASC LIMIT 1`
   *
   * @param {string} nombreNormalizado - Clave normalizada del nombre del producto.
   * @returns {Promise<object|null>} Primer ítem coincidente o `null` si no existe.
   */
  async findItemByNormalizedName(nombreNormalizado) {
    // Consulta parametrizada determinista por nombre_normalizado
    const result = await this.db.query(
      'SELECT * FROM items WHERE nombre_normalizado = $1 ORDER BY id ASC LIMIT 1',
      [nombreNormalizado]
    );
    // Retorna el ítem localizado o null
    return result.rows[0] || null;
  }

  /**
   * Registra un nuevo producto vendible en el catálogo con su SKU, precio unitario y stock inicial.
   *
   * Consulta ejecutada:
   * `INSERT INTO items (sku, nombre, nombre_normalizado, categoria_id, precio, stock, estado) VALUES ($1..$7) RETURNING *`
   *
   * @param {object} data - Propiedades del nuevo ítem.
   * @param {string} data.sku - Código único de referencia de inventario (SKU).
   * @param {string} data.nombre - Nombre comercial del producto.
   * @param {string} data.nombreNormalizado - Nombre canónico normalizado.
   * @param {number|null} [data.categoriaId=null] - ID de la categoría a la que pertenece.
   * @param {number} data.precio - Precio unitario de venta.
   * @param {number} [data.stock=0] - Cantidad inicial en inventario.
   * @param {string} [data.estado='Activo'] - Estado inicial del producto.
   * @returns {Promise<object>} Registro completo del producto recién insertado.
   */
  async createItem({
    sku,
    nombre,
    nombreNormalizado,
    categoriaId = null,
    precio,
    stock = 0,
    estado = 'Activo',
  }) {
    // Inserta el nuevo ítem con sus 7 valores enlazados posicionalmente
    const result = await this.db.query(
      `INSERT INTO items (sku, nombre, nombre_normalizado, categoria_id, precio, stock, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [sku, nombre, nombreNormalizado, categoriaId, precio, stock, estado]
    );
    // Devuelve el producto recién persistido en PostgreSQL
    return result.rows[0];
  }

  /**
   * Actualiza parcialmente los atributos comerciales o de inventario de un ítem existente.
   *
   * Consulta ejecutada: `UPDATE items SET ... updated_at = NOW() WHERE id = $8 RETURNING *`
   *
   * @param {number|string} id - Identificador primario del producto a modificar.
   * @param {object} fields - Campos opcionales (`sku`, `nombre`, `nombreNormalizado`, `categoriaId`, `precio`, `stock`, `estado`).
   * @returns {Promise<object|null>} Producto actualizado o `null` si el `id` no existe.
   */
  async updateItem(
    id,
    { sku, nombre, nombreNormalizado, categoriaId, precio, stock, estado }
  ) {
    // Ejecuta UPDATE seguro usando COALESCE para no pisar columnas cuando el argumento es undefined/null
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
    // Retorna la fila actualizada o null si no se halló el ítem
    return result.rows[0] || null;
  }

  /**
   * Ajusta de forma atómica el inventario de un producto sumando o restando unidades (`deltaQuantity`),
   * impidiendo mediante `GREATEST(0, ...)` que el stock resultante sea menor a cero.
   *
   * Consulta ejecutada: `UPDATE items SET stock = GREATEST(0, stock + $1), updated_at = NOW() WHERE id = $2 RETURNING *`
   *
   * @param {number|string} itemId - Identificador primario del producto cuyo stock se ajustará.
   * @param {number} deltaQuantity - Variación de unidades (negativa para ventas/salidas, positiva para entradas/reversiones).
   * @returns {Promise<object|null>} Registro actualizado del producto con su nuevo `stock` o `null` si no existe.
   */
  async adjustStock(itemId, deltaQuantity) {
    // Delega la aritmética al motor PostgreSQL para evitar lecturas obsoletas bajo concurrencia
    const result = await this.db.query(
      `UPDATE items
       SET stock = GREATEST(0, stock + $1),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [deltaQuantity, itemId]
    );
    // Devuelve el ítem con el stock recalculado o null si el ID no existe
    return result.rows[0] || null;
  }

  /**
   * Elimina físicamente un producto del catálogo por su identificador primario.
   *
   * Consulta ejecutada: `DELETE FROM items WHERE id = $1 RETURNING *`
   *
   * @param {number|string} id - Identificador primario del producto a eliminar.
   * @returns {Promise<object|null>} Fila del producto eliminado o `null` si no se encontró.
   */
  async deleteItem(id) {
    // Ejecuta el borrado parametrizado y retorna los datos del ítem eliminado
    const result = await this.db.query('DELETE FROM items WHERE id = $1 RETURNING *', [id]);
    // Retorna la fila borrada o null si el ítem no existía
    return result.rows[0] || null;
  }
}

// Exporta la clase CatalogRepository para su inyección en servicios operativos y de calidad
module.exports = CatalogRepository;
