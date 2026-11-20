const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { validatePredictSales } = require('../validators/analytics.validator');

function createAnalyticsRoutes(analyticsController) {
  const router = express.Router();

  router.get('/statistics', asyncHandler(analyticsController.getStatistics));
  router.get('/loyalty/progression', asyncHandler(analyticsController.getLoyaltyProgression));
  router.post(
    '/sales/predict',
    validatePredictSales,
    asyncHandler(analyticsController.predictSales)
  );

  return router;
}

module.exports = createAnalyticsRoutes;
