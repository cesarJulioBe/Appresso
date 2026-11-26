/**
 * ============================================================================
 * ARCHIVO: src/config/env.js
 * CAPA: Configuración Transversal (Arranque del Sistema)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Leer, validar tempranamente (patrón Fail-Fast) y congelar (`Object.freeze`)
 *   todas las variables de entorno provenientes del archivo `.env` o del sistema
 *   operativo en un único objeto inmutable de configuración.
 *
 * CUÁNDO SE DISPARA:
 *   Es el primer módulo cargado cuando arranca Node.js (`src/server.js`,
 *   `src/container.js` y `src/infrastructure/database/connection.js`).
 *
 * BUENAS PRÁCTICAS APLICADAS:
 *   1. Centralización: Ningún servicio o controlador dispersa lecturas crudas
 *      de `process.env` por todo el proyecto.
 *   2. Fail-Fast: Si falta una credencial crítica (`DB_HOST`, `HMAC_SECRET`, etc.)
 *      en producción/desarrollo, aborta en el milisegundo 0 con un mensaje claro.
 *   3. Inmutabilidad (`Object.freeze`): Evita mutaciones accidentales en tiempo
 *      de ejecución sobre puertos, pool de BD o llaves criptográficas.
 * ============================================================================
 */

// Módulo nativo de Node.js para construir rutas absolutas multiplataforma (macOS/Linux/Windows)
const path = require('path');
// Librería dotenv para inyectar las claves del archivo `.env` dentro de `process.env`
const dotenv = require('dotenv');

// Cargamos explícitamente el archivo `.env` ubicado dos niveles arriba (`<raíz>/Appresso/.env`)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Lista de variables mínimas indispensables para conectar PostgreSQL y firmar hashes HMAC-SHA256
const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'HMAC_SECRET'];
// Filtramos cuáles de esas variables requeridas están vacías o indefinidas en el entorno actual
const missing = required.filter((key) => !process.env[key]);

// En entornos distintos a pruebas unitarias (`NODE_ENV !== 'test'`), detenemos el arranque si falta alguna
if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  throw new Error(`Variables de entorno obligatorias faltantes: ${missing.join(', ')}`);
}

// Construimos el diccionario estructurado de configuración con valores por defecto seguros
const config = {
  // Entorno de ejecución ('development' | 'test' | 'production')
  env: process.env.NODE_ENV || 'development',
  // Puerto TCP donde escuchará Express (3000 por defecto)
  port: Number(process.env.PORT) || 3000,
  // Parámetros inmutables del Pool de conexiones de PostgreSQL (`pg.Pool`)
  db: Object.freeze({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Número máximo de conexiones simultáneas mantenidas abiertas en el pool
    max: Number(process.env.DB_POOL_MAX) || 20,
  }),
  // Llave secreta simétrica usada para calcular y verificar firmas HMAC-SHA256
  hmacSecret: process.env.HMAC_SECRET,
  // Zona horaria oficial del negocio para evaluar franjas horarias de fraude
  timezone: process.env.APP_TIMEZONE || 'America/Bogota',
  // Configuración de rotación y nivel de bitácoras estructuradas (Winston)
  log: Object.freeze({
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || path.resolve(__dirname, '../../logs'),
    retentionDays: process.env.LOG_RETENTION || '14d',
  }),
  // Origen permitido para peticiones Cross-Origin desde el frontend React (Vite)
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

// Exportamos el objeto congelado para impedir modificaciones posteriores en memoria
module.exports = Object.freeze(config);
