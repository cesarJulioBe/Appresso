const config = require('./config/env');
const logger = require('./infrastructure/logging/logger').child('Server');
const db = require('./infrastructure/database/connection');
const app = require('./app');

const server = app.listen(config.port, () => {
  logger.info(`Servidor corriendo en http://localhost:${config.port}`, {
    port: config.port,
    env: config.env,
  });
});

async function shutdown(signal) {
  logger.info(`Señal ${signal} recibida. Iniciando apagado controlado...`);
  server.close(async () => {
    try {
      await db.close();
      logger.info('Servidor y conexiones de base de datos cerrados correctamente');
      process.exit(0);
    } catch (err) {
      logger.error('Error durante el cierre de recursos', { error: err.message });
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Promesa rechazada no manejada (unhandledRejection)', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Excepción no capturada (uncaughtException)', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

module.exports = server;
