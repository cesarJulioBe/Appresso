const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('../../config/env');
const { getContext } = require('./requestContext');

const SENSITIVE_KEYS = new Set(['password', 'secret', 'hmacSecret', 'hash']);

function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function sanitizeValue(key, value) {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEYS.has(key)) {
    if (typeof value === 'string' && value.length > 8) {
      return `${value.slice(0, 6)}...[REDACTED]`;
    }
    return '[REDACTED]';
  }
  if ((key === 'user' || key === 'email') && typeof value === 'string' && value.includes('@')) {
    return maskEmail(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }
  if (typeof value === 'object' && !(value instanceof Error) && !(value instanceof Date)) {
    return sanitizeObject(value);
  }
  return value;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object' || obj instanceof Error || obj instanceof Date) {
    return obj;
  }
  const clone = {};
  for (const [k, v] of Object.entries(obj)) {
    clone[k] = sanitizeValue(k, v);
  }
  return clone;
}

const injectRequestContext = winston.format((info) => {
  const ctx = getContext();
  if (ctx.requestId && !info.requestId) {
    info.requestId = ctx.requestId;
  }
  return info;
});

const redactSensitive = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'service' || key === 'module') {
      continue;
    }
    info[key] = sanitizeValue(key, info[key]);
  }
  return info;
});

const jsonFormat = winston.format.combine(
  injectRequestContext(),
  redactSensitive(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const devConsoleFormat = winston.format.combine(
  injectRequestContext(),
  redactSensitive(),
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, module: mod, requestId, service: _service, ...meta }) => {
    const reqTag = requestId ? `[${String(requestId).slice(0, 8)}] ` : '';
    const modTag = mod ? `[${mod}] ` : '';
    const metaKeys = Object.keys(meta).filter((k) => typeof k !== 'symbol');
    const metaStr = metaKeys.length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${reqTag}${modTag}${message}${metaStr}`;
  })
);

const transports = [
  new winston.transports.Console({
    silent: config.env === 'test',
    format: config.env === 'production' ? jsonFormat : devConsoleFormat,
  }),
];

if (config.env !== 'test') {
  transports.push(
    new winston.transports.DailyRotateFile({
      dirname: config.log.dir,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: config.log.retentionDays,
      format: jsonFormat,
    }),
    new winston.transports.DailyRotateFile({
      dirname: config.log.dir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: config.log.retentionDays,
      format: jsonFormat,
    })
  );
}

const logger = winston.createLogger({
  level: config.log.level,
  defaultMeta: { service: 'appresso-api' },
  transports,
});

const baseChild = logger.child.bind(logger);

function createModuleLogger(moduleOrMeta) {
  if (typeof moduleOrMeta === 'string') {
    return baseChild({ module: moduleOrMeta });
  }
  return baseChild(moduleOrMeta || {});
}

logger.child = createModuleLogger;
logger.sanitizeObject = sanitizeObject;

module.exports = logger;
