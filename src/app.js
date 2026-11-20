const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const { buildContainer } = require('./container');
const requestContextMiddleware = require('./interfaces/http/middlewares/requestContext');
const httpLoggerMiddleware = require('./interfaces/http/middlewares/httpLogger');
const notFoundMiddleware = require('./interfaces/http/middlewares/notFound');
const errorHandlerMiddleware = require('./interfaces/http/middlewares/errorHandler');
const createRoutes = require('./interfaces/http/routes');

function createApp(container = buildContainer()) {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use(httpLoggerMiddleware);

  app.use(createRoutes(container.controllers));

  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  app.container = container;
  return app;
}

const defaultApp = createApp();
defaultApp.createApp = createApp;

module.exports = defaultApp;
