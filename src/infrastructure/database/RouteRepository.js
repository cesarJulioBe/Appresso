const pool = require('./connection');

class RouteRepository {
  async create(origin, destination, distanceKm) {
    const first = await pool.query(
      `INSERT INTO routes (origin, destination, distance_km) VALUES ($1, $2, $3) RETURNING *`,
      [origin, destination, distanceKm]
    );
    const firstRoute = first.rows[0];

    const second = await pool.query(
      `INSERT INTO routes (origin, destination, distance_km, pair_route_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [destination, origin, distanceKm, firstRoute.id]
    );
    const secondRoute = second.rows[0];

    const updated = await pool.query(
      `UPDATE routes SET pair_route_id = $1 WHERE id = $2 RETURNING *`,
      [secondRoute.id, firstRoute.id]
    );

    return { forward: updated.rows[0], backward: secondRoute };
  }

  async findAll() {
    const result = await pool.query('SELECT * FROM routes ORDER BY id ASC');
    return result.rows;
  }

  async findCities() {
    const result = await pool.query(
      `SELECT DISTINCT origin AS city FROM routes
       UNION
       SELECT DISTINCT destination AS city FROM routes
       ORDER BY city ASC`
    );
    return result.rows.map(row => row.city);
  }

  async deleteById(id) {
    const result = await pool.query('DELETE FROM routes WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}

module.exports = new RouteRepository();