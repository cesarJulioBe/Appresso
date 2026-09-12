const OrderQueue = require('./src/domain/delivery/OrderQueue');
const ActionStack = require('./src/domain/delivery/ActionStack');
const DeliveryGraph = require('./src/domain/delivery/DeliveryGraph');
const estimateGasCost = require('./src/domain/delivery/estimateGasCost');

// ===== 1. Prueba de la Cola (Queue) =====
console.log('=== COLA DE PEDIDOS (FIFO) ===');
const queue = new OrderQueue();
queue.enqueue('Pedido de Ana');
queue.enqueue('Pedido de Luis');
queue.enqueue('Pedido de Marta');

console.log('Tamaño de la cola:', queue.size());
console.log('Siguiente a atender (sin sacarlo):', queue.peek());
console.log('Atendiendo:', queue.dequeue());
console.log('Atendiendo:', queue.dequeue());
console.log('Tamaño restante:', queue.size());

// ===== 2. Prueba de la Pila (Stack) =====
console.log('\n=== PILA DE ACCIONES (LIFO) ===');
const stack = new ActionStack();
stack.push('Pedido 1 -> Requested');
stack.push('Pedido 1 -> In Progress');
stack.push('Pedido 1 -> Delivered');

console.log('Última acción (sin sacarla):', stack.peek());
console.log('Deshaciendo:', stack.pop());
console.log('Ahora la última acción es:', stack.peek());

// ===== 3. Prueba del Grafo + Dijkstra =====
console.log('\n=== GRAFO DE CIUDADES (DIJKSTRA) ===');
const graph = new DeliveryGraph();
graph.addRoute('A', 'B', 4);
graph.addRoute('A', 'C', 2);
graph.addRoute('C', 'D', 3);
graph.addRoute('D', 'B', 1);

const result = graph.dijkstra('A', 'B');
console.log('Ruta más corta de A a B:', result.path.join(' -> '));
console.log('Distancia total:', result.distanceKm, 'km');

// ===== 4. Prueba de estimación de gasolina =====
console.log('\n=== ESTIMACIÓN DE GASOLINA ===');
const gas = estimateGasCost(result.distanceKm, 15, 10500);
console.log('Distancia:', gas.distanceKm, 'km');
console.log('Litros necesarios:', gas.liters.toFixed(2));
console.log('Costo estimado: $', gas.cost.toFixed(0));