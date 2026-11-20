const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  validateCalculateRoute,
  validateCreateRoute,
} = require('../validators/delivery.validator');

function createDeliveryRoutes(deliveryController) {
  const router = express.Router();

  router.get('/delivery/cities', asyncHandler(deliveryController.listCities));
  router.get(
    '/delivery/route',
    validateCalculateRoute,
    asyncHandler(deliveryController.calculateRoute)
  );
  router.post(
    '/delivery/routes',
    validateCreateRoute,
    asyncHandler(deliveryController.createRoute)
  );
  router.get('/delivery/routes', asyncHandler(deliveryController.listRoutes));
  router.delete('/delivery/routes/:id', asyncHandler(deliveryController.deleteRoute));

  return router;
}

module.exports = createDeliveryRoutes;
