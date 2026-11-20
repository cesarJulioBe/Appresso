class SlidingWindow {
  constructor() {
    // Mapa en memoria: email del usuario -> arreglo ordenado de timestamps (ms) de sus transacciones recientes
    this.windowsByUser = new Map();
  }

  addTransaction(userEmail, transactionDate, windowSeconds) {
    const timestampMs =
      transactionDate instanceof Date
        ? transactionDate.getTime()
        : new Date(transactionDate).getTime();

    let userWindow = this.windowsByUser.get(userEmail);
    if (!userWindow) {
      userWindow = [];
      this.windowsByUser.set(userEmail, userWindow);
    }

    // Inserción manteniendo orden cronológico (O(1) cuando llegan en orden, soporta desorden en lotes masivos)
    if (userWindow.length === 0 || timestampMs >= userWindow[userWindow.length - 1]) {
      userWindow.push(timestampMs);
    } else {
      let idx = userWindow.length - 1;
      while (idx >= 0 && userWindow[idx] > timestampMs) {
        idx--;
      }
      userWindow.splice(idx + 1, 0, timestampMs);
    }

    const latestTimestampMs = userWindow[userWindow.length - 1];
    const windowStartMs = latestTimestampMs - windowSeconds * 1000;

    // Purga rápida desde el frente sin recrear todo el arreglo si hay elementos expirados
    let expiredCount = 0;
    while (expiredCount < userWindow.length && userWindow[expiredCount] < windowStartMs) {
      expiredCount++;
    }
    if (expiredCount > 0) {
      userWindow.splice(0, expiredCount);
    }

    return userWindow.length;
  }
}

module.exports = SlidingWindow;