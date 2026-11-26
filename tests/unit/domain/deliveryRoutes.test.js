const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const DeliveryGraph = require('../../../src/domain/delivery/DeliveryGraph');
const estimateGasCost = require('../../../src/domain/delivery/estimateGasCost');
const RouteService = require('../../../src/application/delivery/RouteService');

describe('Domain & Application - Delivery Routes (Graph & Dijkstra)', () => {
  it('DeliveryGraph computes shortest path via Dijkstra and estimateGasCost computes fuel cost', () => {
    const graph = new DeliveryGraph();
    graph.addRoute('Medellin', 'Envigado', 10);
    graph.addRoute('Envigado', 'Sabaneta', 5);
    graph.addRoute('Medellin', 'Sabaneta', 25);

    const shortest = graph.dijkstra('Medellin', 'Sabaneta');
    assert.deepEqual(shortest.path, ['Medellin', 'Envigado', 'Sabaneta']);
    assert.equal(shortest.distanceKm, 15);

    const gas = estimateGasCost(shortest.distanceKm, 15, 10500);
    assert.equal(gas.liters, 1);
    assert.equal(gas.cost, 10500);
  });

  it('RouteService calculates shortest route from repository edges and validates missing cities', async () => {
    const routeRepository = {
      async findAll() {
        return [
          { origin: 'Medellin', destination: 'Envigado', distance_km: '10' },
          { origin: 'Envigado', destination: 'Sabaneta', distance_km: '5' },
        ];
      },
      async findCities() {
        return ['Envigado', 'Medellin', 'Sabaneta'];
      },
    };
    const routeService = new RouteService({ routeRepository });

    const res = await routeService.calculateRoute({
      from: 'Medellin',
      to: 'Sabaneta',
      kmPerLiter: 15,
      pricePerLiter: 15000,
    });
    assert.deepEqual(res.path, ['Medellin', 'Envigado', 'Sabaneta']);
    assert.equal(res.distanceKm, 15);
    assert.equal(res.gas.cost, 15000);

    await assert.rejects(
      () => routeService.calculateRoute({ from: '', to: 'Sabaneta' }),
      { name: 'ValidationError' }
    );
  });
});
