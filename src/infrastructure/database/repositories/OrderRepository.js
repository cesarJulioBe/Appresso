/**
 * @file OrderRepository.js
 * @description Repositorio de persistencia y reconstrucción de entidades `Order` sobre la tabla `orders`.
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Repositorios).
 * - (b) Responsabilidad única (SRP): Traducir entre filas relacionales/JSON de la tabla `orders` en PostgreSQL
 *       e instancias ricas de la entidad de dominio `Order`, proveyendo operaciones de creación, lectura
 *       (paginada, completa y por estado) y transición de estado.
 * - (c) Quién lo dispara / invoca:
 *       - Instanciado en `src/container.js` con inyección de `{ db }`.
 *       - Invocado por `OrderService` (CRUD y paginación), `QueueService` (cola FIFO de preparación y deshacer),
 *         `AnalyticsService` (estadísticas e ingresos), `OperationalService` (`createExtended`),
 *         `BenchmarkService` y `AiService`.
 * - (d) Buenas prácticas aplicadas:
 *       - Patrón *Data Mapper* (`toOrder`) para hidratar entidades puras del Dominio desacoplando `snake_case` SQL de `camelCase` JS.
 *       - Consultas parametrizadas (`$1, $2...`) contra inyección SQL y serialización controlada de arreglos JSON.
 *       - Paginación eficiente en motor de base de datos mediante `LIMIT` y `OFFSET` junto con metadatos de páginas totales.
 */

// Importa la entidad de dominio Order para hidratar objetos con comportamiento de negocio propio (ej. totalAmount())
const Order = require('../../../domain/entities/Order');

// Define el repositorio responsable del ciclo de persistencia de pedidos en la tabla 'orders'
class OrderRepository {
  /**
   * Inicializa el repositorio con la conexión a base de datos inyectada.
   *
   * @param {object} deps - Dependencias requeridas.
   * @param {object} deps.db - Adaptador de base de datos con soporte para `query(text, params)`.
   */
  constructor({ db }) {
    // Guarda la referencia al cliente/pool de PostgreSQL en la instancia
    this.db = db;
  }

  /**
   * Transforma (hidrata) una fila cruda proveniente de PostgreSQL (`snake_case`) en una instancia
   * válida de la entidad de dominio `Order` (`camelCase`), asegurando retrocompatibilidad financiera.
   *
   * @param {object} row - Registro devuelto por una consulta sobre la tabla `orders`.
   * @returns {Order} Instancia enriquecida de la entidad de dominio `Order`.
   */
  toOrder(row) {
    // Construye la entidad base con identificador, nombre del cliente, lista de productos y estado actual
    const order = new Order(row.id, row.customer, row.products || [], row.status);
    // Asigna la fecha de creación original registrada por PostgreSQL
    order.createdAt = row.created_at;
    // Asigna el canal de venta o 'presencial' por defecto para pedidos históricos sin ese campo
    order.canal = row.canal || 'presencial';
    // Vincula el ID del usuario comprador si está asociado, o null en pedidos anónimos/legados
    order.usuarioId = row.usuario_id || null;
    // Vincula el ID del empleado que atendió la orden o null si fue autoservicio/app
    order.empleadoId = row.empleado_id || null;
    // Convierte el subtotal numérico de PostgreSQL; si no existe, lo calcula dinámicamente desde los productos
    order.subtotal = row.subtotal !== undefined && row.subtotal !== null
      ? Number(row.subtotal)
      : order.totalAmount();
    // Normaliza el monto de descuento comercial a tipo Number (0 por defecto)
    order.descuento = Number(row.descuento || 0);
    // Normaliza el monto de impuestos aplicados a tipo Number (0 por defecto)
    order.impuestos = Number(row.impuestos || 0);
    // Si la fila ya almacena un total positivo explícito lo usa; de lo contrario recurre al cálculo de la entidad
    order.total = row.total !== undefined && row.total !== null && Number(row.total) > 0
      ? Number(row.total)
      : order.totalAmount();
    // Devuelve la entidad de dominio completamente hidratada
    return order;
  }

  /**
   * Inserta un nuevo pedido estándar con estado inicial `'Requested'`.
   *
   * Consulta ejecutada: `INSERT INTO orders (customer, products, status) VALUES ($1, $2, 'Requested') RETURNING *`
   *
   * @param {string} customer - Nombre o identificador visible del cliente.
   * @param {Array<object>} products - Lista de productos solicitados con cantidad y precio.
   * @returns {Promise<Order>} Entidad `Order` hidratada correspondiente al pedido recién creado.
   */
  async create(customer, products) {
    // Ejecuta la inserción parametrizada serializando el arreglo de productos a texto JSON válido
    const result = await this.db.query(
      `INSERT INTO orders (customer, products, status)
       VALUES ($1, $2, 'Requested')
       RETURNING *`,
      [customer, JSON.stringify(products)]
    );
    // Convierte la primera fila devuelta por RETURNING * en una entidad de dominio Order
    return this.toOrder(result.rows[0]);
  }

  /**
   * Inserta un pedido operativo completo incluyendo relaciones de usuario/empleado, canal de venta
   * y el desglose financiero detallado (subtotal, descuento, impuestos y total).
   *
   * Consulta ejecutada:
   * `INSERT INTO orders (customer, products, status, usuario_id, empleado_id, canal, subtotal, descuento, impuestos, total) VALUES ($1..$10) RETURNING *`
   *
   * @param {object} data - Atributos extendidos del pedido.
   * @param {string} data.customer - Nombre del cliente.
   * @param {Array<object>} data.products - Líneas de producto del pedido.
   * @param {string} [data.status='Requested'] - Estado inicial del pedido.
   * @param {number|null} [data.usuarioId=null] - ID del usuario cliente en tabla `usuarios`.
   * @param {number|null} [data.empleadoId=null] - ID del empleado que registra la operación.
   * @param {string} [data.canal='presencial'] - Canal comercial (`presencial`, `app`, `domicilio`, etc.).
   * @param {number} [data.subtotal=0] - Subtotal antes de descuentos e impuestos.
   * @param {number} [data.descuento=0] - Valor monetario descontado.
   * @param {number} [data.impuestos=0] - Valor monetario de impuestos (ej. IVA 19%).
   * @param {number} [data.total=0] - Valor neto final del pedido.
   * @returns {Promise<Order>} Entidad `Order` hidratada con todos los campos financieros y relacionales.
   */
  async createExtended({
    customer,
    products,
    status = 'Requested',
    usuarioId = null,
    empleadoId = null,
    canal = 'presencial',
    subtotal = 0,
    descuento = 0,
    impuestos = 0,
    total = 0,
  }) {
    // Inserta los 10 atributos mediante marcadores posicionales seguros para evitar SQL Injection
    const result = await this.db.query(
      `INSERT INTO orders (
        customer, products, status, usuario_id, empleado_id,
        canal, subtotal, descuento, impuestos, total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        customer,
        JSON.stringify(products),
        status,
        usuarioId,
        empleadoId,
        canal,
        subtotal,
        descuento,
        impuestos,
        total,
      ]
    );
    // Hidrata y retorna la entidad Order creada en PostgreSQL
    return this.toOrder(result.rows[0]);
  }

  /**
   * Busca un pedido específico por su clave primaria.
   *
   * Consulta ejecutada: `SELECT * FROM orders WHERE id = $1`
   *
   * @param {number|string} id - Identificador único del pedido.
   * @returns {Promise<Order|null>} Instancia `Order` encontrada o `null` si no existe.
   */
  async findById(id) {
    // Ejecuta consulta parametrizada filtrando por el ID del pedido
    const result = await this.db.query('SELECT * FROM orders WHERE id = $1', [id]);
    // Si no se encontró ninguna fila coincidente, retorna null explícitamente
    if (result.rows.length === 0) return null;
    // Transforma la fila hallada en entidad de dominio Order y la devuelve
    return this.toOrder(result.rows[0]);
  }

  /**
   * Obtiene una página acotada de pedidos ordenados por `id` junto con metadatos de paginación.
   *
   * Consultas ejecutadas:
   * 1. `SELECT * FROM orders ORDER BY id ASC LIMIT $1 OFFSET $2`
   * 2. `SELECT COUNT(*) FROM orders`
   *
   * @param {number} [page=1] - Número de página solicitada (base 1).
   * @param {number} [pageSize=20] - Cantidad máxima de registros por página.
   * @returns {Promise<{orders: Order[], total: number, page: number, pageSize: number, totalPages: number}>} Página de pedidos e indicadores de navegación.
   */
  async findAll(page = 1, pageSize = 20) {
    // Calcula cuántos registros iniciales deben omitirse según la página actual
    const offset = (page - 1) * pageSize;

    // Consulta únicamente el segmento de filas correspondiente a la página solicitada
    const result = await this.db.query(
      'SELECT * FROM orders ORDER BY id ASC LIMIT $1 OFFSET $2',
      [pageSize, offset]
    );

    // Ejecuta conteo global en la tabla para calcular el total de páginas disponibles
    const countResult = await this.db.query('SELECT COUNT(*) FROM orders');
    // Convierte el conteo devuelto como texto por el driver pg a entero base 10
    const total = parseInt(countResult.rows[0].count, 10);

    // Construye y retorna la respuesta estructurada con entidades hidratadas y metadatos de paginación
    return {
      // Mapea cada fila SQL a su respectiva instancia de dominio Order
      orders: result.rows.map((row) => this.toOrder(row)),
      // Cantidad total histórica de pedidos en la tabla
      total,
      // Página actual consultada
      page,
      // Tamaño de página aplicado
      pageSize,
      // Total de páginas redondeado hacia arriba
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Recupera absolutamente todos los pedidos sin paginación, útil para cálculos analíticos,
   * reportes globales, entrenamiento de IA y pruebas de rendimiento.
   *
   * Consulta ejecutada: `SELECT * FROM orders ORDER BY id ASC`
   *
   * @returns {Promise<Order[]>} Arreglo completo de entidades `Order` ordenadas por ID.
   */
  async findAllUnpaginated() {
    // Consulta todas las filas de 'orders' manteniendo orden cronológico/secuencial por ID
    const result = await this.db.query('SELECT * FROM orders ORDER BY id ASC');
    // Hidrata cada registro crudo en una instancia de Order
    return result.rows.map((row) => this.toOrder(row));
  }

  /**
   * Filtra y retorna todos los pedidos que se encuentran en un estado específico (ej. `'Requested'`, `'Preparing'`, `'Delivered'`).
   * Esencial para gestionar la cola FIFO de cocina/entregas en `QueueService`.
   *
   * Consulta ejecutada: `SELECT * FROM orders WHERE status = $1 ORDER BY id ASC`
   *
   * @param {string} status - Estado exacto por el cual filtrar los pedidos.
   * @returns {Promise<Order[]>} Lista ordenada FIFO de entidades `Order` en dicho estado.
   */
  async findByStatus(status) {
    // Ejecuta SELECT parametrizado asegurando orden FIFO mediante ORDER BY id ASC
    const result = await this.db.query(
      'SELECT * FROM orders WHERE status = $1 ORDER BY id ASC',
      [status]
    );
    // Convierte todas las filas coincidentes en instancias de Order
    return result.rows.map((row) => this.toOrder(row));
  }

  /**
   * Actualiza el estado operativo de un pedido existente y retorna la entidad actualizada.
   *
   * Consulta ejecutada: `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`
   *
   * @param {number|string} id - Identificador primario del pedido a actualizar.
   * @param {string} status - Nuevo estado a asignar al pedido.
   * @returns {Promise<Order|null>} Entidad `Order` con el nuevo estado o `null` si el pedido no existe.
   */
  async updateStatus(id, status) {
    // Ejecuta UPDATE parametrizado recuperando de inmediato la fila modificada
    const result = await this.db.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    // Retorna null cuando el ID suministrado no corresponde a ningún pedido existente
    if (result.rows.length === 0) return null;
    // Devuelve la entidad Order reconstruida con el estado actualizado
    return this.toOrder(result.rows[0]);
  }
}

// Exporta la clase OrderRepository para inyección de dependencias en el contenedor principal
module.exports = OrderRepository;
