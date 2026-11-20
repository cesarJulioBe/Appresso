const { Pool } = require('pg');
const config = require('../../config/env');
const logger = require('../logging/logger').child('Database');

const pool = new Pool(config.db);

const SLOW_QUERY_THRESHOLD_MS = 500;

pool.on('error', (err) => {
  logger.error('Error inesperado en cliente inactivo del pool de PostgreSQL', {
    error: err.message,
    stack: err.stack,
  });
});

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const durationMs = Date.now() - start;
    const summarySql = text.replace(/\s+/g, ' ').trim();

    if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      logger.warn('Consulta SQL lenta detectada', {
        sql: summarySql,
        durationMs,
        rows: result.rowCount,
      });
    } else {
      logger.debug('Consulta SQL ejecutada', {
        sql: summarySql,
        durationMs,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error('Error al ejecutar consulta SQL', {
      sql: text.replace(/\s+/g, ' ').trim(),
      durationMs,
      code: err.code,
      error: err.message,
    });
    throw err;
  }
}

async function close() {
  logger.info('Cerrando pool de conexiones de PostgreSQL');
  await pool.end();
}

module.exports = {
  pool,
  query,
  end: () => pool.end(),
  close,
};