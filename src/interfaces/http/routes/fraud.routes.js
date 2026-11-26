/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/routes/fraud.routes.js
 * CAPA: Interfaces HTTP — Rutas de Recepción Transaccional y Detección Antifraude
 * ============================================================================
 * DISEÑO Y ALIAS DE COMPATIBILIDAD:
 *   1. Expone múltiples alias de ingesta (`/`, `/transactions`, `/api/transactions`,
 *      `/transacciones`, etc.) apuntando al mismo `receiveHandler` reutilizable
 *      para compatibilidad con scripts de carga masiva (300/700 transacciones).
 *   2. Valida formato de transporte (`requireJsonBody`, `requireTextParam('franja')`)
 *      sin duplicar las validaciones de dominio (`validateTransaction`, umbrales).
 * ============================================================================
 */

const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  requireJsonBody,
  requireTextParam,
} = require('../validators/httpValidator');

function createFraudRoutes(fraudController) {
  const router = express.Router();

  // Handler compartido para todos los alias de recepción de transacciones firmadas con HMAC
  const receiveHandler = asyncHandler(fraudController.receiveTransaction);
  router.post('/', requireJsonBody, receiveHandler);
  router.post('/transactions', requireJsonBody, receiveHandler);
  router.post('/transaction', requireJsonBody, receiveHandler);
  router.post('/api/transactions', requireJsonBody, receiveHandler);
  router.post('/api/transaction', requireJsonBody, receiveHandler);
  router.post('/fraud/transactions', requireJsonBody, receiveHandler);
  router.post('/transacciones', requireJsonBody, receiveHandler);
  router.post('/api/transacciones', requireJsonBody, receiveHandler);

  // Consultas de métricas, dashboard, anomalías e historial transaccional
  router.get('/fraud/stats', asyncHandler(fraudController.getStats));
  router.get('/fraud/dashboard', asyncHandler(fraudController.getDashboard));
  router.get('/fraud/anomalies', asyncHandler(fraudController.listAnomalies));
  router.get('/fraud/transactions', asyncHandler(fraudController.listTransactions));

  // Simulador interactivo de transacciones firmadas desde el panel web
  router.post(
    '/fraud/simulate',
    requireJsonBody,
    asyncHandler(fraudController.simulateTransaction)
  );

  // Consulta y actualización en caliente de umbrales horarios (RAM + PostgreSQL)
  router.get('/fraud/thresholds', asyncHandler(fraudController.listThresholds));
  router.put(
    '/fraud/thresholds/:franja',
    requireTextParam('franja'),
    requireJsonBody,
    asyncHandler(fraudController.updateThreshold)
  );

  return router;
}

module.exports = createFraudRoutes;
