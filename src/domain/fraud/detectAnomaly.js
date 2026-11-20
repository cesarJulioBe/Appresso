const validateTransactionHash = require('./validateTransactionHash');
const getThresholdByTime = require('./getThresholdByTime');

function detectAnomaly(
  transaction,
  slidingWindow,
  thresholds = getThresholdByTime.DEFAULT_THRESHOLDS,
  secret,
  detectionDate = null,
  timeZone = 'America/Bogota'
) {
  const isHashValid = validateTransactionHash(transaction, secret);
  if (!isHashValid) {
    return {
      isHashValid: false,
      isAnomaly: false,
      reason: 'El hash no coincide con los datos recibidos',
    };
  }

  // Extrae la fecha directamente de los datos de la transacción en memoria
  const rawDate = detectionDate || transaction.date;
  const transactionDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
  const thresholdInfo = getThresholdByTime(rawDate, thresholds, timeZone);

  if (!thresholdInfo) {
    return { isHashValid, isAnomaly: false, reason: 'No se encontró franja horaria configurada' };
  }

  const { umbral, ventanaSegundos, franja } = thresholdInfo;

  const transactionCount = slidingWindow.addTransaction(
    transaction.user,
    transactionDate,
    ventanaSegundos
  );

  const isAnomaly = transactionCount >= umbral;

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

module.exports = detectAnomaly;