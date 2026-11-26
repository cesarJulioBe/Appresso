/**
 * ============================================================================
 * ARCHIVO: src/infrastructure/database/repositories/RouteRepository.js
 * CAPA: Infraestructura — Repositorio SQL de la Tabla `routes`
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Gestionar en PostgreSQL las conexiones terrestres entre ciudades (`routes`),
 *   insertando pares simétricos (ida y vuelta enlazados con `pair_route_id`)
 *   mediante consultas parametrizadas (`$1, $2...`).
 *
 * QUIÉN LO INVOCA:
 *   `RouteService` (`src/application/delivery/RouteService.js`).
 * ============================================================================
 */

class RouteRepository {
  constructor({ db }) {
    // Pool de PostgreSQL inyectado desde `src/container.js`
    this.db = db;
  }

  /**
   * Crea un tramo bidireccional (A -> B y B -> A) enlazando ambas filas con `pair_route_id`.
   */
  async create(origin, destination, distanceKm) {
    // 1. Insertamos el sentido de ida (origen -> destino)
    const first = await this.db.query(
      `INSERT INTO routes (origin, destination, distance_km) VALUES ($1, $2, $3) RETURNING *`,
      [origin, destination, distanceKm]
    );
    const firstRoute = first.rows[0];

    // 2. Insertamos el sentido de regreso apuntando `pair_route_id` al ID de ida
    const second = await this.db.query(
      `INSERT INTO routes (origin, destination, distance_km, pair_route_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [destination, origin, distanceKm, firstRoute.id]
    );
    const secondRoute = second.rows[0];

    // 3. Actualizamos la fila de ida para que también conozca el ID de su par de regreso
    const updated = await this.db.query(
      `UPDATE routes SET pair_route_id = $1 WHERE id = $2 RETURNING *`,
      [secondRoute.id, firstRoute.id]
    );

    return { forward: updated.rows[0], backward: secondRoute };
  }

  // Lista todos los tramos guardados ordenados por su ID primario
  async findAll() {
    const result = await this.db.query('SELECT * FROM routes ORDER BY id ASC');
    return result.rows;
  }

  // Devuelve el listado alfabético sin duplicados (`UNION` + `DISTINCT`) de ciudades registradas
  async findCities() {
    const result = await this.db.query(
      `SELECT DISTINCT origin AS city FROM routes
       UNION
       SELECT DISTINCT destination AS city FROM routes
       ORDER BY city ASC`
    );
    return result.rows.map((row) => row.city);
  }

  // Elimina un tramo por su identificador primario
  async deleteById(id) {
    const result = await this.db.query('DELETE FROM routes WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}

module.exports = RouteRepository;
