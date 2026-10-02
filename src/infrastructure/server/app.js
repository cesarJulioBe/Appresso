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
const userRepository = require('../database/UserRepository');
const transactionRepository = require('../database/TransactionRepository');
const anomalyRepository = require('../database/AnomalyRepository');
const thresholdRepository = require('../database/ThresholdRepository');
const SlidingWindow = require('../../domain/fraud/SlidingWindow');
const detectAnomaly = require('../../domain/fraud/detectAnomaly');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
// Pila compartida: guarda el historial de cambios de estado para poder deshacer
const actionStack = new ActionStack();
// Ventana deslizante compartida para detección de fraude (una instancia viva mientras el servidor corre)
const fraudSlidingWindow = new SlidingWindow();

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
   // const allOrders = await orderRepository.findAll();
   const { orders: allOrders } = await orderRepository.findAll(1, 1000000);
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
   // const allOrders = await orderRepository.findAll();
   const { orders: allOrders } = await orderRepository.findAll(1, 1000000);
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

app.get('/orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const result = await orderRepository.findAll(page, pageSize);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar pedidos' });
  }
});

/*// Listar todos los pedidos
app.get('/orders', async (req, res) => {
  try {
    const orders = await orderRepository.findAll();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar pedidos' });
  }
});*/

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
   // const allOrders = await orderRepository.findAll();
   const { orders: allOrders } = await orderRepository.findAll(1, 1000000);
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
    const { orders } = await orderRepository.findAll(1, 1000000);
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

async function receiveTransaction(req, res) {
  try {
    const {
      idTxn,
      user = req.body.email,
      date = req.body.fechaTxn || req.body.fecha_txn,
      value = req.body.valor,
      paymentMethod = req.body.metodoPago || req.body.metodo_pago,
      hash,
    } = req.body;

    if (!user || !date || !value || !hash) {
      return res.status(400).json({ error: 'user, date, value y hash son obligatorios' });
    }

    const thresholds = await thresholdRepository.findAll();
    const secret = process.env.HMAC_SECRET;
    const receivedAt = new Date();

    const transaction = { idTxn, user, date, value, paymentMethod, hash };
    const analysis = detectAnomaly(transaction, fraudSlidingWindow, thresholds, secret, receivedAt);

    // Buscamos o creamos el usuario
    const usuario = await userRepository.findOrCreate(user);

    // Guardamos la transacción
    const savedTransaction = await transactionRepository.create({
      usuarioId: usuario.id,
      valor: value,
      fechaTxn: receivedAt,
      hash,
      metodoPago: paymentMethod,
      estado: analysis.isHashValid ? 'Procesada' : 'Hash inválido',
    });

    let savedAnomaly = null;
    if (analysis.isAnomaly) {
      savedAnomaly = await anomalyRepository.create({
        transaccionId: savedTransaction.id,
        tipo: analysis.tipo,
        nivel: 'Alto',
        cantidadTransacciones: analysis.transactionCount,
        ventanaSegundos: analysis.ventanaSegundos,
      });
    }

    res.status(201).json({
      transaction: savedTransaction,
      analysis,
      anomaly: savedAnomaly,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar la transacción' });
  }
}

app.post('/transactions', receiveTransaction);
app.post('/api/transactions', receiveTransaction);
app.post('/fraud/transactions', receiveTransaction);

app.get('/fraud/stats', async (req, res) => {
  try {
    const totalTransacciones = await transactionRepository.countAll();
    const totalAnomalias = await anomalyRepository.countAll();

    const porcentajeAnomalias = totalTransacciones > 0
      ? ((totalAnomalias / totalTransacciones) * 100).toFixed(2)
      : '0.00';

    res.json({
      totalTransacciones,
      totalAnomalias,
      porcentajeAnomalias: parseFloat(porcentajeAnomalias),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular estadísticas de fraude' });
  }
});

app.get('/fraud/dashboard', async (req, res) => {
  try {
    const [transactions, anomalies] = await Promise.all([
      transactionRepository.findAll(),
      anomalyRepository.findAll(),
    ]);
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
    const periods = [
      { key: 'hoy', label: 'Hoy', start: startOfDay.getTime() },
      { key: 'semana', label: 'Esta semana', start: startOfWeek.getTime() },
      { key: 'mes', label: 'Este mes', start: startOfMonth.getTime() },
    ];
    const inPeriod = (date, start) => new Date(date).getTime() >= start;
    const periodStats = periods.reduce((result, period) => {
      const periodTransactions = transactions.filter(t => inPeriod(t.fecha_txn, period.start));
      const periodAnomalies = anomalies.filter(a => inPeriod(a.fecha_txn, period.start));
      result[period.key] = {
        label: period.label,
        transacciones: periodTransactions.length,
        anomalias: periodAnomalies.length,
        porcentajeAnomalias: periodTransactions.length
          ? Number(((periodAnomalies.length / periodTransactions.length) * 100).toFixed(2))
          : 0,
      };
      return result;
    }, {});

    const users = new Set(transactions.map(t => t.email));
    const affectedUsers = new Set(anomalies.map(a => a.email));
    const paymentMethods = transactions.reduce((result, transaction) => {
      const method = transaction.metodo_pago || 'No especificado';
      result[method] = (result[method] || 0) + 1;
      return result;
    }, {});
    const levels = anomalies.reduce((result, anomaly) => {
      const level = anomaly.nivel || 'Sin nivel';
      result[level] = (result[level] || 0) + 1;
      return result;
    }, {});
    const hourlyAnomalies = Array.from({ length: 24 }, (_, hour) => ({
      hora: `${String(hour).padStart(2, '0')}:00`,
      cantidad: anomalies.filter(a => new Date(a.fecha_txn).getHours() === hour).length,
    }));
    const suspiciousValue = anomalies.reduce((sum, anomaly) => sum + Number(anomaly.valor || 0), 0);
    const recentTimeline = anomalies.slice(0, 12).map(anomaly => ({
      ...anomaly,
      estado: anomaly.estado || 'Abierta',
    }));

    res.json({
      periods: periodStats,
      totals: {
        transacciones: transactions.length,
        anomalias: anomalies.length,
        usuarios: users.size,
        usuariosAfectados: affectedUsers.size,
        valorSospechoso: suspiciousValue,
        promedioPorUsuario: users.size ? Number((transactions.length / users.size).toFixed(2)) : 0,
        anomaliasNuevas: anomalies.filter(a => now - new Date(a.fecha_creacion || a.fecha_txn).getTime() <= 86400000).length,
      },
      statuses: { abiertas: anomalies.length, revisadas: 0, descartadas: 0 },
      paymentMethods,
      levels,
      hourlyAnomalies,
      timeline: recentTimeline,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al construir el dashboard de fraude' });
  }
});

app.get('/fraud/anomalies', async (req, res) => {
  try {
    const anomalies = await anomalyRepository.findAll();
    res.json(anomalies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar anomalías' });
  }
});

app.get('/fraud/transactions', async (req, res) => {
  try {
    const transactions = await transactionRepository.findAll();
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar transacciones' });
  }
});

app.post('/fraud/simulate', async (req, res) => {
  try {
    const { user, value, paymentMethod } = req.body;
    if (!user || !value) {
      return res.status(400).json({ error: 'user y value son obligatorios' });
    }

    const idTxn = Date.now();
    const date = new Date().toISOString();
    const secret = process.env.HMAC_SECRET;

    const base = { idTxn, user, date, value, paymentMethod: paymentMethod || 'Tarjeta' };
    const payload = JSON.stringify(base, Object.keys(base).sort());
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const thresholds = await thresholdRepository.findAll();
    const transaction = { ...base, hash };
    const analysis = detectAnomaly(transaction, fraudSlidingWindow, thresholds, secret);

    const usuario = await userRepository.findOrCreate(user);
    const savedTransaction = await transactionRepository.create({
      usuarioId: usuario.id,
      valor: value,
      fechaTxn: date,
      hash,
      metodoPago: base.paymentMethod,
      estado: 'Procesada',
    });

    let savedAnomaly = null;
    if (analysis.isAnomaly) {
      savedAnomaly = await anomalyRepository.create({
        transaccionId: savedTransaction.id,
        tipo: analysis.tipo,
        nivel: 'Alto',
        cantidadTransacciones: analysis.transactionCount,
        ventanaSegundos: analysis.ventanaSegundos,
      });
    }

    res.status(201).json({ transaction: savedTransaction, analysis, anomaly: savedAnomaly });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al simular transacción' });
  }
});

app.get('/fraud/thresholds', async (req, res) => {
  try {
    const thresholds = await thresholdRepository.findAll();
    res.json(thresholds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener umbrales' });
  }
});

app.put('/fraud/thresholds/:franja', async (req, res) => {
  try {
    const { franja } = req.params;
    const { umbralTransacciones, ventanaSegundos } = req.body;

    if (!umbralTransacciones || !ventanaSegundos) {
      return res.status(400).json({ error: 'umbralTransacciones y ventanaSegundos son obligatorios' });
    }

    const updated = await thresholdRepository.updateThreshold(franja, umbralTransacciones, ventanaSegundos);
    if (!updated) {
      return res.status(404).json({ error: 'Franja no encontrada' });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el umbral' });
  }
});

module.exports = app;