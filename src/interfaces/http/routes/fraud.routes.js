const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  validateSimulateTransaction,
  validateUpdateThreshold,
} = require('../validators/fraud.validator');

function createFraudRoutes(fraudController) {
  const router = express.Router();

  const receiveHandler = asyncHandler(fraudController.receiveTransaction);
  router.post('/transactions', receiveHandler);
  router.post('/api/transactions', receiveHandler);
  router.post('/fraud/transactions', receiveHandler);

  router.get('/fraud/stats', asyncHandler(fraudController.getStats));
  router.get('/fraud/dashboard', asyncHandler(fraudController.getDashboard));
  router.get('/fraud/anomalies', asyncHandler(fraudController.listAnomalies));
  router.get('/fraud/transactions', asyncHandler(fraudController.listTransactions));
  router.post(
    '/fraud/simulate',
    validateSimulateTransaction,
    asyncHandler(fraudController.simulateTransaction)
  );
  router.get('/fraud/thresholds', asyncHandler(fraudController.listThresholds));
  router.put(
    '/fraud/thresholds/:franja',
    validateUpdateThreshold,
    asyncHandler(fraudController.updateThreshold)
  );

  return router;
}

module.exports = createFraudRoutes;
