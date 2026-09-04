const Order = require('./src/domain/entities/Order');
const calculateStatistics = require('./src/domain/algorithms/calculateStatistics');
const linearSearch = require('./src/domain/algorithms/linearSearch');
const binarySearch = require('./src/domain/algorithms/binarySearch');
const countByStatusRecursive = require('./src/domain/algorithms/countByStatusRecursive');
const { nthTerm, findPositionForValue } = require('./src/domain/algorithms/arithmeticProgression');

// ===== Datos de prueba =====
const orders = [
  new Order(1, "Ana",   [{ name: "Coffee", quantity: 2, price: 5000 }], "Delivered"),
  new Order(2, "Luis",  [{ name: "Tea",    quantity: 1, price: 4000 }], "In Progress"),
  new Order(3, "Marta", [{ name: "Muffin", quantity: 3, price: 8000 }], "Requested"),
  new Order(4, "Ana",   [{ name: "Coffee", quantity: 1, price: 5000 }], "Delivered"),
];

// ===== 1. Entidad Order =====
console.log("=== ORDER ===");
console.log("Total quantity (order 1):", orders[0].totalQuantity());
console.log("Total amount (order 1):", orders[0].totalAmount());

// ===== 2. Estadísticas =====
console.log("\n=== STATISTICS ===");
console.log(JSON.stringify(calculateStatistics(orders), null, 2));

// ===== 3. Búsqueda lineal vs binaria =====
console.log("\n=== SEARCH ===");
const sortedOrders = [];
for (let i = 1; i <= 10; i++) {
  sortedOrders.push(new Order(i, `Customer${i}`, [{ name: "Coffee", quantity: 1, price: 5000 }], "Requested"));
}
const targetId = 9;
console.log("Linear search:", linearSearch(sortedOrders, targetId));
console.log("Binary search:", binarySearch(sortedOrders, targetId));

// ===== 4. Conteo recursivo =====
console.log("\n=== RECURSIVE COUNT ===");
console.log("Delivered count (recursive):", countByStatusRecursive(orders, "Delivered"));

// ===== 5. Progresión aritmética =====
console.log("\n=== ARITHMETIC PROGRESSION ===");
const firstTerm = 2;
const commonDifference = 2;
[42, 72, 120].forEach(target => {
  const week = findPositionForValue(firstTerm, commonDifference, target);
  console.log(`Para llegar a ${target} productos, se necesita la semana: ${week}`);
});
// ===== 6. Regresión lineal =====
console.log("\n=== LINEAR REGRESSION ===");
const linearRegression = require('./src/domain/algorithms/linearRegression');

// Ventas de los últimos 7 días (datos inventados, con variación real)
const salesHistory = [10, 13, 9, 15, 18, 20, 19];

const model = linearRegression(salesHistory);
console.log("Slope (tendencia diaria):", model.slope.toFixed(2));
console.log("Intercept:", model.intercept.toFixed(2));

[2, 5, 7].forEach(days => {
  console.log(`Predicción en ${days} día(s):`, model.predict(days).toFixed(2));
});