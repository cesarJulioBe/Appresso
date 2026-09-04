function calculateStatistics(orders) {
  const statistics = {
    Requested: { orderCount: 0, totalProducts: 0, totalMoney: 0 },
    "In Progress": { orderCount: 0, totalProducts: 0, totalMoney: 0 },
    Delivered: { orderCount: 0, totalProducts: 0, totalMoney: 0 },
  };

  let operationsCount = 0;
  for (const order of orders) {
    operationsCount++;
    const group = statistics[order.status];
    if (group) {
      group.orderCount += 1;
      group.totalProducts += order.totalQuantity();
      group.totalMoney += order.totalAmount();
    }
  }
  return { statistics, operationsCount };
}
module.exports = calculateStatistics;
