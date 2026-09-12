function linearRegression(salesHistory) {
const n = salesHistory.length;

  // Los "días" son 1, 2, 3... n (posición en el historial)
  const x = salesHistory.map((_, index) => index + 1);
  const y = salesHistory;

  // Sumatorias necesarias para la fórmula
  const sumX = x.reduce((acc, value) => acc + value, 0);
  const sumY = y.reduce((acc, value) => acc + value, 0);
  const sumXY = x.reduce((acc, value, i) => acc + value * y[i], 0);
  const sumX2 = x.reduce((acc, value) => acc + value * value, 0);

  // Fórmula de la pendiente (m) y el intercepto (b)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Función que predice ventas para un día futuro específico
  function predict(daysFromLastRecord) {
    const futureX = n + daysFromLastRecord;
    return slope * futureX + intercept;
  }

  return { slope, intercept, predict };
}

module.exports = linearRegression;