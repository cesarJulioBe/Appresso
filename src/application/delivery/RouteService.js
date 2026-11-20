const DeliveryGraph = require('../../domain/delivery/DeliveryGraph');
const estimateGasCost = require('../../domain/delivery/estimateGasCost');
const { ValidationError, NotFoundError } = require('../../domain/errors');

class RouteService {
  constructor({ routeRepository, logger }) {
    this.routeRepository = routeRepository;
    this.logger = logger;
  }

  async #buildGraphFromDB() {
    const rows = await this.routeRepository.findAll();
    const graph = new DeliveryGraph();
    for (const row of rows) {
      graph.addEdge(row.origin, row.destination, parseFloat(row.distance_km));
    }
    return graph;
  }

  async listCities() {
    return this.routeRepository.findCities();
  }

  async calculateRoute({ from, to, kmPerLiter, pricePerLiter }) {
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

  async create({ origin, destination, distanceKm }) {
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

  async list() {
    return this.routeRepository.findAll();
  }

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
