/**
 * @file connection.js
 * @description Adaptador centralizado de conexión y ejecución de consultas sobre PostgreSQL.
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Persistencia).
 * - (b) Responsabilidad única (SRP): Gestionar el ciclo de vida del pool de conexiones a PostgreSQL,
 *       medir la latencia de cada sentencia SQL ejecutada y registrar trazas de auditoría o alertas
 *       de consultas lentas sin contener lógica de negocio.
 * - (c) Quién lo dispara / invoca:
 *       1. `src/container.js` (lo inyecta como dependencia `db` en todos los `*Repository.js` y en `DataQualityService`).
 *       2. `src/server.js` (al iniciar para verificar migraciones y en `shutdown()` mediante `db.close()`).
 *       3. `src/infrastructure/database/migrations.js` (como cliente por defecto para DDL y semillas).
 * - (d) Buenas prácticas aplicadas:
 *       - Patrón Connection Pool (`pg.Pool`) para reutilizar conexiones TCP abiertas y evitar agotamiento de sockets.
 *       - Soporte nativo de consultas parametrizadas (`text`, `params` con `$1, $2...`) contra SQL Injection.
 *       - Observabilidad activa: detección automática de Slow Queries (>= 500 ms) y logging estructurado con contexto.
 *       - Apagado controlado (*Graceful Shutdown*) liberando ordenadamente todos los clientes activos.
 */

// Importa la clase Pool del driver oficial node-postgres ('pg') para administrar múltiples conexiones reutilizables
const { Pool } = require('pg');
// Importa la configuración tipada de entorno (host, puerto, usuario, contraseña, base de datos y límites del pool)
const config = require('../../config/env');
// Crea un logger hijo etiquetado con el módulo 'Database' para trazabilidad estructurada en Winston
const logger = require('../logging/logger').child('Database');

// Instancia única (Singleton por módulo) del pool de conexiones usando los parámetros definidos en config.db
const pool = new Pool(config.db);

// Define el umbral en milisegundos a partir del cual una sentencia SQL se clasifica y alerta como consulta lenta
const SLOW_QUERY_THRESHOLD_MS = 500;

// Suscribe un listener global al evento 'error' del pool para capturar desconexiones abruptas en clientes inactivos (idle)
// evitando que una caída de red tumbe el proceso principal de Node.js con una excepción no manejada
pool.on('error', (err) => {
  // Registra el fallo crítico en el log de errores incluyendo mensaje descriptivo y traza de pila (stack trace)
  logger.error('Error inesperado en cliente inactivo del pool de PostgreSQL', {
    // Mensaje legible del error emitido por PostgreSQL o la capa de red
    error: err.message,
    // Pila de llamadas para diagnóstico técnico
    stack: err.stack,
  });
});

/**
 * Ejecuta una consulta SQL parametrizada utilizando una conexión disponible del pool,
 * cronometrando su tiempo de respuesta y registrando métricas de observabilidad.
 *
 * @param {string} text - Sentencia SQL a ejecutar (con marcadores posicionales `$1, $2, ...` si recibe parámetros).
 * @param {Array<*>} [params] - Arreglo opcional de valores seguros que se enlazan a los marcadores posicionales.
 * @returns {Promise<import('pg').QueryResult>} Objeto resultado de `pg` con `rows`, `rowCount`, `fields` y `command`.
 * @throws {Error} Re-lanza cualquier excepción de base de datos tras registrarla en el logger.
 */
async function query(text, params) {
  // Captura la marca de tiempo inicial en milisegundos antes de enviar la consulta al motor PostgreSQL
  const start = Date.now();
  // Inicia bloque protegido para interceptar, cronometrar y auditar eventuales errores SQL
  try {
    // Toma prestado un cliente del pool, ejecuta la sentencia parametrizada y lo devuelve automáticamente al terminar
    const result = await pool.query(text, params);
    // Calcula la duración total de ejecución restando el instante inicial al tiempo actual
    const durationMs = Date.now() - start;
    // Compacta saltos de línea y espacios múltiples de la sentencia SQL para facilitar su lectura en una sola línea de log
    const summarySql = text.replace(/\s+/g, ' ').trim();

    // Evalúa si el tiempo de ejecución iguala o supera el umbral establecido para consultas lentas (500 ms)
    if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      // Emite una advertencia (WARN) para alertar cuellos de botella o falta de índices en la consulta ejecutada
      logger.warn('Consulta SQL lenta detectada', {
        // Sentencia SQL normalizada que tardó demasiado
        sql: summarySql,
        // Latencia medida en milisegundos
        durationMs,
        // Cantidad de filas afectadas o devueltas por PostgreSQL
        rows: result.rowCount,
      });
    } else {
      // En condiciones normales de rendimiento, registra la ejecución en nivel DEBUG sin saturar logs de producción
      logger.debug('Consulta SQL ejecutada', {
        // Sentencia SQL compactada
        sql: summarySql,
        // Tiempo empleado en milisegundos
        durationMs,
        // Número de registros procesados
        rows: result.rowCount,
      });
    }

    // Retorna el objeto QueryResult íntegro al repositorio o servicio invocador
    return result;
  } catch (err) {
    // Calcula cuántos milisegundos transcurrieron hasta el momento exacto en que falló la consulta
    const durationMs = Date.now() - start;
    // Registra el error detallado incluyendo el código SQLSTATE de PostgreSQL (ej. '23505' para violación UNIQUE)
    logger.error('Error al ejecutar consulta SQL', {
      // Sentencia SQL compactada que originó el fallo (sin exponer los valores crudos de params por seguridad)
      sql: text.replace(/\s+/g, ' ').trim(),
      // Duración hasta el fallo en milisegundos
      durationMs,
      // Código estándar de error de PostgreSQL útil para mapeo de errores de dominio
      code: err.code,
      // Descripción técnica del error reportado por el motor o driver
      error: err.message,
    });
    // Propaga la excepción hacia las capas superiores (repositorios/servicios/middleware de errores)
    throw err;
  }
}

/**
 * Cierra de forma ordenada todas las conexiones abiertas en el pool de PostgreSQL,
 * esperando a que finalicen las consultas activas antes de liberar los sockets.
 *
 * @returns {Promise<void>} Promesa que se resuelve cuando el pool se ha drenado y cerrado por completo.
 */
async function close() {
  // Deja constancia informativa en los logs antes de drenar el pool durante el apagado del servidor
  logger.info('Cerrando pool de conexiones de PostgreSQL');
  // Invoca el cierre asíncrono oficial del pool de node-postgres
  await pool.end();
}

// Exporta la interfaz pública del módulo de conexión para inyección de dependencias y control de ciclo de vida
module.exports = {
  // Instancia cruda del pool (útil cuando se requiere adquirir un cliente dedicado para transacciones manuales)
  pool,
  // Función envoltorio recomendada para ejecutar consultas parametrizadas con telemetría y logging
  query,
  // Alias funcional de cierre directo del pool conservado por compatibilidad con pruebas e integraciones
  end: () => pool.end(),
  // Función asíncrona de apagado controlado con registro en bitácora
  close,
};
