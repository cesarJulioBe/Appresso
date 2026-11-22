const express = require('express');
const createOrderRoutes = require('./order.routes');
const createQueueRoutes = require('./queue.routes');
const createDeliveryRoutes = require('./delivery.routes');
const createAnalyticsRoutes = require('./analytics.routes');
const createFraudRoutes = require('./fraud.routes');
const createOperationalRoutes = require('./operational.routes');

function createRoutes(controllers) {
  const router = express.Router();

  router.use(createQueueRoutes(controllers.queueController));
  router.use(createOrderRoutes(controllers.orderController));
  router.use(createDeliveryRoutes(controllers.deliveryController));
  router.use(createAnalyticsRoutes(controllers.analyticsController));
  router.use(createFraudRoutes(controllers.fraudController));
  if (controllers.operationalController) {
    router.use(createOperationalRoutes(controllers.operationalController));
  }

  return router;
}

module.exports = createRoutes;
