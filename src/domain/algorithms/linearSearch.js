function linearSearch(orders, targetId) {
    let operationsCount = 0;
    for (const order of orders) {
        operationsCount++;
        if (order.id === targetId) {
            return { order, operationsCount };
        }
    }
    return { found: null, operationsCount };
}
module.exports = linearSearch;