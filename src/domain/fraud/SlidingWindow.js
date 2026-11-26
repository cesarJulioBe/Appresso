/**
 * @file SlidingWindow.js
 * @description Estructura de datos de Ventana Deslizante Temporal por usuario para detección de ráfagas de fraude.
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL).
 * (b) Responsabilidad única: Mantener en memoria, indexado por correo de usuario (`Map`), el subconjunto ordenado de
 *     marcas de tiempo (ms) de transacciones recientes dentro del intervalo activo $[t_{\max} - W, t_{\max}]$,
 *     descartando eventos expirados y retornando la cardinalidad exacta de la ventana.
 * (c) Complejidad algorítmica Big-O:
 *     - Búsqueda del historial del usuario en `this.windowsByUser`: $O(1)$ promedio mediante tabla Hash (`Map`).
 *     - Inserción cuando las transacciones llegan en orden cronológico (`timestampMs >= último`): $O(1)$ amortizado (`push`).
 *     - Inserción fuera de orden (lotes concurrentes desordenados) y purga de expirados (`splice`): $O(w)$ donde $w$ es el
 *       número de eventos activos dentro de la ventana corta de pocos segundos ($w$ pequeño y acotado $\implies O(1)$ práctico).
 *     - Espacio en memoria: $O(U \cdot w)$, donde $U$ es la cantidad de usuarios activos y $w$ los timestamps retenidos por usuario.
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - Instanciada como estado compartido en memoria en `src/container.js` e inyectada en `TransactionService`
 *       (`src/application/fraud/TransactionService.js`), disparándose a través de `detectAnomaly` cada vez que se recibe
 *       una transacción real (`TransactionService.receive` -> `POST /api/transactions`) o simulada
 *       (`TransactionService.simulate` -> `POST /api/transactions/simulate`).
 */

// Estructura en memoria que aísla una ventana deslizante cronológica independiente por cada usuario
class SlidingWindow {
  /**
   * Inicializa el diccionario Hash que asocia cada usuario con su cola ordenada de timestamps en milisegundos.
   */
  constructor() {
    // Mapa en memoria: clave `userEmail` (string) -> valor `number[]` ordenado ascendentemente de timestamps (epoch ms)
    this.windowsByUser = new Map();
  }

  /**
   * Registra la marca de tiempo de una nueva transacción, purga las transacciones cuya antigüedad supere
   * `windowSeconds` respecto al evento más reciente de la ventana y devuelve el conteo vigente.
   *
   * Condición matemática de pertenencia a la ventana activa:
   * $$t_i \in [t_{\text{latest}} - \text{windowSeconds} \times 1000,\; t_{\text{latest}}]$$
   * Toda marca con $t_i < t_{\text{latest}} - W_{\text{ms}}$ se considera expirada y es desalojada desde el frente.
   *
   * @param {string} userEmail - Correo electrónico identificador del titular de la transacción.
   * @param {Date|string|number} transactionDate - Instante en que ocurrió la transacción.
   * @param {number} windowSeconds - Amplitud temporal de la ventana deslizante en segundos (ej. 3s).
   * @returns {number} Cantidad total de transacciones del usuario dentro de la ventana activa tras insertar y purgar.
   */
  addTransaction(userEmail, transactionDate, windowSeconds) {
    // Normaliza la fecha recibida a milisegundos desde Unix Epoch (evita recrear Date si ya es instancia de Date)
    const timestampMs =
      transactionDate instanceof Date
        ? transactionDate.getTime()
        : new Date(transactionDate).getTime();

    // Busca en O(1) el arreglo cronológico del usuario; si es su primera transacción, crea y registra un arreglo vacío
    let userWindow = this.windowsByUser.get(userEmail);
    if (!userWindow) {
      userWindow = [];
      this.windowsByUser.set(userEmail, userWindow);
    }

    // Camino rápido O(1): si la ventana está vacía o la transacción es igual/posterior a la más reciente, inserta al final
    if (userWindow.length === 0 || timestampMs >= userWindow[userWindow.length - 1]) {
      userWindow.push(timestampMs);
    } else {
      // Camino de inserción ordenada O(w) tipo Insertion Sort cuando llegan eventos ligeramente desordenados en ráfagas paralelas
      let idx = userWindow.length - 1;
      // Retrocede desde el final mientras los elementos almacenados sean estrictamente posteriores al nuevo timestamp
      while (idx >= 0 && userWindow[idx] > timestampMs) {
        idx--;
      }
      // Inserta `timestampMs` exactamente en su posición cronológica `idx + 1` preservando el invariante de orden ascendente
      userWindow.splice(idx + 1, 0, timestampMs);
    }

    // Como el arreglo está garantizado en orden ascendente, el último elemento es siempre el instante más reciente (t_latest)
    const latestTimestampMs = userWindow[userWindow.length - 1];
    // Calcula la frontera inferior de vigencia restando la amplitud de la ventana convertida a milisegundos
    const windowStartMs = latestTimestampMs - windowSeconds * 1000;

    // Cuenta cuántos elementos al inicio del arreglo quedaron por fuera de la frontera inferior (< windowStartMs)
    let expiredCount = 0;
    while (expiredCount < userWindow.length && userWindow[expiredCount] < windowStartMs) {
      expiredCount++;
    }
    // Elimina en un solo bloque contiguo todos los timestamps expirados desde el índice 0
    if (expiredCount > 0) {
      userWindow.splice(0, expiredCount);
    }

    // Retorna el número exacto de transacciones vigentes dentro de la ventana deslizante actual
    return userWindow.length;
  }
}

// Exporta la clase SlidingWindow para detección de anomalías de frecuencia en tiempo real
module.exports = SlidingWindow;
