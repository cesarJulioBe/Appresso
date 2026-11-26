/**
 * ============================================================================
 * ARCHIVO: src/interfaces/http/routes/index.js
 * CAPA: Interfaces HTTP — Enrutador Raíz Unificado
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Ensamblar los sub-enrutadores activos de la plataforma en un único
 *   `express.Router()` montado en `src/app.js`:
 *     1. `delivery.routes.js`    -> Planificación de rutas y grafo Dijkstra.
 *     2. `fraud.routes.js`       -> Recepción y monitoreo de transacciones HMAC.
 *     3. `operational.routes.js` -> Módulos Operativos ERP, Calidad, Integridad,
 *                                   Benchmark Experimental e Inteligencia Artificial.
 * ============================================================================
 */

const express = require('express');
const createDeliveryRoutes = require('./delivery.routes');
const createFraudRoutes = require('./fraud.routes');
const createOperationalRoutes = require('./operational.routes');

function createRoutes(controllers) {
  const router = express.Router();

  if (controllers.deliveryController) {
    router.use(createDeliveryRoutes(controllers.deliveryController));
  }
  router.use(createFraudRoutes(controllers.fraudController));
  if (controllers.operationalController) {
    router.use(createOperationalRoutes(controllers.operationalController));
  }

  return router;
}

module.exports = createRoutes;
