class SlidingWindow {
  constructor() {
    // Mapa: email del usuario -> arreglo de fechas (Date) de sus transacciones recientes
    this.windowsByUser = new Map();
  }

  addTransaction(userEmail, transactionDate, windowSeconds) {
    if (!this.windowsByUser.has(userEmail)) {
      this.windowsByUser.set(userEmail, []);
    }

    const userWindow = this.windowsByUser.get(userEmail);
    userWindow.push(transactionDate);

    const windowStart = new Date(transactionDate.getTime() - windowSeconds * 1000);

    // Eliminamos las transacciones que ya quedaron fuera de la ventana
    const stillInWindow = userWindow.filter(date => date >= windowStart);
    this.windowsByUser.set(userEmail, stillInWindow);

    return stillInWindow.length;
  }
}

module.exports = SlidingWindow;