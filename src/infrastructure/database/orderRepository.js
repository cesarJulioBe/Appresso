const pool = require('./connection');
const Order = require('../../domain/entities/Order');

class OrderRepository {
  // Convierte una fila de la base de datos en una instancia de Order
  toOrder(row) {
    const order = new Order(row.id, row.customer, row.products, row.status);
    order.createdAt = row.created_at;
    return order;
  }

  async create(customer, products) {
    const result = await pool.query(
      `INSERT INTO orders (customer, products, status)
       VALUES ($1, $2, 'Requested')
       RETURNING *`,
      [customer, JSON.stringify(products)]
    );
    return this.toOrder(result.rows[0]);
  }

  async findById(id) {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.toOrder(result.rows[0]);
  }

   async findAll() {
    const result = await pool.query('SELECT * FROM orders ORDER BY id ASC');
    return result.rows.map(row => this.toOrder(row));
  }

  async updateStatus(id, status) {
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return null;
    return this.toOrder(result.rows[0]);
  }

}

module.exports = new OrderRepository();