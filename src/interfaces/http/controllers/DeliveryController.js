/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/controllers/DeliveryController.js
 * CAPA: Interfaces HTTP — Controlador de Planificación de Rutas
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Traducir las peticiones HTTP de consulta de ciudades, cálculo de camino
 *   más corto (Dijkstra) y CRUD de rutas hacia llamadas sobre `RouteService`.
 * ============================================================================
 */

class DeliveryController {
  constructor({ routeService }) {
    this.routeService = routeService;
  }

  // GET /delivery/cities
  listCities = async (_req, res) => {
    const cities = await this.routeService.listCities();
    res.json(cities);
  };

  // GET /delivery/route?from=A&to=B&kmPerLiter=15&pricePerLiter=10500
  calculateRoute = async (req, res) => {
    const { from, to, kmPerLiter, pricePerLiter } = req.query;
    const result = await this.routeService.calculateRoute({
      from,
      to,
      kmPerLiter,
      pricePerLiter,
    });
    res.json(result);
  };

  // POST /delivery/routes
  createRoute = async (req, res) => {
    const { origin, destination, distanceKm } = req.body;
    const created = await this.routeService.create({ origin, destination, distanceKm });
    res.status(201).json(created);
  };

  // GET /delivery/routes
  listRoutes = async (_req, res) => {
    const routes = await this.routeService.list();
    res.json(routes);
  };

  // DELETE /delivery/routes/:id
  deleteRoute = async (req, res) => {
    const result = await this.routeService.delete(Number(req.params.id));
    res.json(result);
  };
}

module.exports = DeliveryController;
