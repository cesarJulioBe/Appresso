function countByStatusRecursive(orders, status, index = 0) {
  if (index >= orders.length) {
    return 0;
  }

  const matches = orders[index].status === status ? 1 : 0;

  return matches + countByStatusRecursive(orders, status, index + 1);
}

module.exports = countByStatusRecursive;
