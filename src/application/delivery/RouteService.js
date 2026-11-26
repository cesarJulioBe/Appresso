/**
 * ============================================================================
 * ARCHIVO: src/application/delivery/RouteService.js
 * CAPA: Aplicación — Casos de Uso de Planificación de Rutas y Entregas
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Orquestar la administración de rutas entre ciudades y el cálculo del
 *   trayecto más corto combinando `RouteRepository` (SQL), `DeliveryGraph`
 *   (Dijkstra) y `estimateGasCost` (estimación de combustible).
 *
 * CERO REDUNDANCIA:
 *   Las validaciones de negocio (`from` y `to` requeridos, `origin`,
 *   `destination` y `distanceKm` requeridos) viven UNA SOLA VEZ aquí y NO se
 *   duplican en validadores HTTP.
 * ============================================================================
 */

const DeliveryGraph = require('../../domain/delivery/DeliveryGraph');
const estimateGasCost = require('../../domain/delivery/estimateGasCost');
const { ValidationError, NotFoundError } = require('../../domain/errors');

class RouteService {
  constructor({ routeRepository, logger }) {
    this.routeRepository = routeRepository;
    this.logger = logger;
  }

  // Método privado que hidrata en memoria una instancia de `DeliveryGraph` con las filas de PostgreSQL
  async #buildGraphFromDB() {
    const rows = await this.routeRepository.findAll();
    const graph = new DeliveryGraph();
    for (const row of rows) {
      graph.addEdge(row.origin, row.destination, parseFloat(row.distance_km));
    }
    return graph;
  }

  // Dispara: GET /delivery/cities
  async listCities() {
    return this.routeRepository.findCities();
  }

  // Dispara: GET /delivery/route?from=...&to=...&kmPerLiter=...&pricePerLiter=...
  async calculateRoute({ from, to, kmPerLiter, pricePerLiter }) {
    // Validación única de negocio (no repetida en la capa HTTP)
    if (!from || !to) {
      throw new ValidationError('from y to son obligatorios');
    }

    const graph = await this.#buildGraphFromDB();
    const result = graph.dijkstra(from, to);
    if (!result.distanceKm) {
      throw new NotFoundError('No existe ruta entre esas ciudades');
    }

    const gas = estimateGasCost(
      result.distanceKm,
      parseFloat(kmPerLiter) || 15,
      parseFloat(pricePerLiter) || 10500
    );

    return { path: result.path, distanceKm: result.distanceKm, gas };
  }

  // Dispara: POST /delivery/routes
  async create({ origin, destination, distanceKm }) {
    // Validación única de negocio
    if (!origin || !destination || !distanceKm) {
      throw new ValidationError('origin, destination y distanceKm son obligatorios');
    }

    const created = await this.routeRepository.create(
      origin,
      destination,
      parseFloat(distanceKm)
    );

    this.logger?.info('Ruta de entrega creada', {
      origin,
      destination,
      distanceKm: parseFloat(distanceKm),
    });

    return created;
  }

  // Dispara: GET /delivery/routes
  async list() {
    return this.routeRepository.findAll();
  }

  // Dispara: DELETE /delivery/routes/:id
  async delete(id) {
    const deleted = await this.routeRepository.deleteById(id);
    if (!deleted) {
      throw new NotFoundError('Ruta no encontrada');
    }

    this.logger?.info('Ruta de entrega eliminada', { routeId: id });
    return { deleted };
  }
}

module.exports = RouteService;
