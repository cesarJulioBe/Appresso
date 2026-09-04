function binarySearch(orders, targetId) {
    let operationsCount = 0;
    let start = 0;
    let end = orders.length - 1;

    while (start <= end) {
        operationsCount++;

        const half = Math.floor((start + end) / 2);

        if(orders[half].id === targetId) {
            return { found: orders[half], operationsCount };
        }

        if(orders[half].id < targetId) {
            start = half + 1;
        } else {
            end = half - 1;
        }
    }
    return { found: null, operationsCount };
}
module.exports = binarySearch;