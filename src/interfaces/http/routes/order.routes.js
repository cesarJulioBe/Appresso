const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  validateCreateOrder,
  validateUpdateOrderStatus,
} = require('../validators/order.validator');

function createOrderRoutes(orderController) {
  const router = express.Router();

  router.post('/orders/undo', asyncHandler(orderController.undo));
  router.get('/orders/search/:id', asyncHandler(orderController.searchComparingAlgorithms));
  router.patch(
    '/orders/:id/status',
    validateUpdateOrderStatus,
    asyncHandler(orderController.updateStatus)
  );
  router.post('/orders', validateCreateOrder, asyncHandler(orderController.create));
  router.get('/orders', asyncHandler(orderController.list));
  router.get('/orders/:id', asyncHandler(orderController.getById));

  return router;
}

module.exports = createOrderRoutes;
