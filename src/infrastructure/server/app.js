const express = require('express');
const cors = require('cors');
const orderRepository = require('../database/OrderRepository');
const calculateStatistics = require('../../domain/algorithms/calculateStatistics');
const linearSearch = require('../../domain/algorithms/linearSearch');
const binarySearch = require('../../domain/algorithms/binarySearch');
const { findPositionForValue } = require('../../domain/algorithms/arithmeticProgression');
const linearRegression = require('../../domain/algorithms/linearRegression');

const app = express();
app.use(express.json());
app.use(cors());
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

    const linear = linearSearch(allOrders, targetId);
    const binary = binarySearch(allOrders, targetId);

    res.json({
      linear: { found: linear.order ? true : false, operations: linear.operationsCount },
      binary: { found: binary.found ? true : false, operations: binary.operationsCount },
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