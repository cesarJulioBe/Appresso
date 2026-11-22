const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

const {
  linearSearchRecord,
  binarySearchRecord,
  sumSalesLinear,
  countOrdersByCustomerQuadratic,
  countOrdersByCustomerLinear,
  bubbleSortRecords,
  mergeSortRecords,
  rankTopItemsQuadratic,
  rankTopItemsOptimized,
  normalizeAndUnifyStringsQuadratic,
  normalizeAndUnifyStringsLinear,
  generateSyntheticDataset,
  runExperimentalBenchmarkSuite,
} = require('../../../src/domain/algorithms/operationalAlgorithms');

const {
  analyzeUserBehaviorProfiles,
  predictDemandWithSimpleStatistics,
  discoverOperationalPatterns,
} = require('../../../src/domain/ai/userBehaviorStats');

const {
  TfModelManager,
  augmentFraudDataset,
  buildBaseFraudSamples,
} = require('../../../src/domain/ai/tfModelManager');

describe('Domain - Algorithms O(n), O(n²), O(n log n) & Experimental Comparison', () => {
  const dataset = generateSyntheticDataset(120);
  const sortedById = [...dataset].sort((a, b) => a.id - b.id);

  it('compares linearSearchRecord O(n) and binarySearchRecord O(log n)', () => {
    const lin = linearSearchRecord(sortedById, 120);
    const bin = binarySearchRecord(sortedById, 120);

    assert.ok(lin.found);
    assert.ok(bin.found);
    assert.equal(lin.found.id, bin.found.id);
    assert.ok(bin.operationsCount < lin.operationsCount);
  });

  it('computes sumSalesLinear in O(n) single pass', () => {
    const res = sumSalesLinear(dataset);
    assert.ok(res.totalSales > 0);
    assert.equal(res.validCount, 120);
    assert.equal(res.operationsCount, 120);
  });

  it('compares countOrdersByCustomerQuadratic O(n²) vs countOrdersByCustomerLinear O(n)', () => {
    const quad = countOrdersByCustomerQuadratic(dataset);
    const lin = countOrdersByCustomerLinear(dataset);

    assert.equal(quad.uniqueCustomers, lin.uniqueCustomers);
    assert.ok(lin.operationsCount < quad.operationsCount);
  });

  it('compares bubbleSortRecords O(n²) vs mergeSortRecords O(n log n) by date and amount', () => {
    const bubble = bubbleSortRecords(dataset, 'date', 'desc');
    const merge = mergeSortRecords(dataset, 'date', 'desc');

    assert.equal(bubble.sorted.length, merge.sorted.length);
    assert.equal(bubble.sorted[0].id, merge.sorted[0].id);
    assert.ok(merge.operationsCount < bubble.operationsCount);
  });

  it('compares rankTopItemsQuadratic O(n²) vs rankTopItemsOptimized O(n + k log k)', () => {
    const quad = rankTopItemsQuadratic(dataset, 5);
    const opt = rankTopItemsOptimized(dataset, 5);

    assert.equal(opt.ranking.length, 5);
    // La versión optimizada además unifica nombres con espacios/mayúsculas inconsistentes
    assert.ok(opt.totalUniqueItems <= quad.totalUniqueItems);
  });

  it('compares string normalization and deduplication O(n²) vs O(n)', () => {
    const strings = [
      'Café Americano',
      '  cafe   americano ',
      'CAFE AMERICANO',
      'Latte Vainilla',
      'latte  vainilla ',
    ];
    const quad = normalizeAndUnifyStringsQuadratic(strings);
    const lin = normalizeAndUnifyStringsLinear(strings);

    assert.equal(quad.unifiedCount, 2);
    assert.equal(lin.unifiedCount, 2);
    assert.equal(lin.duplicatesRemoved, 3);
  });

  it('runs experimental benchmark suite across multiple input sizes', () => {
    const suite = runExperimentalBenchmarkSuite([50, 150]);
    assert.equal(suite.experiments.length, 2);
    assert.ok(suite.optimizationSummary.length >= 4);
  });
});

describe('Domain - Non-LLM AI: Simple Statistics & TensorFlow/Keras Models', () => {
  it('analyzes user behavior quartiles, anomaly scores, and demand regression with Simple Statistics', () => {
    const users = [
      { id: 1, nombre: 'Cliente Normal', email: 'normal@appresso.co', rol: 'cliente' },
      { id: 2, nombre: 'Empleado Sospechoso', email: 'sospechoso@appresso.co', rol: 'empleado' },
    ];
    const invoices = [
      { id: 1, usuario_id: 1, total: 18000, porcentaje_descuento: 5, descuento: 900, estado: 'Pagada', canal: 'presencial' },
      { id: 2, usuario_id: 1, total: 22000, porcentaje_descuento: 0, descuento: 0, estado: 'Pagada', canal: 'app' },
      { id: 3, usuario_id: 2, total: 240000, porcentaje_descuento: 50, descuento: 120000, estado: 'Anulada', canal: 'presencial' },
      { id: 4, usuario_id: 2, total: 310000, porcentaje_descuento: 45, descuento: 139500, estado: 'Anulada', canal: 'web' },
    ];

    const analysis = analyzeUserBehaviorProfiles({ users, invoices, orders: [], payments: [], transactions: [] });
    assert.equal(analysis.profiles.length, 2);
    // El primer perfil ordenado por mayor anomalyScore debe ser el usuario sospechoso
    assert.equal(analysis.profiles[0].email, 'sospechoso@appresso.co');
    assert.equal(analysis.profiles[0].classification, 'SOSPECHOSO');
    assert.ok(analysis.profiles[0].alerts.length >= 2);
    assert.ok(analysis.profiles[0].quartiles.q3 > 0);

    const demandForecast = predictDemandWithSimpleStatistics([15, 18, 22, 25, 29, 33], 5);
    assert.ok(demandForecast.slope > 0);
    assert.equal(demandForecast.trend, 'creciente');
    assert.equal(demandForecast.forecasts.length, 5);

    const patterns = discoverOperationalPatterns({ invoices });
    assert.ok(patterns.amountQuartiles.median > 0);
  });

  it('augments dataset, trains Keras neural models, saves/loads from disk, and classifies operations', async () => {
    const baseSamples = buildBaseFraudSamples([]);
    const augmented = augmentFraudDataset(baseSamples, 2);
    assert.equal(augmented.length, baseSamples.length * 3);

    const tempModelsDir = path.join(os.tmpdir(), `appresso_tf_test_${Date.now()}`);
    const manager = new TfModelManager({ modelsDir: tempModelsDir });

    const status = await manager.trainAndSaveModels({
      realOperations: [],
      epochs: 15,
      augmentationFactor: 1,
    });
    assert.equal(status.isReady, true);
    assert.ok(status.fraudClassifier.augmentedSamplesCount > status.fraudClassifier.baseSamplesCount);

    // Verificar carga desde disco en una nueva instancia de TfModelManager
    const loaderManager = new TfModelManager({ modelsDir: tempModelsDir });
    const loadedOk = await loaderManager.loadModelsFromDisk();
    assert.equal(loadedOk, true);

    const normalPred = await loaderManager.classifyOperation({
      monto: 16000,
      fecha: '2026-11-22T14:00:00.000Z',
      metodoPago: 'Tarjeta',
      firmaValida: true,
      frecuencia: 1,
      porcentajeDescuento: 5,
      tasaAnulacionUsuario: 0,
      canal: 'presencial',
    });
    assert.equal(normalPred.classification, 'NORMAL');

    const fraudPred = await loaderManager.classifyOperation({
      monto: 280000,
      fecha: '2026-11-22T02:30:00.000Z',
      metodoPago: 'Transferencia',
      firmaValida: false,
      frecuencia: 8,
      porcentajeDescuento: 55,
      tasaAnulacionUsuario: 40,
      canal: 'web',
    });
    assert.equal(fraudPred.classification, 'FRAUDULENTA');
    assert.equal(fraudPred.isFraudulent, true);

    const demandPred = await loaderManager.predictExpectedDemandAndAmount({
      dayOfWeek: 6,
      hour: 15,
      canal: 'app',
      porcentajeDescuento: 10,
      promedioHistoricoUnidades: 25,
    });
    assert.ok(demandPred.predictedDemandUnits >= 1);
    assert.ok(demandPred.predictedExpectedAmount > 0);
  });
});
