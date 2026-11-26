/**
 * @file getThresholdByTime.js
 * @description Resolución dinámica de umbrales y ventanas antifraude según la franja horaria del día (incluyendo cruce de medianoche).
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL).
 * (b) Responsabilidad única: Traducir cualquier fecha/hora de entrada a segundos transcurridos del día $[0, 86399]$
 *     en la zona horaria operativa y localizar la franja horaria correspondiente con su umbral y ventana en segundos.
 * (c) Complejidad algorítmica Big-O:
 *     - `getFormatter(timeZone)`: $O(1)$ amortizado gracias al caché `Map` en memoria (`formatterCache`) que evita
 *       reinstanciar `Intl.DateTimeFormat` en cada transacción.
 *     - `timeToSeconds`, `isWithinRange`, `extractSecondsOfDay`: $O(1)$ en tiempo y espacio (cadenas de longitud fija).
 *     - `getThresholdByTime`: $O(f)$ donde $f$ es el número de franjas horarias configuradas ($f = 3$ por defecto $\implies O(1)$).
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - `ThresholdService` (`src/application/fraud/ThresholdService.js`): clona `DEFAULT_THRESHOLDS` al iniciar el estado
 *       en memoria de umbrales horarios.
 *     - `TransactionService.receive()` y `TransactionService.simulate()` (`src/application/fraud/TransactionService.js`):
 *       a través de `detectAnomaly`, invoca `getThresholdByTime` en cada transacción procesada (`POST /api/transactions`,
 *       `POST /api/transactions/simulate`).
 */

// Duración base de la ventana deslizante en segundos (configurable por entorno o 3 segundos por defecto)
const DEFAULT_WINDOW_SECONDS = Number(process.env.FRAUD_WINDOW_SECONDS) || 3;

// Tabla inmutable de franjas horarias por defecto que cubre las 24 horas completas del día (00:00:00 a 23:59:59)
const DEFAULT_THRESHOLDS = Object.freeze([
  // Franja diurna de alta actividad comercial: tolera hasta 10 transacciones por ventana
  Object.freeze({
    franja: 'mañana',
    hora_inicio: '05:00:01',
    hora_fin: '12:00:00',
    umbral_transacciones: Number(process.env.THRESHOLD_MANANA) || 10,
    ventana_segundos: Number(process.env.WINDOW_SECONDS_MANANA) || DEFAULT_WINDOW_SECONDS,
  }),
  // Franja vespertina/nocturna moderada: tolera hasta 6 transacciones por ventana
  Object.freeze({
    franja: 'tarde-noche',
    hora_inicio: '12:00:01',
    hora_fin: '20:00:00',
    umbral_transacciones: Number(process.env.THRESHOLD_TARDE_NOCHE) || 6,
    ventana_segundos: Number(process.env.WINDOW_SECONDS_TARDE_NOCHE) || DEFAULT_WINDOW_SECONDS,
  }),
  // Franja crítica nocturna/madrugada (cruza las 00:00): mayor rigor antifraude, tolera máximo 3 transacciones por ventana
  Object.freeze({
    franja: 'noche-madrugada',
    hora_inicio: '20:00:01',
    hora_fin: '05:00:00',
    umbral_transacciones: Number(process.env.THRESHOLD_NOCHE_MADRUGADA) || 3,
    ventana_segundos: Number(process.env.WINDOW_SECONDS_NOCHE_MADRUGADA) || DEFAULT_WINDOW_SECONDS,
  }),
]);

// Caché Hash O(1) de instancias `Intl.DateTimeFormat` indexado por nombre de zona horaria (ej. 'America/Bogota')
// Evita el alto costo de inicialización de tablas ICU de internacionalización en ráfagas de miles de transacciones/segundo
const formatterCache = new Map();

/**
 * Obtiene o crea un formateador `Intl.DateTimeFormat` de 24 horas para `timeZone` en $O(1)$ amortizado.
 *
 * @param {string} timeZone - Identificador IANA de zona horaria.
 * @returns {Intl.DateTimeFormat} Formateador cacheado en memoria.
 */
function getFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Convierte una cadena horaria `"HH:MM:SS"` al total de segundos transcurridos desde medianoche ($0 \dots 86399$) en $O(1)$.
 *
 * Fórmula: $S = H \times 3600 + M \times 60 + s$.
 *
 * @param {string} timeStr - Hora en formato `"HH:MM:SS"` o `"HH:MM"`.
 * @returns {number} Segundos absolutos del día.
 */
function timeToSeconds(timeStr) {
  const parts = String(timeStr).split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Evalúa si el segundo actual del día pertenece al intervalo cerrado $[startSeconds, endSeconds]$ en $O(1)$,
 * manejando correctamente intervalos que cruzan la medianoche (`startSeconds > endSeconds`).
 *
 * @param {number} currentSeconds - Segundo del día de la transacción evaluada.
 * @param {number} startSeconds - Segundo de inicio de la franja.
 * @param {number} endSeconds - Segundo de cierre de la franja.
 * @returns {boolean} `true` si la hora pertenece a la franja; `false` en caso contrario.
 */
function isWithinRange(currentSeconds, startSeconds, endSeconds) {
  if (startSeconds <= endSeconds) {
    // Intervalo continuo dentro del mismo día calendario (ej. 05:00:01 [18001s] a 12:00:00 [43200s]): exige AND lógico
    return currentSeconds >= startSeconds && currentSeconds <= endSeconds;
  }
  // Intervalo envolvente que cruza las 24:00/00:00 (ej. 20:00:01 [72001s] a 05:00:00 [18000s]): exige OR lógico
  return currentSeconds >= startSeconds || currentSeconds <= endSeconds;
}

/**
 * Extrae los segundos del día ($0 \dots 86399$) de una fecha de entrada en $O(1)$:
 * - Si es un string ISO local sin sufijo de zona (`Z` ni `±HH:MM`), lee `HH:MM:SS` directamente por expresión regular sin conversión UTC.
 * - Si es un `Date` o un string ISO con zona explícita, proyecta la hora local exacta en `timeZone` usando `Intl.DateTimeFormat`.
 *
 * @param {Date|string|number} dateInput - Fecha/hora de la transacción.
 * @param {string} [timeZone='America/Bogota'] - Zona horaria objetivo.
 * @returns {number} Segundos transcurridos desde las 00:00:00 de ese día.
 */
function extractSecondsOfDay(dateInput, timeZone = 'America/Bogota') {
  if (typeof dateInput === 'string') {
    // Verifica si el string ISO trae indicador explícito de huso horario al final ('Z', '+00:00', '-05:00', etc.)
    const hasExplicitZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(dateInput);
    if (!hasExplicitZone) {
      // Extrae HH, MM y SS directamente de la porción 'THH:MM:SS' respetando la hora nominal local de la transacción
      const match = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dateInput);
      if (match) {
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3] || 0);
        return hours * 3600 + minutes * 60 + seconds;
      }
    }
  }

  // Convierte a objeto Date y descompone en partes horarias ajustadas a la zona `timeZone`
  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = getFormatter(timeZone).formatToParts(dateObj);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  // Recorre las partes emitidas por Intl; aplica `% 24` porque algunos motores retornan '24' a medianoche en `en-US`
  for (const part of parts) {
    if (part.type === 'hour') {
      hours = Number(part.value) % 24;
    } else if (part.type === 'minute') {
      minutes = Number(part.value);
    } else if (part.type === 'second') {
      seconds = Number(part.value);
    }
  }

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Determina la política de umbral antifraude aplicable al instante `dateInput` recorriendo las franjas activas ($O(f) \approx O(1)$).
 *
 * @param {Date|string|number} dateInput - Fecha y hora de la transacción.
 * @param {Array<object>} [thresholds=DEFAULT_THRESHOLDS] - Lista de franjas configuradas.
 * @param {string} [timeZone='America/Bogota'] - Zona horaria operativa.
 * @returns {{franja: string, umbral: number, ventanaSegundos: number}|null} Configuración de la franja coincidente o `null`.
 */
function getThresholdByTime(dateInput, thresholds = DEFAULT_THRESHOLDS, timeZone = 'America/Bogota') {
  // Si el arreglo de franjas proporcionado está vacío o no es válido, recurre de forma segura a `DEFAULT_THRESHOLDS`
  const activeThresholds =
    Array.isArray(thresholds) && thresholds.length > 0 ? thresholds : DEFAULT_THRESHOLDS;

  // Convierte el instante evaluado a segundos del día en O(1)
  const currentSeconds = extractSecondsOfDay(dateInput, timeZone);

  // Busca la primera franja cuyo rango horario contenga a `currentSeconds`
  for (const row of activeThresholds) {
    const startSeconds = timeToSeconds(row.hora_inicio);
    const endSeconds = timeToSeconds(row.hora_fin);

    if (isWithinRange(currentSeconds, startSeconds, endSeconds)) {
      return {
        franja: row.franja,
        umbral: row.umbral_transacciones,
        ventanaSegundos: row.ventana_segundos,
      };
    }
  }

  // Retorna `null` únicamente si ninguna franja personalizada cubrió el segundo evaluado
  return null;
}

// Adjunta la tabla inmutable de umbrales por defecto como propiedad estática de la función exportada
getThresholdByTime.DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS;

// Exporta el selector horario de umbrales antifraude
module.exports = getThresholdByTime;
