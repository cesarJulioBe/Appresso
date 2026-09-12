function estimateGasCost(distanceKm, kmPerLiter, pricePerLiter) {
  const liters = distanceKm / kmPerLiter;
  const cost = liters * pricePerLiter;
  return { distanceKm, liters, cost };
}

module.exports = estimateGasCost;