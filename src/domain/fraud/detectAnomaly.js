/**
 * @file detectAnomaly.js
 * @description Orquestador puro de detección de fraude transaccional combinando verificación HMAC-SHA256, franjas horarias y ventana deslizante.
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL).
 * (b) Responsabilidad única: Evaluar en memoria si una transacción es criptográficamente íntegra y determinar si la
 *     frecuencia acumulada del usuario dentro de la ventana temporal vigente alcanza o supera el umbral permitido para su franja horaria.
 * (c) Complejidad algorítmica Big-O:
 *     - Validación de hash (`validateTransactionHash`): $O(1)$ (payload de 5 campos fijos y comparación constante de 32 bytes).
 *     - Resolución de umbral horario (`getThresholdByTime`): $O(f)$ donde $f$ es la cantidad de franjas del día ($f = 3 \implies O(1)$).
 *     - Actualización de ventana deslizante (`slidingWindow.addTransaction`): $O(1)$ amortizado en llegadas ordenadas ($O(w)$ con $w$ acotado).
 *     - Complejidad global por transacción: $O(1)$ amortizado en tiempo y $O(1)$ en espacio auxiliar de retorno.
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - `TransactionService.receive()` y `TransactionService.simulate()` (`src/application/fraud/TransactionService.js`):
 *       se dispara síncronamente en memoria por cada transacción entrante (`POST /api/transactions`) o simulada
 *       (`POST /api/transactions/simulate`) antes de persistir el veredicto en base de datos.
 */

// Importa el verificador criptográfico de integridad HMAC-SHA256 (canónico + fallback legado)
const validateTransactionHash = require('./validateTransactionHash');
// Importa el selector de umbral y ventana temporal según la hora local del día
const getThresholdByTime = require('./getThresholdByTime');

/**
 * Analiza una transacción financiera verificando primero su autenticidad criptográfica y luego su frecuencia por ventana deslizante.
 *
 * Regla de disparo de anomalía por velocidad (Velocity Check):
 * $$\text{isAnomaly} \iff \text{count}\big(u, [t - W_f, t]\big) \ge U_f$$
 * Donde $W_f$ (`ventanaSegundos`) y $U_f$ (`umbral`) dependen de la franja horaria $f$ en la que cae el instante $t$.
 *
 * @param {object} transaction - Datos normalizados de la transacción (`idTxn`, `user`, `date`, `value`, `paymentMethod`, `hash`).
 * @param {import('./SlidingWindow')} slidingWindow - Instancia en memoria de ventana deslizante por usuario.
 * @param {Array<object>} [thresholds=getThresholdByTime.DEFAULT_THRESHOLDS] - Configuración activa de franjas y umbrales.
 * @param {string} secret - Llave secreta compartida `HMAC_SECRET` para verificar el hash.
 * @param {Date|string|null} [detectionDate=null] - Fecha opcional de sobrescritura para pruebas; si es `null`, usa `transaction.date`.
 * @param {string} [timeZone='America/Bogota'] - Zona horaria IANA usada para ubicar la hora del día.
 * @returns {object} Diagnóstico completo con validez del hash, bandera `isAnomaly`, conteo en ventana y clasificación.
 */
function detectAnomaly(
  transaction,
  slidingWindow,
  thresholds = getThresholdByTime.DEFAULT_THRESHOLDS,
  secret,
  detectionDate = null,
  timeZone = 'America/Bogota'
) {
  // Paso 1: Verifica la autenticidad e integridad de la firma HMAC-SHA256 antes de tocar el estado de la ventana deslizante
  const isHashValid = validateTransactionHash(transaction, secret);
  // Si el hash fue adulterado o no coincide, corta inmediatamente sin contaminar el conteo de frecuencia del usuario legítimo
  if (!isHashValid) {
    return {
      isHashValid: false,
      isAnomaly: false,
      reason: 'El hash no coincide con los datos recibidos',
    };
  }

  // Paso 2: Toma la fecha de evaluación priorizando `detectionDate` (si se inyectó) o la fecha intrínseca `transaction.date`
  const rawDate = detectionDate || transaction.date;
  // Asegura una instancia `Date` válida para cálculo de milisegundos en la ventana deslizante
  const transactionDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
  // Determina en qué franja horaria cae la transacción ('mañana', 'tarde-noche' o 'noche-madrugada') y extrae sus reglas
  const thresholdInfo = getThresholdByTime(rawDate, thresholds, timeZone);

  // Guarda defensiva por si se suministró una tabla de franjas incompleta que no cubra las 24 horas del día
  if (!thresholdInfo) {
    return { isHashValid, isAnomaly: false, reason: 'No se encontró franja horaria configurada' };
  }

  // Desestructura el límite máximo de transacciones (`umbral`), el ancho de ventana (`ventanaSegundos`) y el nombre de la `franja`
  const { umbral, ventanaSegundos, franja } = thresholdInfo;

  // Paso 3: Registra el evento en la ventana deslizante del usuario y obtiene cuántas transacciones acumula en los últimos `ventanaSegundos`
  const transactionCount = slidingWindow.addTransaction(
    transaction.user,
    transactionDate,
    ventanaSegundos
  );

  // Paso 4: Evalúa la condición de anomalía: si el conteo alcanza o rebasa el umbral de la franja, se marca como posible fraude
  const isAnomaly = transactionCount >= umbral;

  // Retorna el dictamen enriquecido para trazabilidad, auditoría y respuesta al servicio de aplicación
  return {
    isHashValid,
    isAnomaly,
    franja,
    umbral,
    ventanaSegundos,
    transactionCount,
    tipo: isAnomaly ? 'POSIBLE_FRAUDE' : 'NORMAL',
  };
}

// Exporta la función pura de detección de anomalías
module.exports = detectAnomaly;
