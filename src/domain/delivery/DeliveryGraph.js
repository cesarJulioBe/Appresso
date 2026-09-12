class DeliveryGraph {
  constructor() {
    this.adjacencyList = {};
  }

  addCity(city) {
    if (!this.adjacencyList[city]) {
      this.adjacencyList[city] = [];
    }
  }

  addRoute(cityA, cityB, distanceKm) {
    this.addCity(cityA);
    this.addCity(cityB);
    this.adjacencyList[cityA].push({ node: cityB, weight: distanceKm });
    this.adjacencyList[cityB].push({ node: cityA, weight: distanceKm });
  }

  dijkstra(start, end) {
    const distances = {};
    const previous = {};
    const visited = new Set();
    const queue = [];

    for (const city of Object.keys(this.adjacencyList)) {
      distances[city] = Infinity;
      previous[city] = null;
    }
    distances[start] = 0;
    queue.push({ node: start, distance: 0 });

    while (queue.length > 0) {
      queue.sort((a, b) => a.distance - b.distance);
      const { node: current } = queue.shift();

      if (visited.has(current)) continue;
      visited.add(current);
      if (current === end) break;

      for (const neighbor of this.adjacencyList[current] || []) {
        if (visited.has(neighbor.node)) continue;
        const newDistance = distances[current] + neighbor.weight;
        if (newDistance < distances[neighbor.node]) {
          distances[neighbor.node] = newDistance;
          previous[neighbor.node] = current;
          queue.push({ node: neighbor.node, distance: newDistance });
        }
      }
    }

    if (distances[end] === Infinity) return { path: [], distanceKm: null };

    const path = [];
    let step = end;
    while (step) {
      path.unshift(step);
      step = previous[step];
    }

    return { path, distanceKm: distances[end] };
  }

    addEdge(from, to, weight) {
    this.addCity(from);
    this.addCity(to);
    this.adjacencyList[from].push({ node: to, weight });
  }
}

module.exports = DeliveryGraph;