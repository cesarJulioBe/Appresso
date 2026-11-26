/**
 * ============================================================================
 * ARCHIVO: src/app.js
 * CAPA: Interfaces HTTP — Ensamblaje del Pipeline Express
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Construir y configurar la aplicación Express conectando en orden estricto
 *   la cadena de middlewares transversales, el enrutador REST principal y los
 *   manejadores finales de rutas inexistentes (404) y errores globales.
 *
 * ORDEN EXACTO DE EJECUCIÓN DE CADA PETICIÓN HTTP:
 *   1. `cors(...)`               -> Autoriza peticiones desde el frontend React.
 *   2. `express.json()`          -> Parsea el stream HTTP a objeto JS en `req.body`.
 *   3. `requestContextMiddleware`-> Genera o propaga `X-Request-Id` vía AsyncLocalStorage.
 *   4. `httpLoggerMiddleware`    -> Mide duración en ms y registra estado al finalizar.
 *   5. `createRoutes(...)`       -> Dirige la petición al validador HTTP -> Controlador.
 *   6. `notFoundMiddleware`      -> Si ninguna ruta coincidió, crea un `NotFoundError` (404).
 *   7. `errorHandlerMiddleware`  -> Único punto que traduce errores a respuestas HTTP JSON.
 *
 * INYECCIÓN DE DEPENDENCIAS:
 *   Exporta tanto la instancia por defecto (`defaultApp`) como la fábrica
 *   `createApp(container)` para poder inyectar contenedores con dobles de prueba
 *   o secretos aislados en los tests de integración.
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const { buildContainer } = require('./container');
const requestContextMiddleware = require('./interfaces/http/middlewares/requestContext');
const httpLoggerMiddleware = require('./interfaces/http/middlewares/httpLogger');
const notFoundMiddleware = require('./interfaces/http/middlewares/notFound');
const errorHandlerMiddleware = require('./interfaces/http/middlewares/errorHandler');
const createRoutes = require('./interfaces/http/routes');

/**
 * Fábrica que construye una instancia Express desacoplada a partir de un contenedor DI.
 *
 * @param {object} container Contenedor con repositorios, servicios y controladores ya cableados.
 * @returns {import('express').Express} Aplicación Express lista para recibir tráfico.
 */
function createApp(container = buildContainer()) {
  // Inicializamos la aplicación Express 5
  const app = express();

  // 1. Habilita cabeceras CORS para permitir consumo desde el cliente web (localhost:5173)
  app.use(cors({ origin: config.corsOrigin }));
  // 2. Deserializa automáticamente cuerpos con Content-Type: application/json hacia `req.body`
  app.use(express.json());
  // 3. Asigna un identificador único de correlación (`requestId`) a todo el ciclo asíncrono
  app.use(requestContextMiddleware);
  // 4. Registra método, ruta, código HTTP y tiempo de respuesta al completarse la petición
  app.use(httpLoggerMiddleware);

  // 5. Monta todos los módulos de rutas REST inyectándoles los controladores del contenedor
  app.use(createRoutes(container.controllers));

  // 6. Si la URL no coincidió con ninguna ruta anterior, dispara un error operacional 404
  app.use(notFoundMiddleware);
  // 7. Middleware final de 4 parámetros `(err, req, res, next)` que formatea todos los errores
  app.use(errorHandlerMiddleware);

  // Exponemos referencia al contenedor para inspección controlada en pruebas de integración
  app.container = container;
  return app;
}

// Construimos la aplicación principal con las dependencias reales por defecto
const defaultApp = createApp();
// Adjuntamos la fábrica para que los tests puedan invocar `createApp(customContainer)`
defaultApp.createApp = createApp;

module.exports = defaultApp;
