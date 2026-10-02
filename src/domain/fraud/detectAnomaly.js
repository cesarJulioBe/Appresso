const validateTransactionHash = require('./validateTransactionHash');
const getThresholdByTime = require('./getThresholdByTime');

function detectAnomaly(transaction, slidingWindow, thresholds, secret) {
  const isHashValid = validateTransactionHash(transaction, secret);

  const transactionDate = new Date(transaction.date);
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