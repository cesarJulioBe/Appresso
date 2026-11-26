/**
 * ============================================================================
 * ARCHIVO: src/domain/delivery/estimateGasCost.js
 * CAPA: Dominio Puro — Cálculo Matemático de Combustible y Costo de Envío
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Estimar en tiempo constante O(1) cuántos litros de combustible consume un
 *   recorrido de `distanceKm` kilómetros y cuál es su costo monetario total.
 *
 * QUIÉN LO INVOCA:
 *   `RouteService.calculateRoute` después de obtener `distanceKm` con Dijkstra.
 * ============================================================================
 */

function estimateGasCost(distanceKm, kmPerLiter, pricePerLiter) {
  // Litros requeridos = distancia total dividida por el rendimiento del vehículo (km/L)
  const liters = distanceKm / kmPerLiter;
  // Costo total en pesos = litros requeridos multiplicados por el precio por litro
  const cost = liters * pricePerLiter;
  return { distanceKm, liters, cost };
}

module.exports = estimateGasCost;
