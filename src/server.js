/**
 * ============================================================================
 * ARCHIVO: src/server.js
 * CAPA: Punto de Entrada del Proceso Node.js (Bootstrap & Ciclo de Vida)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   1. Ejecutar la verificación idempotente del esquema PostgreSQL y semilla
 *      inicial (`seedInitialOperationalData`).
 *   2. Abrir el socket HTTP de Express en el puerto configurado (`app.listen`).
 *   3. Gestionar el apagado controlado (*Graceful Shutdown*) ante señales del
 *      sistema operativo (`SIGINT`, `SIGTERM`) cerrando primero el servidor HTTP
 *      y luego liberando el pool de conexiones de PostgreSQL.
 *
 * CUÁNDO SE DISPARA:
 *   Al ejecutar `npm start` (`node src/server.js`) o `npm run dev`
 *   (`node --watch src/server.js`).
 *
 * POR QUÉ ESTÁ SEPARADO DE `src/app.js`:
 *   Separar `server.js` (red/puerto) de `app.js` (configuración Express) permite
 *   que las pruebas de integración monten instancias efímeras en puertos
 *   aleatorios (`listen(0)`) sin colisionar con el puerto 3000.
 * ============================================================================
 */

// Configuración validada e inmutable del proyecto
const config = require('./config/env');
// Logger estructurado etiquetado con el contexto del módulo 'Server'
const logger = require('./infrastructure/logging/logger').child('Server');
// Adaptador del Pool de PostgreSQL para poder cerrarlo limpiamente al apagar el proceso
const db = require('./infrastructure/database/connection');
// Función idempotente que crea tablas/columnas faltantes y datos base si la BD está vacía
const { seedInitialOperationalData } = require('./infrastructure/database/migrations');
// Instancia Express ya ensamblada con middlewares, rutas y contenedor de dependencias
const app = require('./app');

// Verificamos esquema y datos semilla en segundo plano al iniciar el proceso
seedInitialOperationalData(db, config.hmacSecret)
  .then(() => {
    logger.info('Esquema de base de datos y datos operativos iniciales verificados');
  })
  .catch((err) => {
    logger.error('Error al verificar migraciones iniciales', { error: err.message });
  });

// Ponemos el servidor HTTP a escuchar conexiones entrantes en el puerto configurado
const server = app.listen(config.port, () => {
  logger.info(`Servidor corriendo en http://localhost:${config.port}`, {
    port: config.port,
    env: config.env,
  });
});

/**
 * Función de apagado limpio (Graceful Shutdown):
 * Deja de aceptar nuevas peticiones HTTP, espera a que terminen las activas
 * y libera las conexiones del pool de PostgreSQL antes de terminar el proceso.
 */
async function shutdown(signal) {
  logger.info(`Señal ${signal} recibida. Iniciando apagado controlado...`);
  server.close(async () => {
    try {
      // Cerramos todas las conexiones abiertas hacia PostgreSQL
      await db.close();
      logger.info('Servidor y conexiones de base de datos cerrados correctamente');
      process.exit(0);
    } catch (err) {
      logger.error('Error durante el cierre de recursos', { error: err.message });
      process.exit(1);
    }
  });
}

// Escuchamos Ctrl+C en terminal (SIGINT) y detención de contenedores/procesos (SIGTERM)
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Captura global de promesas rechazadas sin catch para registrar trazabilidad sin perder visibilidad
process.on('unhandledRejection', (reason) => {
  logger.error('Promesa rechazada no manejada (unhandledRejection)', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Captura global de excepciones síncronas fatales para registrar el error antes de salir con código 1
process.on('uncaughtException', (err) => {
  logger.error('Excepción no capturada (uncaughtException)', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

module.exports = server;
