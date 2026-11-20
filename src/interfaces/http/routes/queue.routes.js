const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');

function createQueueRoutes(queueController) {
  const router = express.Router();

  router.get('/queue/pending', asyncHandler(queueController.getPending));
  router.post('/queue/next', asyncHandler(queueController.attendNext));

  return router;
}

module.exports = createQueueRoutes;
