class DeliveryController {
  constructor({ routeService }) {
    this.routeService = routeService;
  }

  listCities = async (_req, res) => {
    const cities = await this.routeService.listCities();
    res.json(cities);
  };

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

  createRoute = async (req, res) => {
    const { origin, destination, distanceKm } = req.body;
    const created = await this.routeService.create({ origin, destination, distanceKm });
    res.status(201).json(created);
  };

  listRoutes = async (_req, res) => {
    const routes = await this.routeService.list();
    res.json(routes);
  };

  deleteRoute = async (req, res) => {
    const result = await this.routeService.delete(req.params.id);
    res.json(result);
  };
}

module.exports = DeliveryController;
