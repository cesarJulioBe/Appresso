/**
 * ============================================================================
 * ARCHIVO: src/domain/delivery/DeliveryGraph.js
 * CAPA: Dominio Puro — Estructura de Datos de Grafo Ponderado y Dijkstra
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Representar el mapa de ciudades conectadas mediante una Lista de Adyacencia
 *   (`this.adjacencyList`) y calcular la ruta más corta en kilómetros entre un
 *   origen (`start`) y un destino (`end`) utilizando el Algoritmo de Dijkstra.
 *
 * COMPLEJIDAD ALGORÍTMICA BIG-O:
 *   - `addCity(city)` y `addEdge(from, to, weight)`: O(1) en tiempo.
 *   - `dijkstra(start, end)`: O((V + E) log V) con ordenamiento de cola de prioridad
 *     (donde V = número de ciudades y E = número de tramos/carreteras).
 *
 * QUIÉN LO INVOCA Y CUÁNDO SE DISPARA:
 *   `RouteService.calculateRoute` (`src/application/delivery/RouteService.js`)
 *   cuando el usuario presiona "Calcular ruta" en `RoutePlanner.jsx` (`GET /delivery/route`).
 * ============================================================================
 */

class DeliveryGraph {
  constructor() {
    // Diccionario en memoria donde cada clave es el nombre de una ciudad
    // y su valor es un arreglo de vecinos: [{ node: 'CiudadVecina', weight: km }]
    this.adjacencyList = {};
  }

  // Registra un nodo (ciudad) en la lista de adyacencia si aún no existe
  addCity(city) {
    if (!this.adjacencyList[city]) {
      this.adjacencyList[city] = [];
    }
  }

  // Agrega una arista bidireccional (ida y vuelta) con el mismo peso en kilómetros
  addRoute(cityA, cityB, distanceKm) {
    this.addCity(cityA);
    this.addCity(cityB);
    this.adjacencyList[cityA].push({ node: cityB, weight: distanceKm });
    this.adjacencyList[cityB].push({ node: cityA, weight: distanceKm });
  }

  // Agrega una arista dirigida desde `from` hacia `to` (usado al hidratar filas desde PostgreSQL)
  addEdge(from, to, weight) {
    this.addCity(from);
    this.addCity(to);
    this.adjacencyList[from].push({ node: to, weight });
  }

  /**
   * Ejecuta el Algoritmo de Dijkstra para hallar el camino de menor distancia acumulada.
   *
   * @param {string} start Ciudad de partida.
   * @param {string} end Ciudad de destino.
   * @returns {{ path: string[], distanceKm: number|null }} Camino óptimo y total de km.
   */
  dijkstra(start, end) {
    // `distances`: guarda la mejor distancia mínima conocida desde `start` hasta cada ciudad
    const distances = {};
    // `previous`: guarda desde qué ciudad previa llegamos por el camino más corto (para reconstruir la ruta)
    const previous = {};
    // `visited`: conjunto O(1) de ciudades cuyo camino óptimo definitivo ya fue procesado
    const visited = new Set();
    // `queue`: cola de prioridad de candidatos pendientes por explorar
    const queue = [];

    // Inicializamos todas las ciudades con distancia Infinita (aún inalcanzables)
    for (const city of Object.keys(this.adjacencyList)) {
      distances[city] = Infinity;
      previous[city] = null;
    }

    // Si la ciudad inicial o final ni siquiera existe en el grafo, no hay ruta posible
    if (distances[start] === undefined || distances[end] === undefined) {
      return { path: [], distanceKm: null };
    }

    // La distancia desde el origen hacia sí mismo es 0 km
    distances[start] = 0;
    queue.push({ node: start, distance: 0 });

    // Mientras queden ciudades alcanzables en la cola de prioridad
    while (queue.length > 0) {
      // Ordenamos ascendentemente para extraer siempre la ciudad con menor distancia acumulada
      queue.sort((a, b) => a.distance - b.distance);
      const { node: current } = queue.shift();

      // Si ya habíamos cerrado esta ciudad antes, la saltamos
      if (visited.has(current)) continue;
      visited.add(current);

      // Optimización temprana: si llegamos al destino final, su distancia mínima ya es definitiva
      if (current === end) break;

      // Relajación de aristas: revisamos cada carretera vecina que sale de `current`
      for (const neighbor of this.adjacencyList[current] || []) {
        if (visited.has(neighbor.node)) continue;

        // Calculamos cuánto costaría llegar al vecino pasando por `current`
        const newDistance = distances[current] + neighbor.weight;

        // Si encontramos un atajo mejor que el registrado antes, actualizamos `distances` y `previous`
        if (newDistance < distances[neighbor.node]) {
          distances[neighbor.node] = newDistance;
          previous[neighbor.node] = current;
          queue.push({ node: neighbor.node, distance: newDistance });
        }
      }
    }

    // Si la distancia al destino sigue siendo Infinita, significa que las ciudades están desconectadas
    if (distances[end] === Infinity) return { path: [], distanceKm: null };

    // Reconstruimos el camino óptimo caminando hacia atrás desde `end` hasta `start` usando `previous`
    const path = [];
    let step = end;
    while (step) {
      path.unshift(step);
      step = previous[step];
    }

    return { path, distanceKm: distances[end] };
  }
}

module.exports = DeliveryGraph;
