/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/routes/delivery.routes.js
 * CAPA: Interfaces HTTP — Rutas del Planificador de Entregas (Grafo Dijkstra)
 * ============================================================================
 * DISEÑO SIN REDUNDANCIA:
 *   Valida únicamente el transporte HTTP (`requireJsonBody` y
 *   `requirePositiveIntParam('id')`), mientras las reglas de negocio viven una
 *   sola vez en `RouteService`.
 * ============================================================================
 */

const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  requireJsonBody,
  requirePositiveIntParam,
} = require('../validators/httpValidator');

function createDeliveryRoutes(deliveryController) {
  const router = express.Router();

  router.get('/delivery/cities', asyncHandler(deliveryController.listCities));
  router.get('/delivery/route', asyncHandler(deliveryController.calculateRoute));
  router.post(
    '/delivery/routes',
    requireJsonBody,
    asyncHandler(deliveryController.createRoute)
  );
  router.get('/delivery/routes', asyncHandler(deliveryController.listRoutes));
  router.delete(
    '/delivery/routes/:id',
    requirePositiveIntParam('id'),
    asyncHandler(deliveryController.deleteRoute)
  );

  return router;
}

module.exports = createDeliveryRoutes;
