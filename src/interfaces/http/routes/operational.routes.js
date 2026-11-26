/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/routes/operational.routes.js
 * CAPA: Interfaces HTTP — Rutas de Módulos Operativos ERP, Calidad, Integridad,
 *       Benchmark Experimental e Inteligencia Artificial No LLM
 * ============================================================================
 * BUENAS PRÁCTICAS APLICADAS (DRY & CONSISTENCIA):
 *   1. Gracias a que `OperationalController` usa *arrow methods* enlazados,
 *      pasamos cada método directo a `asyncHandler(controller.metodo)` sin
 *      repetir 24 closures envolventes `(req, res) => controller.metodo(req, res)`.
 *   2. Reutilizamos `requirePositiveIntParam('id')` y `requireJsonBody` de
 *      `httpValidator.js` en todas las rutas con parámetros o carga útil JSON.
 * ============================================================================
 */

const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  requireJsonBody,
  requirePositiveIntParam,
} = require('../validators/httpValidator');

function createOperationalRoutes(controller) {
  const router = express.Router();
  const validateId = requirePositiveIntParam('id');

  // Resumen ejecutivo consolidado del sistema
  router.get('/operational/summary', asyncHandler(controller.getExecutiveSummary));

  // 1. CRUD de Usuarios con roles ('cliente' | 'empleado' | 'admin')
  router.get('/operational/users', asyncHandler(controller.listUsers));
  router.post('/operational/users', requireJsonBody, asyncHandler(controller.createUser));
  router.put(
    '/operational/users/:id',
    validateId,
    requireJsonBody,
    asyncHandler(controller.updateUser)
  );
  router.delete('/operational/users/:id', validateId, asyncHandler(controller.deleteUser));

  // 2. CRUD de Categorías con normalización automática
  router.get('/operational/categories', asyncHandler(controller.listCategories));
  router.post(
    '/operational/categories',
    requireJsonBody,
    asyncHandler(controller.createCategory)
  );
  router.put(
    '/operational/categories/:id',
    validateId,
    requireJsonBody,
    asyncHandler(controller.updateCategory)
  );
  router.delete(
    '/operational/categories/:id',
    validateId,
    asyncHandler(controller.deleteCategory)
  );

  // 3. CRUD de Ítems / Inventario con limpieza de precios y control de stock
  router.get('/operational/items', asyncHandler(controller.listItems));
  router.post('/operational/items', requireJsonBody, asyncHandler(controller.createItem));
  router.put(
    '/operational/items/:id',
    validateId,
    requireJsonBody,
    asyncHandler(controller.updateItem)
  );
  router.delete('/operational/items/:id', validateId, asyncHandler(controller.deleteItem));

  // 4. Pedidos multicanal: listado paginado, creación con descuento de stock, cambio de estado y anulación con reverso
  router.get('/operational/orders', asyncHandler(controller.listOperationalOrders));
  router.post(
    '/operational/orders',
    requireJsonBody,
    asyncHandler(controller.createOperationalOrder)
  );
  router.patch(
    '/operational/orders/:id/status',
    validateId,
    requireJsonBody,
    asyncHandler(controller.updateOperationalOrderStatus)
  );
  router.post(
    '/operational/orders/:id/cancel',
    validateId,
    asyncHandler(controller.cancelOrder)
  );

  // 5. Facturación consecutiva con impuestos, descuentos y hash encadenado
  router.get('/operational/invoices', asyncHandler(controller.listInvoices));
  router.post(
    '/operational/invoices',
    requireJsonBody,
    asyncHandler(controller.createInvoice)
  );
  router.post(
    '/operational/invoices/:id/cancel',
    validateId,
    asyncHandler(controller.cancelInvoice)
  );

  // 6. Pagos con verificación de comprobante y hash encadenado
  router.get('/operational/payments', asyncHandler(controller.listPayments));
  router.post(
    '/operational/payments',
    requireJsonBody,
    asyncHandler(controller.processPayment)
  );

  // 7. Calidad, normalización y limpieza automática de datos
  router.get('/operational/quality/report', asyncHandler(controller.getQualityReport));
  router.post('/operational/quality/clean', asyncHandler(controller.runAutoClean));
  router.post('/operational/quality/seed-dirty', asyncHandler(controller.seedDirtyData));

  // 8. Integridad criptográfica y simulador de alteración en cadena de hashes
  router.get('/operational/integrity/verify', asyncHandler(controller.verifyIntegrity));
  router.post('/operational/integrity/tamper-demo', asyncHandler(controller.simulateTampering));
  router.post('/operational/integrity/restore', asyncHandler(controller.restoreIntegrity));

  // 9. Algoritmos O(n), O(n²), O(n log n), O(log n) y Benchmark Experimental
  router.get('/operational/benchmarks', asyncHandler(controller.runBenchmarks));

  // 10. Modelos de IA No LLM (Keras/TensorFlow + Simple Statistics)
  router.get('/ai/status', asyncHandler(controller.getAiStatus));
  router.post('/ai/train', asyncHandler(controller.trainAiModels));
  router.post('/ai/classify', requireJsonBody, asyncHandler(controller.classifyOperation));
  router.get('/ai/classify-recent', asyncHandler(controller.classifyRecentOperations));
  router.post('/ai/predict-demand', asyncHandler(controller.predictDemand));
  router.get('/ai/user-profiles', asyncHandler(controller.getUserProfiles));
  router.get('/ai/patterns', asyncHandler(controller.getOperationalPatterns));

  return router;
}

module.exports = createOperationalRoutes;
