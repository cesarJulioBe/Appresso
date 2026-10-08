const validateTransactionHash = require('./validateTransactionHash');
const getThresholdByTime = require('./getThresholdByTime');

function detectAnomaly(transaction, slidingWindow, thresholds, secret, detectionDate = new Date()) {
  const isHashValid = validateTransactionHash(transaction, secret);
  if (!isHashValid) {
    return {
      isHashValid: false,
      isAnomaly: false,
      reason: 'El hash no coincide con los datos recibidos',
    };
  }

  const transactionDate = new Date(detectionDate);
  const thresholdInfo = getThresholdByTime(transactionDate, thresholds);

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