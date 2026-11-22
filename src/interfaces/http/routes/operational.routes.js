const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');

function createOperationalRoutes(controller) {
  const router = express.Router();

  // Resumen ejecutivo del panel
  router.get(
    '/operational/summary',
    asyncHandler((req, res) => controller.getExecutiveSummary(req, res))
  );

  // Usuarios con roles
  router.get(
    '/operational/users',
    asyncHandler((req, res) => controller.listUsers(req, res))
  );
  router.post(
    '/operational/users',
    asyncHandler((req, res) => controller.createUser(req, res))
  );
  router.put(
    '/operational/users/:id',
    asyncHandler((req, res) => controller.updateUser(req, res))
  );
  router.delete(
    '/operational/users/:id',
    asyncHandler((req, res) => controller.deleteUser(req, res))
  );

  // Categorías
  router.get(
    '/operational/categories',
    asyncHandler((req, res) => controller.listCategories(req, res))
  );
  router.post(
    '/operational/categories',
    asyncHandler((req, res) => controller.createCategory(req, res))
  );
  router.put(
    '/operational/categories/:id',
    asyncHandler((req, res) => controller.updateCategory(req, res))
  );
  router.delete(
    '/operational/categories/:id',
    asyncHandler((req, res) => controller.deleteCategory(req, res))
  );

  // Ítems / Inventario
  router.get(
    '/operational/items',
    asyncHandler((req, res) => controller.listItems(req, res))
  );
  router.post(
    '/operational/items',
    asyncHandler((req, res) => controller.createItem(req, res))
  );
  router.put(
    '/operational/items/:id',
    asyncHandler((req, res) => controller.updateItem(req, res))
  );
  router.delete(
    '/operational/items/:id',
    asyncHandler((req, res) => controller.deleteItem(req, res))
  );

  // Pedidos multicanal con descuento de inventario
  router.post(
    '/operational/orders',
    asyncHandler((req, res) => controller.createOperationalOrder(req, res))
  );
  router.post(
    '/operational/orders/:id/cancel',
    asyncHandler((req, res) => controller.cancelOrder(req, res))
  );

  // Facturación con impuestos, descuentos, consecutivo y hash encadenado
  router.get(
    '/operational/invoices',
    asyncHandler((req, res) => controller.listInvoices(req, res))
  );
  router.post(
    '/operational/invoices',
    asyncHandler((req, res) => controller.createInvoice(req, res))
  );
  router.post(
    '/operational/invoices/:id/cancel',
    asyncHandler((req, res) => controller.cancelInvoice(req, res))
  );

  // Pagos con comprobante y hash encadenado
  router.get(
    '/operational/payments',
    asyncHandler((req, res) => controller.listPayments(req, res))
  );
  router.post(
    '/operational/payments',
    asyncHandler((req, res) => controller.processPayment(req, res))
  );

  // Calidad y Limpieza de Datos
  router.get(
    '/operational/quality/report',
    asyncHandler((req, res) => controller.getQualityReport(req, res))
  );
  router.post(
    '/operational/quality/clean',
    asyncHandler((req, res) => controller.runAutoClean(req, res))
  );
  router.post(
    '/operational/quality/seed-dirty',
    asyncHandler((req, res) => controller.seedDirtyData(req, res))
  );

  // Integridad Criptográfica y Hash Encadenado
  router.get(
    '/operational/integrity/verify',
    asyncHandler((req, res) => controller.verifyIntegrity(req, res))
  );
  router.post(
    '/operational/integrity/tamper-demo',
    asyncHandler((req, res) => controller.simulateTampering(req, res))
  );
  router.post(
    '/operational/integrity/restore',
    asyncHandler((req, res) => controller.restoreIntegrity(req, res))
  );

  // Algoritmos O(n), O(n²), O(n log n) y Benchmark Experimental
  router.get(
    '/operational/benchmarks',
    asyncHandler((req, res) => controller.runBenchmarks(req, res))
  );

  // Modelos de IA No LLM (Keras/TensorFlow + Simple Statistics)
  router.get(
    '/ai/status',
    asyncHandler((req, res) => controller.getAiStatus(req, res))
  );
  router.post(
    '/ai/train',
    asyncHandler((req, res) => controller.trainAiModels(req, res))
  );
  router.post(
    '/ai/classify',
    asyncHandler((req, res) => controller.classifyOperation(req, res))
  );
  router.get(
    '/ai/classify-recent',
    asyncHandler((req, res) => controller.classifyRecentOperations(req, res))
  );
  router.post(
    '/ai/predict-demand',
    asyncHandler((req, res) => controller.predictDemand(req, res))
  );
  router.get(
    '/ai/user-profiles',
    asyncHandler((req, res) => controller.getUserProfiles(req, res))
  );
  router.get(
    '/ai/patterns',
    asyncHandler((req, res) => controller.getOperationalPatterns(req, res))
  );

  return router;
}

module.exports = createOperationalRoutes;
