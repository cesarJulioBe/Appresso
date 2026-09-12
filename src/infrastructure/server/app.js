const express = require('express');
const cors = require('cors');
const orderRepository = require('../database/OrderRepository');
const calculateStatistics = require('../../domain/algorithms/calculateStatistics');
const linearSearch = require('../../domain/algorithms/linearSearch');
const binarySearch = require('../../domain/algorithms/binarySearch');
const { findPositionForValue } = require('../../domain/algorithms/arithmeticProgression');
const linearRegression = require('../../domain/algorithms/linearRegression');
const OrderQueue = require('../../domain/delivery/OrderQueue');
const ActionStack = require('../../domain/delivery/ActionStack');
const DeliveryGraph = require('../../domain/delivery/DeliveryGraph');
const estimateGasCost = require('../../domain/delivery/estimateGasCost');
const routeRepository = require('../database/RouteRepository');

const app = express();
app.use(cors());
app.use(express.json());
// Pila compartida: guarda el historial de cambios de estado para poder deshacer
const actionStack = new ActionStack();

async function buildGraphFromDB() {
  const rows = await routeRepository.findAll();
  const graph = new DeliveryGraph();
  for (const row of rows) {
    graph.addEdge(row.origin, row.destination, parseFloat(row.distance_km));
  }
  return graph;
}

app.get('/queue/pending', async (req, res) => {
  try {
    const allOrders = await orderRepository.findAll();
    const pending = allOrders.filter(o => o.status === 'Requested');

    const queue = new OrderQueue();
    pending.forEach(order => queue.enqueue(order));

    res.json({
      totalPending: queue.size(),
      next: queue.peek(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar la cola' });
  }
});

app.post('/queue/next', async (req, res) => {
  try {
    const allOrders = await orderRepository.findAll();
    const pending = allOrders.filter(o => o.status === 'Requested');

    const queue = new OrderQueue();
    pending.forEach(order => queue.enqueue(order));

    const nextOrder = queue.dequeue();
    if (!nextOrder) {
      return res.status(404).json({ error: 'No hay pedidos pendientes' });
    }

    actionStack.push({ orderId: nextOrder.id, previousStatus: nextOrder.status, newStatus: 'In Progress' });
    const updated = await orderRepository.updateStatus(nextOrder.id, 'In Progress');

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al atender el pedido' });
  }
});

app.post('/orders/undo', async (req, res) => {
  try {
    const lastAction = actionStack.pop();
    if (!lastAction) {
      return res.status(404).json({ error: 'No hay acciones para deshacer' });
    }

    const restored = await orderRepository.updateStatus(lastAction.orderId, lastAction.previousStatus);
    res.json({ undone: lastAction, order: restored });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al deshacer' });
  }
});

app.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Requested', 'In Progress', 'Delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const currentOrder = await orderRepository.findById(req.params.id);
    if (currentOrder) {
      actionStack.push({ orderId: currentOrder.id, previousStatus: currentOrder.status, newStatus: status });
    }

    const order = await orderRepository.updateStatus(req.params.id, status);
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el estado' });
  }
});

app.get('/delivery/cities', async (req, res) => {
  try {
    const cities = await routeRepository.findCities();
    res.json(cities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ciudades' });
  }
});

app.get('/delivery/route', async (req, res) => {
  try {
    const { from, to, kmPerLiter, pricePerLiter } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from y to son obligatorios' });
    }

    const graph = await buildGraphFromDB();
    const result = graph.dijkstra(from, to);
    if (!result.distanceKm) {
      return res.status(404).json({ error: 'No existe ruta entre esas ciudades' });
    }

    const gas = estimateGasCost(
      result.distanceKm,
      parseFloat(kmPerLiter) || 15,
      parseFloat(pricePerLiter) || 10500
    );

    res.json({ path: result.path, distanceKm: result.distanceKm, gas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular la ruta' });
  }
});

app.post('/delivery/routes', async (req, res) => {
  try {
    const { origin, destination, distanceKm } = req.body;
    if (!origin || !destination || !distanceKm) {
      return res.status(400).json({ error: 'origin, destination y distanceKm son obligatorios' });
    }
    const created = await routeRepository.create(origin, destination, parseFloat(distanceKm));
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la ruta' });
  }
});

app.post('/delivery/routes', async (req, res) => {
  try {
    const { origin, destination, distanceKm } = req.body;
    if (!origin || !destination || !distanceKm) {
      return res.status(400).json({ error: 'origin, destination y distanceKm son obligatorios' });
    }
    const created = await routeRepository.create(origin, destination, parseFloat(distanceKm));
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la ruta' });
  }
});

app.get('/delivery/routes', async (req, res) => {
  try {
    const routes = await routeRepository.findAll();
    res.json(routes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar rutas' });
  }
});

app.delete('/delivery/routes/:id', async (req, res) => {
  try {
    const deleted = await routeRepository.deleteById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }
    res.json({ deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la ruta' });
  }
});

app.get('/delivery/routes', async (req, res) => {
  try {
    const routes = await routeRepository.findAll();
    res.json(routes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar rutas' });
  }
});

app.delete('/delivery/routes/:id', async (req, res) => {
  try {
    const deleted = await routeRepository.deleteById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }
    res.json({ deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la ruta' });
  }
});



// Crear un pedido
app.post('/orders', async (req, res) => {
  try {
    const { customer, products } = req.body;

    if (!customer || !products) {
      return res.status(400).json({ error: 'customer y products son obligatorios' });
    }

    const order = await orderRepository.create(customer, products);
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el pedido' });
  }
});

// Listar todos los pedidos
app.get('/orders', async (req, res) => {
  try {
    const orders = await orderRepository.findAll();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar pedidos' });
  }
});

// Buscar un pedido por ID (directo en la base de datos, usando su índice)
app.get('/orders/:id', async (req, res) => {
  try {
    const order = await orderRepository.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar el pedido' });
  }
});

// Buscar un pedido por ID usando tus algoritmos en memoria (para comparar)
app.get('/orders/search/:id', async (req, res) => {
  try {
    const allOrders = await orderRepository.findAll();
    const targetId = parseInt(req.params.id);

    const linearResult = linearSearch(allOrders, targetId);
    const binaryResult = binarySearch(allOrders, targetId);

    const foundOrder = linearResult.order || binaryResult.found || null;

    res.json({
      order: foundOrder,
      linear: { found: !!linearResult.order, operations: linearResult.operationsCount },
      binary: { found: !!binaryResult.found, operations: binaryResult.operationsCount },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar el pedido' });
  }
});

// Estadísticas de todos los pedidos
app.get('/statistics', async (req, res) => {
  try {
    const orders = await orderRepository.findAll();
    const result = calculateStatistics(orders);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular estadísticas' });
  }
});

// Caso 3: Programa de fidelización (progresión aritmética)
app.get('/loyalty/progression', (req, res) => {
  try {
    const firstTerm = parseFloat(req.query.firstTerm) || 2;
    const commonDifference = parseFloat(req.query.commonDifference) || 2;
    const targets = [42, 72, 120];

    const results = targets.map(target => ({
      target,
      week: findPositionForValue(firstTerm, commonDifference, target),
    }));

    res.json({ firstTerm, commonDifference, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular la progresión' });
  }
});

// Caso 4: Predicción de ventas (regresión lineal)
app.post('/sales/predict', (req, res) => {
  try {
    const { salesHistory } = req.body;

    if (!Array.isArray(salesHistory) || salesHistory.length < 2) {
      return res.status(400).json({ error: 'salesHistory debe ser un arreglo con al menos 2 valores' });
    }

    const model = linearRegression(salesHistory);
    const days = [2, 5, 7];
    const predictions = days.map(d => ({ days: d, predictedSales: model.predict(d) }));

    res.json({ slope: model.slope, intercept: model.intercept, predictions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular la predicción' });
  }
});

module.exports = app;