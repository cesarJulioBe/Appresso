const DEFAULT_WINDOW_SECONDS = Number(process.env.FRAUD_WINDOW_SECONDS) || 3;

const DEFAULT_THRESHOLDS = Object.freeze([
  Object.freeze({
    franja: 'mañana',
    hora_inicio: '05:00:01',
    hora_fin: '12:00:00',
    umbral_transacciones: Number(process.env.THRESHOLD_MANANA) || 10,
    ventana_segundos: Number(process.env.WINDOW_SECONDS_MANANA) || DEFAULT_WINDOW_SECONDS,
  }),
  Object.freeze({
    franja: 'tarde-noche',
    hora_inicio: '12:00:01',
    hora_fin: '20:00:00',
    umbral_transacciones: Number(process.env.THRESHOLD_TARDE_NOCHE) || 6,
    ventana_segundos: Number(process.env.WINDOW_SECONDS_TARDE_NOCHE) || DEFAULT_WINDOW_SECONDS,
  }),
  Object.freeze({
    franja: 'noche-madrugada',
    hora_inicio: '20:00:01',
    hora_fin: '05:00:00',
    umbral_transacciones: Number(process.env.THRESHOLD_NOCHE_MADRUGADA) || 3,
    ventana_segundos: Number(process.env.WINDOW_SECONDS_NOCHE_MADRUGADA) || DEFAULT_WINDOW_SECONDS,
  }),
]);

// Cache de instancias Intl.DateTimeFormat por zona horaria para evitar recrearlas en cada transacción
const formatterCache = new Map();

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

function timeToSeconds(timeStr) {
  const parts = String(timeStr).split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function isWithinRange(currentSeconds, startSeconds, endSeconds) {
  if (startSeconds <= endSeconds) {
    // Rango normal, ej: 05:00:01 a 12:00:00
    return currentSeconds >= startSeconds && currentSeconds <= endSeconds;
  }
  // Rango que cruza la medianoche, ej: 20:00:01 a 05:00:00 (del día siguiente)
  return currentSeconds >= startSeconds || currentSeconds <= endSeconds;
}

/**
 * Extrae los segundos del día (0..86399) directamente de la fecha de la transacción en memoria:
 * - Si viene como cadena ISO sin zona horaria (ej. "2026-09-23T10:30:01.120"), extrae HH:MM:SS directo del string en O(1).
 * - Si viene como Date o cadena ISO con zona horaria ("Z" o "±HH:MM"), usa el formateador cacheado en memoria.
 */
function extractSecondsOfDay(dateInput, timeZone = 'America/Bogota') {
  if (typeof dateInput === 'string') {
    const hasExplicitZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(dateInput);
    if (!hasExplicitZone) {
      const match = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dateInput);
      if (match) {
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3] || 0);
        return hours * 3600 + minutes * 60 + seconds;
      }
    }
  }

  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = getFormatter(timeZone).formatToParts(dateObj);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

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

function getThresholdByTime(dateInput, thresholds = DEFAULT_THRESHOLDS, timeZone = 'America/Bogota') {
  const activeThresholds =
    Array.isArray(thresholds) && thresholds.length > 0 ? thresholds : DEFAULT_THRESHOLDS;

  const currentSeconds = extractSecondsOfDay(dateInput, timeZone);

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

  return null;
}

getThresholdByTime.DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS;

module.exports = getThresholdByTime;