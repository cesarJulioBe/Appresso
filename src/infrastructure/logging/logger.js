/**
 * @file logger.js
 * @description Sistema centralizado de logging estructurado con Winston, rotación diaria, trazabilidad por `requestId` y redacción automática de datos sensibles (PII/Secretos).
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Observabilidad y Logging Transversal).
 * - (b) Responsabilidad única (SRP): Configurar y exponer el logger institucional de la aplicación con formatos
 *       diferenciados por entorno (consola legible en desarrollo vs. JSON estructurado en producción/archivos),
 *       inyectando el identificador de correlación HTTP y ofuscando credenciales o correos electrónicos.
 * - (c) Quién lo dispara / invoca:
 *       - `src/container.js` (crea loggers hijos por módulo `logger.child('<NombreServicio>')` para todos los `*Service.js`).
 *       - `src/server.js` (eventos de arranque, apagado controlado y errores fatales de proceso).
 *       - `src/infrastructure/database/connection.js` (telemetría de consultas SQL y slow queries).
 *       - Middlewares HTTP (`httpLogger.js`, `errorHandler.js`).
 * - (d) Buenas prácticas aplicadas:
 *       - Sanitización/Redacción recursiva de secretos (`password`, `secret`, `hmacSecret`, `hash`) y enmascaramiento de PII (`email`, `user`) en cumplimiento de privacidad por diseño.
 *       - Correlación distribuida automática leyendo `requestId` desde `AsyncLocalStorage` (`requestContext`).
 *       - Rotación diaria automática de archivos (`winston-daily-rotate-file`) separando bitácora general (`app-*.log`) y errores (`error-*.log`) con política de retención.
 *       - Silenciamiento automático (`silent: true`) en entorno `test` para mantener limpia la salida de pruebas automatizadas.
 */

// Importa la librería principal de logging estructurado Winston
const winston = require('winston');
// Registra el transporte extendido `winston.transports.DailyRotateFile` para rotación diaria de archivos de log
require('winston-daily-rotate-file');
// Importa la configuración global de entorno (nivel de log, directorio de salida, días de retención y NODE_ENV)
const config = require('../../config/env');
// Importa el lector del almacén asíncrono por petición para extraer el `requestId` activo sin pasarlo por argumentos
const { getContext } = require('./requestContext');

// Conjunto inmutable O(1) con los nombres exactos de propiedades cuyos valores contienen secretos o firmas sensibles
const SENSITIVE_KEYS = new Set(['password', 'secret', 'hmacSecret', 'hash']);

/**
 * Enmascara parcialmente una dirección de correo electrónico para proteger información personal identificable (PII)
 * en los archivos de bitácora sin perder la capacidad de depurar el dominio o las iniciales del usuario.
 *
 * Ejemplo: `'laura.gomez@appresso.co'` -> `'la***@appresso.co'`.
 *
 * @param {*} email - Valor a evaluar y enmascarar si corresponde a un correo electrónico.
 * @returns {*} Cadena con la parte local ofuscada o el valor original intacto si no es un email válido.
 */
function maskEmail(email) {
  // Si el dato no es texto o no contiene arroba, lo devuelve sin modificaciones
  if (typeof email !== 'string' || !email.includes('@')) return email;
  // Separa el buzón local (antes de '@') y el dominio (después de '@')
  const [local, domain] = email.split('@');
  // Para nombres cortos (1 o 2 caracteres), conserva solo la primera letra (o '*') seguida de '***'
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  // Para nombres más largos, conserva únicamente los primeros 2 caracteres visibles antes de '***'
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Sanitiza recursivamente un par clave-valor redactando secretos criptográficos/contraseñas,
 * enmascarando correos electrónicos y recorriendo arreglos u objetos anidados.
 *
 * @param {string} key - Nombre de la propiedad inspeccionada.
 * @param {*} value - Valor asociado a dicha propiedad.
 * @returns {*} Valor seguro (redactado, enmascarado o clonado recursivamente) apto para ser escrito en logs.
 */
function sanitizeValue(key, value) {
  // Respeta valores nulos o indefinidos retornándolos directamente
  if (value === null || value === undefined) return value;
  // Verifica si el nombre de la clave pertenece al conjunto de secretos sensibles
  if (SENSITIVE_KEYS.has(key)) {
    // Si es un string largo (> 8 caracteres, ej. un hash), muestra prefijo parcial de 6 caracteres + '[REDACTED]' para trazabilidad segura
    if (typeof value === 'string' && value.length > 8) {
      return `${value.slice(0, 6)}...[REDACTED]`;
    }
    // Para secretos cortos o de otro tipo, oculta el contenido por completo
    return '[REDACTED]';
  }
  // Si la clave identifica un usuario o correo y el valor luce como email, aplica enmascaramiento de PII
  if ((key === 'user' || key === 'email') && typeof value === 'string' && value.includes('@')) {
    return maskEmail(value);
  }
  // Si el valor es un arreglo, sanitiza recursivamente cada uno de sus elementos
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }
  // Si es un objeto plano (excluyendo instancias nativas Error y Date), sanitiza todas sus propiedades internas
  if (typeof value === 'object' && !(value instanceof Error) && !(value instanceof Date)) {
    return sanitizeObject(value);
  }
  // Retorna valores primitivos inocuos (números, booleanos, textos normales) tal cual
  return value;
}

/**
 * Crea una copia superficial y profunda sanitizada de cualquier objeto de metadatos sin mutar el objeto original
 * de la aplicación, evitando efectos colaterales sobre DTOs o entidades en memoria.
 *
 * @param {*} obj - Objeto candidato a sanitizar antes de serializar en el log.
 * @returns {*} Clon seguro con PII y credenciales redactadas, o el valor original si no es un objeto plano.
 */
function sanitizeObject(obj) {
  // Descarta primitivos, nulos e instancias especiales (Error y Date) devolviéndolos intactos
  if (!obj || typeof obj !== 'object' || obj instanceof Error || obj instanceof Date) {
    return obj;
  }
  // Inicializa un nuevo contenedor limpio para no alterar las referencias del llamador
  const clone = {};
  // Recorre todas las entradas enumerables propias del objeto aplicando reglas de sanitización por clave
  for (const [k, v] of Object.entries(obj)) {
    clone[k] = sanitizeValue(k, v);
  }
  // Devuelve el objeto completamente saneado
  return clone;
}

// Formato personalizado de Winston que inyecta automáticamente el `requestId` del contexto asíncrono actual
const injectRequestContext = winston.format((info) => {
  // Consulta el almacén AsyncLocalStorage asociado al hilo asíncrono en curso
  const ctx = getContext();
  // Si hay un requestId activo en la petición HTTP y el log aún no lo trae explícito, lo adjunta
  if (ctx.requestId && !info.requestId) {
    info.requestId = ctx.requestId;
  }
  // Entrega el objeto de información enriquecido al siguiente eslabón de formato de Winston
  return info;
});

// Formato personalizado de Winston que barre y redacta cualquier campo sensible presente en los metadatos del log
const redactSensitive = winston.format((info) => {
  // Recorre todas las claves enumerables adjuntas a la entrada de log
  for (const key of Object.keys(info)) {
    // Omite metadatos estructurales propios de Winston que nunca contienen PII cruda de propiedades clave
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'service' || key === 'module') {
      continue;
    }
    // Reemplaza el valor por su versión sanitizada (clonada/enmascarada/redactada)
    info[key] = sanitizeValue(key, info[key]);
  }
  // Devuelve la entrada de log segura lista para serializarse
  return info;
});

// Pipeline de formato JSON estructurado pensado para indexadores de logs y archivos persistentes en producción
const jsonFormat = winston.format.combine(
  // 1. Adjunta requestId de correlación
  injectRequestContext(),
  // 2. Enmascara PII y redacta secretos
  redactSensitive(),
  // 3. Añade timestamp ISO-8601 estándar
  winston.format.timestamp(),
  // 4. Extrae e incluye la propiedad 'stack' cuando se registran objetos Error
  winston.format.errors({ stack: true }),
  // 5. Serializa toda la entrada como una línea JSON válida (NDJSON)
  winston.format.json()
);

// Pipeline de formato legible y coloreado optimizado para la terminal local durante desarrollo
const devConsoleFormat = winston.format.combine(
  // 1. Adjunta requestId de correlación
  injectRequestContext(),
  // 2. Protege datos sensibles incluso en la consola local
  redactSensitive(),
  // 3. Aplica códigos ANSI de color según severidad (info, warn, error, debug)
  winston.format.colorize(),
  // 4. Formatea la hora de manera compacta (HH:mm:ss)
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  // 5. Captura stack traces completos en errores
  winston.format.errors({ stack: true }),
  // 6. Construye la plantilla final de texto combinando hora, nivel, prefijo corto de requestId, módulo, mensaje y metadatos
  winston.format.printf(({ timestamp, level, message, module: mod, requestId, service: _service, ...meta }) => {
    // Muestra los primeros 8 caracteres del UUID de petición entre corchetes para lectura ágil
    const reqTag = requestId ? `[${String(requestId).slice(0, 8)}] ` : '';
    // Muestra el nombre del módulo o servicio emisor entre corchetes (ej. '[OrderService] ')
    const modTag = mod ? `[${mod}] ` : '';
    // Filtra claves no simbólicas remanentes en el objeto de metadatos adicionales
    const metaKeys = Object.keys(meta).filter((k) => typeof k !== 'symbol');
    // Serializa los metadatos extra en línea únicamente si existen propiedades adicionales
    const metaStr = metaKeys.length > 0 ? ` ${JSON.stringify(meta)}` : '';
    // Retorna la línea formateada lista para imprimir en stdout/stderr
    return `${timestamp} ${level} ${reqTag}${modTag}${message}${metaStr}`;
  })
);

// Inicializa la lista de destinos (transports) con salida por consola adaptada según el entorno actual
const transports = [
  new winston.transports.Console({
    // Silencia la salida en consola durante la ejecución de tests automatizados para evitar ruido
    silent: config.env === 'test',
    // Usa JSON estructurado en producción y formato coloreado humano en desarrollo
    format: config.env === 'production' ? jsonFormat : devConsoleFormat,
  }),
];

// Fuera del entorno de pruebas, habilita persistencia en disco con rotación diaria automática
if (config.env !== 'test') {
  transports.push(
    // Transporte 1: Archivo rotativo diario con todos los eventos desde el nivel configurado (ej. info/debug)
    new winston.transports.DailyRotateFile({
      // Carpeta donde se almacenan las bitácoras (ej. 'logs/')
      dirname: config.log.dir,
      // Patrón de nombre para el archivo general diario
      filename: 'app-%DATE%.log',
      // Periodicidad de rotación diaria por fecha calendario
      datePattern: 'YYYY-MM-DD',
      // Política de retención máxima antes de purgar archivos antiguos (ej. '14d')
      maxFiles: config.log.retentionDays,
      // Siempre almacena en formato JSON estructurado para auditoría y parseo automatizado
      format: jsonFormat,
    }),
    // Transporte 2: Archivo rotativo dedicado exclusivamente a fallos críticos (nivel 'error')
    new winston.transports.DailyRotateFile({
      // Mismo directorio centralizado de logs
      dirname: config.log.dir,
      // Nombre diferenciado para rápida inspección de incidentes
      filename: 'error-%DATE%.log',
      // Rotación diaria
      datePattern: 'YYYY-MM-DD',
      // Filtra estrictamente entradas de severidad 'error'
      level: 'error',
      // Conserva los archivos según la política de retención configurada
      maxFiles: config.log.retentionDays,
      // Formato JSON estructurado con stack traces y requestId
      format: jsonFormat,
    })
  );
}

// Crea la instancia raíz de Winston con nivel global, etiqueta fija del microservicio y transportes configurados
const logger = winston.createLogger({
  // Nivel mínimo de severidad que será procesado (ej. 'info' o 'debug')
  level: config.log.level,
  // Metadato constante incluido en cada evento para identificar este servicio en agregadores de logs
  defaultMeta: { service: 'appresso-api' },
  // Lista de canales de salida registrados
  transports,
});

// Guarda una referencia enlazada al método nativo `logger.child` antes de extender su firma ergonómica
const baseChild = logger.child.bind(logger);

/**
 * Crea un sub-logger contextualizado permitiendo pasar directamente el nombre del módulo como cadena
 * (ej. `logger.child('OrderService')`) o un objeto arbitrario de metadatos fijos.
 *
 * @param {string|object} moduleOrMeta - Nombre del módulo emisor o diccionario de metadatos por defecto.
 * @returns {import('winston').Logger} Instancia hija de Winston que hereda transportes y adjunta el módulo automáticamente.
 */
function createModuleLogger(moduleOrMeta) {
  // Si recibe un string, lo envuelve de forma estándar bajo la propiedad `{ module: ... }`
  if (typeof moduleOrMeta === 'string') {
    return baseChild({ module: moduleOrMeta });
  }
  // Si recibe un objeto (o valor vacío), delega directamente al método child original con respaldo `{}`
  return baseChild(moduleOrMeta || {});
}

// Sobrescribe `logger.child` con la fábrica ergonómica compatible tanto con strings como con objetos
logger.child = createModuleLogger;
// Expone la función pura `sanitizeObject` para pruebas unitarias y utilidades que requieran limpiar payloads manualmente
logger.sanitizeObject = sanitizeObject;

// Exporta la instancia singleton configurada del logger institucional
module.exports = logger;
