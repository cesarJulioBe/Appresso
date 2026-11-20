const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'HMAC_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  throw new Error(`Variables de entorno obligatorias faltantes: ${missing.join(', ')}`);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  db: Object.freeze({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: Number(process.env.DB_POOL_MAX) || 20,
  }),
  hmacSecret: process.env.HMAC_SECRET,
  timezone: process.env.APP_TIMEZONE || 'America/Bogota',
  log: Object.freeze({
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || path.resolve(__dirname, '../../logs'),
    retentionDays: process.env.LOG_RETENTION || '14d',
  }),
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

module.exports = Object.freeze(config);
