/**
 * @file Order.js
 * @description Entidad raíz que modela un pedido de clientes dentro del dominio de Appresso.
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL).
 * (b) Responsabilidad única: Representar el estado en memoria de un pedido y calcular sus totales
 *     intrínsecos (cantidad total de unidades y monto monetario total) a partir de sus líneas de producto.
 * (c) Complejidad algorítmica Big-O:
 *     - `constructor`: $O(1)$ en tiempo y espacio (asignación directa de referencias y propiedades escalares).
 *     - `totalQuantity()`: $O(n)$ en tiempo y $O(1)$ en espacio auxiliar, donde $n$ es el número de ítems en `this.products`.
 *     - `totalAmount()`: $O(n)$ en tiempo y $O(1)$ en espacio auxiliar, donde $n$ es el número de ítems en `this.products`.
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - Hidratada desde `OrderRepository.toOrder()` y consumida directamente por:
 *       1. `AnalyticsService.getStatistics()` (vía `calculateStatistics`) al consultar métricas globales de pedidos (`GET /api/analytics/statistics`).
 *       2. `OperationalService.generateInvoice()` al calcular el subtotal base cuando se emite una factura asociada a un pedido (`POST /api/operational/invoices`).
 *       3. `BenchmarkService.analyzeSystemData()` al ejecutar sumatorias de ventas y conteos por cliente (`GET /api/operational/benchmarks`).
 *       4. `OrderService` y `QueueService` durante el ciclo de vida de creación, búsqueda, encolamiento y cambio de estado de pedidos.
 */

// Definición de la clase de entidad Order que encapsula datos y comportamiento del pedido
class Order {
  /**
   * Inicializa una nueva instancia de pedido en el dominio.
   *
   * @param {number|string} id - Identificador único del pedido.
   * @param {string} customer - Nombre o identificador del cliente que realiza la compra.
   * @param {Array<{name?: string, price: number, quantity: number}>} products - Lista de productos incluidos en el pedido.
   * @param {string} [status='Requested'] - Estado operativo inicial del pedido (por defecto 'Requested').
   */
  constructor(id, customer, products, status = 'Requested') {
    // Almacena el identificador único del pedido para búsquedas O(1) por propiedad o O(log n) en listas ordenadas
    this.id = id;
    // Registra el nombre o referencia del cliente titular del pedido
    this.customer = customer;
    // Conserva el arreglo de líneas de detalle (cada elemento contiene precio unitario y cantidad)
    this.products = products;
    // Asigna el estado actual dentro del flujo de preparación/entrega ('Requested', 'In Progress', 'Delivered', etc.)
    this.status = status;
    // Estampa la fecha y hora exacta de instanciación en memoria como referencia temporal por defecto
    this.createdAt = new Date();
  }

  /**
   * Calcula la suma aritmética de unidades físicas solicitadas sumando `quantity` de cada producto:
   * $\text{totalQuantity} = \sum_{i=1}^{n} q_i$
   * Complejidad: $O(n)$ temporal, $O(1)$ espacial.
   *
   * @returns {number} Cantidad total de unidades de productos en el pedido.
   */
  totalQuantity() {
    // Inicializa el acumulador entero en cero antes de recorrer las líneas del pedido
    let total = 0;
    // Recorre secuencialmente cada objeto producto dentro del arreglo this.products (n iteraciones)
    for (const product of this.products) {
      // Suma la cantidad de unidades del producto actual al acumulador general
      total += product.quantity;
    }
    // Devuelve el conteo total acumulado de artículos del pedido
    return total;
  }

  /**
   * Calcula el valor monetario bruto del pedido sumando el producto punto entre precio unitario y cantidad:
   * $\text{totalAmount} = \sum_{i=1}^{n} (p_i \times q_i)$
   * Complejidad: $O(n)$ temporal, $O(1)$ espacial.
   *
   * @returns {number} Importe monetario total del pedido.
   */
  totalAmount() {
    // Inicializa el acumulador monetario en cero
    let total = 0;
    // Itera linealmente sobre cada línea de producto registrada en el pedido
    for (const product of this.products) {
      // Multiplica el precio unitario por la cantidad solicitada (subtotal de línea) y lo acumula
      total += product.price * product.quantity;
    }
    // Retorna el monto total calculado para el pedido
    return total;
  }
}

// Exporta la entidad Order para su uso en algoritmos de dominio, repositorios y servicios de aplicación
module.exports = Order;
