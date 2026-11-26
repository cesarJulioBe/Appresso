/**
 * ============================================================================
 * ARCHIVO: src/domain/constants/orderStatus.js
 * CAPA: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Centralizar las constantes canónicas de estados de un pedido y exponer su
 *   lista inmutable (`Object.freeze`) para evitar textos sueltos ("magic strings")
 *   y mutaciones accidentales en tiempo de ejecución.
 *
 * COMPLEJIDAD ALGORÍTMICA BIG-O:
 *   - Lectura de clave en `ORDER_STATUS`: O(1).
 *   - Validación en `VALID_ORDER_STATUSES.includes(status)`: O(1) (arreglo fijo de 4 estados).
 *
 * QUIÉN LO INVOCA Y CUÁNDO SE DISPARA:
 *   - `OperationalService.updateOperationalOrderStatus(orderId, status)`
 *     al recibir `PATCH /operational/orders/:id/status`.
 * ============================================================================
 */

// Congela el diccionario de estados con Object.freeze para impedir que código externo altere sus claves
const ORDER_STATUS = Object.freeze({
  // Estado inicial cuando se registra el pedido multicanal y se descuenta el inventario
  REQUESTED: 'Requested',
  // Estado intermedio cuando el barista o cocina prepara el pedido
  IN_PROGRESS: 'In Progress',
  // Estado cuando el pedido se entrega al cliente o se aprueba el pago de su factura
  DELIVERED: 'Delivered',
  // Estado de anulación cuando el pedido se cancela y las unidades se reintegran al stock
  CANCELLED: 'Cancelled',
});

// Extrae todos los valores permitidos en un arreglo congelado: ['Requested', 'In Progress', 'Delivered', 'Cancelled']
const VALID_ORDER_STATUSES = Object.freeze(Object.values(ORDER_STATUS));

module.exports = {
  ORDER_STATUS,
  VALID_ORDER_STATUSES,
};
