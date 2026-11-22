const Order = require('../../../domain/entities/Order');

class OrderRepository {
  constructor({ db }) {
    this.db = db;
  }

  toOrder(row) {
    const order = new Order(row.id, row.customer, row.products || [], row.status);
    order.createdAt = row.created_at;
    order.canal = row.canal || 'presencial';
    order.usuarioId = row.usuario_id || null;
    order.empleadoId = row.empleado_id || null;
    order.subtotal = row.subtotal !== undefined && row.subtotal !== null
      ? Number(row.subtotal)
      : order.totalAmount();
    order.descuento = Number(row.descuento || 0);
    order.impuestos = Number(row.impuestos || 0);
    order.total = row.total !== undefined && row.total !== null && Number(row.total) > 0
      ? Number(row.total)
      : order.totalAmount();
    return order;
  }

  async create(customer, products) {
    const result = await this.db.query(
      `INSERT INTO orders (customer, products, status)
       VALUES ($1, $2, 'Requested')
       RETURNING *`,
      [customer, JSON.stringify(products)]
    );
    return this.toOrder(result.rows[0]);
  }

  async createExtended({
    customer,
    products,
    status = 'Requested',
    usuarioId = null,
    empleadoId = null,
    canal = 'presencial',
    subtotal = 0,
    descuento = 0,
    impuestos = 0,
    total = 0,
  }) {
    const result = await this.db.query(
      `INSERT INTO orders (
        customer, products, status, usuario_id, empleado_id,
        canal, subtotal, descuento, impuestos, total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        customer,
        JSON.stringify(products),
        status,
        usuarioId,
        empleadoId,
        canal,
        subtotal,
        descuento,
        impuestos,
        total,
      ]
    );
    return this.toOrder(result.rows[0]);
  }

  async findById(id) {
    const result = await this.db.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.toOrder(result.rows[0]);
  }

  async findAll(page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;

    const result = await this.db.query(
      'SELECT * FROM orders ORDER BY id ASC LIMIT $1 OFFSET $2',
      [pageSize, offset]
    );

    const countResult = await this.db.query('SELECT COUNT(*) FROM orders');
    const total = parseInt(countResult.rows[0].count, 10);

    return {
      orders: result.rows.map((row) => this.toOrder(row)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findAllUnpaginated() {
    const result = await this.db.query('SELECT * FROM orders ORDER BY id ASC');
    return result.rows.map((row) => this.toOrder(row));
  }

  async findByStatus(status) {
    const result = await this.db.query(
      'SELECT * FROM orders WHERE status = $1 ORDER BY id ASC',
      [status]
    );
    return result.rows.map((row) => this.toOrder(row));
  }

  async updateStatus(id, status) {
    const result = await this.db.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return null;
    return this.toOrder(result.rows[0]);
  }
}

module.exports = OrderRepository;
