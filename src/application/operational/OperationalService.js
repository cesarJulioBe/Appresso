/**
 * @file OperationalService.js
 * @description Caso de uso medular de la Plataforma Operativa Multicanal de Appresso:
 * gestiona usuarios con roles, categorías e inventario con normalización/deduplicación en tiempo real,
 * pedidos multicanal con descuento/reintegro automático de stock, facturación electrónica interna con IVA (19%),
 * descuentos auditados y cadena criptográfica tipo blockchain (`hashChain`), pagos con validación de comprobantes
 * y herramientas de auditoría/simulación/restauración de integridad.
 *
 * - **Capa arquitectónica:** Aplicación - Casos de Uso (`src/application/operational`).
 * - **Inyección de Dependencias (`container.js`):** Recibe desde `buildContainer()` en `src/container.js`:
 *   - `userRepository`: Instancia de `UserRepository` (`listAll`, `findByEmail`, `findById`, `create`, `update`, `delete`).
 *   - `catalogRepository`: Instancia de `CatalogRepository` (`listCategories`, `findCategoryByNormalizedName`,
 *     `findCategoryById`, `createCategory`, `updateCategory`, `deleteCategory`, `listItems`,
 *     `findItemByNormalizedName`, `findItemById`, `createItem`, `updateItem`, `deleteItem`, `adjustStock`).
 *   - `orderRepository`: Instancia de `OrderRepository` (`createExtended`, `findById`, `updateStatus`).
 *   - `billingRepository`: Instancia de `BillingRepository` (`listInvoices`, `findInvoiceById`,
 *     `getNextInvoiceConsecutive`, `getLastInvoiceHash`, `createInvoice`, `updateInvoiceStatus`,
 *     `updateInvoiceChainFields`, `listPayments`, `getAllReceiptReferences`, `getLastPaymentHash`,
 *     `createPayment`, `updatePaymentChainFields`).
 *   - `aiService`: Instancia de `AiService` para clasificar en caliente con Keras cada factura y pago emitido.
 *   - `secret`: Secreto criptográfico `HMAC_SECRET` para encadenar hashes de facturas y pagos.
 *   - `logger`: Logger contextualizado con `childLogger('OperationalService')`.
 * - **Controlador HTTP que dispara cada método (`OperationalController` en `src/interfaces/http/routes/operational.routes.js`):**
 *   - Usuarios:
 *     1. `listUsers()` <- `OperationalController.listUsers` (`GET /operational/users`) y `getExecutiveSummary`.
 *     2. `createUser(payload)` <- `OperationalController.createUser` (`POST /operational/users`).
 *     3. `updateUser(id, payload)` <- `OperationalController.updateUser` (`PUT /operational/users/:id`).
 *     4. `deleteUser(id)` <- `OperationalController.deleteUser` (`DELETE /operational/users/:id`).
 *   - Categorías:
 *     5. `listCategories()` <- `OperationalController.listCategories` (`GET /operational/categories`) y `getExecutiveSummary`.
 *     6. `createCategory(payload)` <- `OperationalController.createCategory` (`POST /operational/categories`).
 *     7. `updateCategory(id, payload)` <- `OperationalController.updateCategory` (`PUT /operational/categories/:id`).
 *     8. `deleteCategory(id)` <- `OperationalController.deleteCategory` (`DELETE /operational/categories/:id`).
 *   - Ítems / Inventario:
 *     9. `listItems()` <- `OperationalController.listItems` (`GET /operational/items`) y `getExecutiveSummary`.
 *     10. `createItem(payload)` <- `OperationalController.createItem` (`POST /operational/items`).
 *     11. `updateItem(id, payload)` <- `OperationalController.updateItem` (`PUT /operational/items/:id`).
 *     12. `deleteItem(id)` <- `OperationalController.deleteItem` (`DELETE /operational/items/:id`).
 *   - Pedidos multicanal:
 *     13. `createOperationalOrder(payload)` <- `OperationalController.createOperationalOrder` (`POST /operational/orders`).
 *     14. `cancelOrder(orderId)` <- `OperationalController.cancelOrder` (`POST /operational/orders/:id/cancel`).
 *   - Facturación:
 *     15. `listInvoices()` <- `OperationalController.listInvoices` (`GET /operational/invoices`) y `getExecutiveSummary`.
 *     16. `generateInvoice(payload)` <- `OperationalController.createInvoice` (`POST /operational/invoices`).
 *     17. `cancelInvoice(invoiceId, reason)` <- `OperationalController.cancelInvoice` (`POST /operational/invoices/:id/cancel`).
 *   - Pagos:
 *     18. `listPayments()` <- `OperationalController.listPayments` (`GET /operational/payments`) y `getExecutiveSummary`.
 *     19. `processPayment(payload)` <- `OperationalController.processPayment` (`POST /operational/payments`).
 *   - Integridad criptográfica:
 *     20. `verifyIntegrity()` <- `OperationalController.verifyIntegrity` (`GET /operational/integrity/verify`) y `getExecutiveSummary`.
 *     21. `simulateTampering(options)` <- `OperationalController.simulateTampering` (`POST /operational/integrity/tamper-demo`).
 *     22. `restoreIntegrityChain()` <- `OperationalController.restoreIntegrity` (`POST /operational/integrity/restore`).
 * - **Delegación a Dominio y Repositorios:**
 *   - Dominio: `dataCleaner.js` (`toCanonicalKey`, `unifyCategoryName`, `normalizeChannel`, `cleanUserInput`, `cleanItemInput`),
 *     `hashChain.js` (`GENESIS_INVOICE_HASH`, `GENESIS_PAYMENT_HASH`, `computeInvoiceChainHash`, `computeReceiptHash`,
 *     `validatePaymentReceipt`, `computePaymentChainHash`, `verifyInvoiceChain`, `verifyPaymentChain`),
 *     `ValidationError`, `NotFoundError`.
 *   - Repositorios / Servicios: `UserRepository`, `CatalogRepository`, `OrderRepository`, `BillingRepository`, `AiService`.
 */

// Funciones puras de dominio para limpieza de entradas, llaves canónicas y unificación de canales/categorías
const {
  toCanonicalKey,
  unifyCategoryName,
  normalizeChannel,
  cleanUserInput,
  cleanItemInput,
} = require('../../domain/quality/dataCleaner');
// Primitivas criptográficas de dominio para encadenar y auditar hashes inmutables de facturas y pagos
const {
  GENESIS_INVOICE_HASH,
  GENESIS_PAYMENT_HASH,
  computeInvoiceChainHash,
  computeReceiptHash,
  validatePaymentReceipt,
  computePaymentChainHash,
  verifyInvoiceChain,
  verifyPaymentChain,
} = require('../../domain/integrity/hashChain');
// Clases de error operacionales 400 y 404 traducidas centralizadamente por `errorHandler.js`
const { ValidationError, NotFoundError } = require('../../domain/errors');
// Catálogo inmutable de estados permitidos en el ciclo de vida de un pedido
const { VALID_ORDER_STATUSES, ORDER_STATUS } = require('../../domain/constants/orderStatus');

class OperationalService {
  /**
   * Construye el servicio operativo multicanal inyectando repositorios, clasificador IA y secreto criptográfico.
   *
   * @param {Object} deps Dependencias inyectadas por `container.js`.
   */
  constructor({
    userRepository,
    catalogRepository,
    orderRepository,
    billingRepository,
    aiService = null,
    secret,
    logger,
  }) {
    // Repositorios de persistencia para usuarios, catálogo, pedidos y facturación/pagos
    this.userRepository = userRepository;
    this.catalogRepository = catalogRepository;
    this.orderRepository = orderRepository;
    this.billingRepository = billingRepository;
    // Servicio de IA No-LLM opcional para evaluar riesgo en caliente al facturar y cobrar
    this.aiService = aiService;
    // Clave HMAC utilizada para firmar y verificar los eslabones criptográficos de facturas y pagos
    this.secret = secret || process.env.HMAC_SECRET || 'appresso_default_hmac_secret';
    // Logger contextual del servicio
    this.logger = logger;
  }

  /**
   * Permite enlazar o reemplazar dinámicamente la instancia de `AiService` posterior a la construcción.
   *
   * @param {Object} aiService Instancia de `AiService`.
   */
  setAiService(aiService) {
    this.aiService = aiService;
  }

  // =========================================================================
  // 1. USUARIOS CON ROLES (cliente, empleado, admin)
  // =========================================================================

  /**
   * Lista todos los usuarios registrados (clientes, empleados y administradores).
   * Se dispara desde `OperationalController.listUsers` (`GET /operational/users`) y `getExecutiveSummary`.
   *
   * @returns {Promise<Array<Object>>} Colección de usuarios.
   */
  async listUsers() {
    return this.userRepository.listAll();
  }

  /**
   * Crea un usuario aplicando normalización automática de nombre/correo/rol y deduplicación por email.
   * Se dispara desde `OperationalController.createUser` al recibir `POST /operational/users`.
   *
   * @param {Object} [payload={}] Datos del usuario a registrar.
   * @returns {Promise<{ user: Object, deduplicated: boolean, wasCleaned: boolean, warnings: string[] }>}
   */
  async createUser(payload = {}) {
    // Validación de regla de negocio: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!payload.nombre && !payload.email) {
      throw new ValidationError('nombre o email son obligatorios para crear un usuario');
    }

    // Limpia espacios, capitaliza el nombre, sanea el email y valida el rol mediante `dataCleaner.cleanUserInput`
    const { cleanData, warnings, wasCleaned } = cleanUserInput(payload);

    // Si no es una inyección explícita de prueba sucia, busca colisión por email limpio para unificar en vez de duplicar
    if (!payload.allowDuplicateForTest) {
      const existingByEmail = await this.userRepository.findByEmail(cleanData.email);
      if (existingByEmail) {
        // Actualiza los datos del usuario preexistente y reporta deduplicación preventiva
        const updated = await this.userRepository.update(existingByEmail.id, cleanData);
        return {
          user: updated,
          deduplicated: true,
          wasCleaned,
          warnings: [
            ...warnings,
            `Usuario existente con email '${cleanData.email}' reutilizado/unificado (ID #${existingByEmail.id})`,
          ],
        };
      }
    }

    // Inserta el nuevo usuario normalizado en la tabla `usuarios`
    const created = await this.userRepository.create(cleanData);
    return {
      user: created,
      deduplicated: false,
      wasCleaned,
      warnings,
    };
  }

  /**
   * Actualiza los atributos de un usuario existente re-aplicando limpieza canónica.
   * Se dispara desde `OperationalController.updateUser` al recibir `PUT /operational/users/:id`.
   *
   * @param {number} id ID del usuario a modificar.
   * @param {Object} [payload={}] Campos parciales a actualizar.
   * @returns {Promise<{ user: Object, warnings: string[] }>}
   */
  async updateUser(id, payload = {}) {
    // Verifica que el usuario exista en BD antes de intentar fusionar sus datos
    const existing = await this.userRepository.findById(id);
    // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!existing) throw new NotFoundError('Usuario no encontrado');

    // Combina los valores actuales con los nuevos y ejecuta saneamiento de dominio
    const merged = { ...existing, ...payload };
    const { cleanData, warnings } = cleanUserInput(merged);
    // Persiste el registro limpio en PostgreSQL
    const updated = await this.userRepository.update(id, cleanData);
    return { user: updated, warnings };
  }

  /**
   * Elimina un usuario por su identificador primario.
   * Se dispara desde `OperationalController.deleteUser` al recibir `DELETE /operational/users/:id`.
   *
   * @param {number} id ID del usuario a eliminar.
   * @returns {Promise<Object>} Registro eliminado.
   */
  async deleteUser(id) {
    const deleted = await this.userRepository.delete(id);
    // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!deleted) throw new NotFoundError('Usuario no encontrado');
    return deleted;
  }

  // =========================================================================
  // 2. CATEGORÍAS (con normalización y unificación automática)
  // =========================================================================

  /**
   * Lista todas las categorías del catálogo comercial.
   * Se dispara desde `OperationalController.listCategories` (`GET /operational/categories`) y `getExecutiveSummary`.
   *
   * @returns {Promise<Array<Object>>} Colección de categorías.
   */
  async listCategories() {
    return this.catalogRepository.listCategories();
  }

  /**
   * Crea una categoría resolviendo sinónimos e inconsistencias ortográficas (`unifyCategoryName`)
   * para evitar categorías duplicadas equivalentes.
   * Se dispara desde `OperationalController.createCategory` (`POST /operational/categories`) o internamente desde `createItem`.
   *
   * @param {Object} [payload={}] Datos de la categoría.
   * @returns {Promise<Object>} Categoría creada o reutilizada.
   */
  async createCategory(payload = {}) {
    // Validación de regla de negocio: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!payload.nombre) {
      throw new ValidationError('El nombre de la categoría es obligatorio');
    }

    // Convierte variantes sucias (ej. 'bebidas calientes cafe') en su nombre oficial y llave canónica
    const unified = unifyCategoryName(payload.nombre);
    // Deduplica buscando si ya existe la misma llave canónica en BD
    if (!payload.allowDuplicateForTest) {
      const existing = await this.catalogRepository.findCategoryByNormalizedName(
        unified.canonicalKey
      );
      if (existing) {
        return {
          category: existing,
          deduplicated: true,
          wasInconsistent: unified.wasInconsistent,
          reason:
            unified.reason ||
            `Categoría equivalente '${existing.nombre}' ya existe y fue unificada`,
        };
      }
    }

    // Si no existía, inserta la categoría estandarizada en la tabla `categorias`
    const created = await this.catalogRepository.createCategory({
      nombre: payload.allowDuplicateForTest ? String(payload.nombre) : unified.displayName,
      nombreNormalizado: unified.canonicalKey,
      descripcion: payload.descripcion || '',
      estado: payload.estado || 'Activa',
    });

    return {
      category: created,
      deduplicated: false,
      wasInconsistent: unified.wasInconsistent,
      reason: unified.reason,
    };
  }

  /**
   * Actualiza los datos de una categoría existente recalculando su llave canónica si cambia el nombre.
   * Se dispara desde `OperationalController.updateCategory` al recibir `PUT /operational/categories/:id`.
   *
   * @param {number} id ID de la categoría.
   * @param {Object} [payload={}] Nuevos campos de la categoría.
   * @returns {Promise<{ category: Object }>}
   */
  async updateCategory(id, payload = {}) {
    const existing = await this.catalogRepository.findCategoryById(id);
    // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!existing) throw new NotFoundError('Categoría no encontrada');

    // Si enviaron un nuevo `nombre`, lo estandariza; si no, conserva nombre y llave actuales
    const unified = payload.nombre
      ? unifyCategoryName(payload.nombre)
      : {
          displayName: existing.nombre,
          canonicalKey: existing.nombre_normalizado,
        };

    // Actualiza la fila en `CatalogRepository`
    const updated = await this.catalogRepository.updateCategory(id, {
      nombre: unified.displayName,
      nombreNormalizado: unified.canonicalKey,
      descripcion: payload.descripcion ?? existing.descripcion,
      estado: payload.estado ?? existing.estado,
    });

    return { category: updated };
  }

  /**
   * Elimina una categoría del catálogo por ID.
   * Se dispara desde `OperationalController.deleteCategory` al recibir `DELETE /operational/categories/:id`.
   *
   * @param {number} id ID de la categoría a borrar.
   * @returns {Promise<Object>} Categoría eliminada.
   */
  async deleteCategory(id) {
    const deleted = await this.catalogRepository.deleteCategory(id);
    // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!deleted) throw new NotFoundError('Categoría no encontrada');
    return deleted;
  }

  // =========================================================================
  // 3. ÍTEMS / CATÁLOGO DE PRODUCTOS E INVENTARIO
  // =========================================================================

  /**
   * Lista todos los productos e inventarios disponibles en el catálogo.
   * Se dispara desde `OperationalController.listItems` (`GET /operational/items`) y `getExecutiveSummary`.
   *
   * @returns {Promise<Array<Object>>} Colección de ítems.
   */
  async listItems() {
    return this.catalogRepository.listItems();
  }

  /**
   * Registra un producto limpiando SKU/nombre/precio/stock y sumando inventario automáticamente si ya existía.
   * Se dispara desde `OperationalController.createItem` al recibir `POST /operational/items`.
   *
   * @param {Object} [payload={}] Datos del producto a crear.
   * @returns {Promise<{ item: Object, deduplicated: boolean, wasCleaned: boolean, warnings: string[] }>}
   */
  async createItem(payload = {}) {
    // Validación de regla de negocio: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!payload.nombre && !payload.name) {
      throw new ValidationError('El nombre del ítem es obligatorio');
    }

    // Normaliza texto, genera SKU limpio y corrige precios mal formados mediante `cleanItemInput`
    const { cleanData, warnings, wasCleaned } = cleanItemInput(payload);

    // Resuelve la categoría por ID o crea/unifica dinámicamente la categoría si se indicó `categoriaNombre`
    let categoriaId = cleanData.categoriaId ? Number(cleanData.categoriaId) : null;
    if (!categoriaId && cleanData.categoriaNombre) {
      const catResult = await this.createCategory({ nombre: cleanData.categoriaNombre });
      categoriaId = catResult.category.id;
    }

    // Deduplicación preventiva por nombre canónico: si el producto ya existe, acumula el stock entrante
    if (!payload.allowDuplicateForTest) {
      const existing = await this.catalogRepository.findItemByNormalizedName(
        cleanData.nombreNormalizado
      );
      if (existing) {
        const updated = await this.catalogRepository.updateItem(existing.id, {
          precio: cleanData.precio,
          stock: Number(existing.stock || 0) + Number(cleanData.stock || 0),
          categoriaId: categoriaId || existing.categoria_id,
        });
        return {
          item: updated,
          deduplicated: true,
          wasCleaned: true,
          warnings: [
            ...warnings,
            `Ítem duplicado '${cleanData.nombre}' unificado con ID #${existing.id} (stock sumado)`,
          ],
        };
      }
    }

    // Crea el nuevo producto en la tabla `items`
    const created = await this.catalogRepository.createItem({
      sku: cleanData.sku,
      nombre: payload.allowDuplicateForTest ? String(payload.nombre) : cleanData.nombre,
      nombreNormalizado: cleanData.nombreNormalizado,
      categoriaId,
      precio: cleanData.precio,
      stock: cleanData.stock,
      estado: cleanData.estado,
    });

    return {
      item: created,
      deduplicated: false,
      wasCleaned,
      warnings,
    };
  }

  /**
   * Modifica un ítem del inventario asegurando limpieza de nombre, precio y stock.
   * Se dispara desde `OperationalController.updateItem` al recibir `PUT /operational/items/:id`.
   *
   * @param {number} id ID del producto.
   * @param {Object} [payload={}] Atributos a actualizar.
   * @returns {Promise<{ item: Object, warnings: string[] }>}
   */
  async updateItem(id, payload = {}) {
    const existing = await this.catalogRepository.findItemById(id);
    // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!existing) throw new NotFoundError('Ítem no encontrado');

    // Fusiona estado actual y cambios entrantes preservando valores existentes cuando no vienen en el payload
    const merged = {
      ...existing,
      ...payload,
      nombre: payload.nombre ?? existing.nombre,
      precio: payload.precio ?? existing.precio,
      stock: payload.stock ?? existing.stock,
    };
    const { cleanData, warnings } = cleanItemInput(merged);

    // Actualiza la fila en PostgreSQL
    const updated = await this.catalogRepository.updateItem(id, {
      sku: payload.sku ? cleanData.sku : existing.sku,
      nombre: cleanData.nombre,
      nombreNormalizado: cleanData.nombreNormalizado,
      categoriaId: payload.categoriaId ?? payload.categoria_id ?? existing.categoria_id,
      precio: cleanData.precio,
      stock: cleanData.stock,
      estado: payload.estado ?? existing.estado,
    });

    return { item: updated, warnings };
  }

  /**
   * Elimina un ítem del inventario por ID.
   * Se dispara desde `OperationalController.deleteItem` al recibir `DELETE /operational/items/:id`.
   *
   * @param {number} id ID del producto a eliminar.
   * @returns {Promise<Object>} Ítem eliminado.
   */
  async deleteItem(id) {
    const deleted = await this.catalogRepository.deleteItem(id);
    // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!deleted) throw new NotFoundError('Ítem no encontrado');
    return deleted;
  }

  // =========================================================================
  // 4. PEDIDOS MULTICANAL CON CONSULTA, ESTADOS Y DESCUENTO DE INVENTARIO
  // =========================================================================

  /**
   * Consulta el listado paginado de pedidos multicanal almacenados en PostgreSQL.
   * Se dispara desde `OperationalController.listOperationalOrders` al recibir `GET /operational/orders`.
   *
   * @param {number} [page=1] Número de página (base 1).
   * @param {number} [pageSize=20] Cantidad de pedidos por página.
   * @returns {Promise<{ orders: Array<Object>, total: number, page: number, pageSize: number, totalPages: number }>}
   */
  async listOperationalOrders(page = 1, pageSize = 20) {
    // Aseguramos números enteros válidos con respaldo seguro (1 y 20)
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedPageSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    // Consultamos en paralelo la página solicitada y todos los pedidos para resumir conteos por estado
    const [paginated, allOrders] = await Promise.all([
      this.orderRepository.findAll(parsedPage, parsedPageSize),
      this.orderRepository.findAllUnpaginated(),
    ]);

    // Calculamos en una pasada O(n) el conteo y dinero acumulado por cada estado del ciclo de vida
    const statusSummary = {
      Requested: { count: 0, totalAmount: 0 },
      'In Progress': { count: 0, totalAmount: 0 },
      Delivered: { count: 0, totalAmount: 0 },
      Cancelled: { count: 0, totalAmount: 0 },
    };

    for (const ord of allOrders) {
      const bucket = statusSummary[ord.status] || statusSummary.Requested;
      bucket.count += 1;
      bucket.totalAmount = Number((bucket.totalAmount + Number(ord.total || 0)).toFixed(2));
    }

    return {
      ...paginated,
      statusSummary,
    };
  }

  /**
   * Actualiza el estado del ciclo de vida de un pedido (`Requested`, `In Progress`, `Delivered`, `Cancelled`).
   * Si el nuevo estado es `Cancelled`, delega automáticamente en `cancelOrder` para reintegrar el stock.
   * Se dispara desde `OperationalController.updateOperationalOrderStatus` (`PATCH /operational/orders/:id/status`).
   *
   * @param {number} orderId ID del pedido.
   * @param {string} status Nuevo estado solicitado.
   * @returns {Promise<Object>} Pedido actualizado (y detalle de stock restaurado si se anuló).
   */
  async updateOperationalOrderStatus(orderId, status) {
    // Validación única de dominio: verifica que el estado pertenezca al catálogo inmutable `VALID_ORDER_STATUSES`
    if (!VALID_ORDER_STATUSES.includes(status)) {
      throw new ValidationError(`Estado inválido. Permitidos: ${VALID_ORDER_STATUSES.join(', ')}`);
    }

    // Si se solicita cancelar desde el selector de estados, ejecutamos el flujo completo con devolución de inventario
    if (status === ORDER_STATUS.CANCELLED) {
      return this.cancelOrder(orderId);
    }

    // Verificamos existencia del pedido una única vez antes de actualizar
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError('Pedido no encontrado');
    }

    const updatedOrder = await this.orderRepository.updateStatus(orderId, status);
    return { order: updatedOrder };
  }

  /**
   * Crea un pedido multicanal (`presencial`, `web`, `app`, `domicilio`), verifica disponibilidad de inventario,
   * descuenta automáticamente las unidades vendidas, liquida subtotal/descuento/IVA (19%)/total y opcionalmente
   * emite su factura encadenada en el mismo flujo.
   * Se dispara desde `OperationalController.createOperationalOrder` al recibir `POST /operational/orders`.
   *
   * @param {Object} [payload={}] Detalle del pedido multicanal.
   * @returns {Promise<{ order: Object, stockAdjustments: Array<Object>, invoice: Object|null }>}
   */
  async createOperationalOrder(payload = {}) {
    // Admite la colección de líneas bajo `items` o `products`
    const rawItems = payload.items || payload.products || [];
    // Validación de regla de negocio: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ValidationError('El pedido debe incluir al menos un ítem');
    }

    // Normaliza el canal hacia uno de los cuatro canales canónicos del dominio
    const canal = normalizeChannel(payload.canal || payload.channel || 'presencial');
    let customerName = payload.customer || payload.cliente || 'Cliente Mostrador';
    const usuarioId = payload.usuarioId ? Number(payload.usuarioId) : null;
    const empleadoId = payload.empleadoId ? Number(payload.empleadoId) : null;

    // Si se especificó `usuarioId`, enriquece el nombre del cliente desde el maestro de usuarios
    if (usuarioId) {
      const userObj = await this.userRepository.findById(usuarioId);
      if (userObj) {
        customerName = userObj.nombre || userObj.email;
      }
    }

    const normalizedProducts = [];
    const stockAdjustments = [];

    // Procesa línea por línea resolviendo el ítem en catálogo y descontando stock disponible
    for (const entry of rawItems) {
      const quantity = Math.max(1, parseInt(entry.quantity ?? entry.cantidad ?? 1, 10) || 1);
      let catalogItem = null;

      // Localiza el producto por ID directo o por llave canónica del nombre
      if (entry.itemId || entry.id) {
        catalogItem = await this.catalogRepository.findItemById(entry.itemId || entry.id);
      } else if (entry.name || entry.nombre) {
        catalogItem = await this.catalogRepository.findItemByNormalizedName(
          toCanonicalKey(entry.name || entry.nombre)
        );
      }

      if (catalogItem) {
        // Validación de inventario suficiente: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en HTTP
        if (Number(catalogItem.stock) < quantity) {
          throw new ValidationError(
            `Stock insuficiente para '${catalogItem.nombre}' (Disponible: ${catalogItem.stock}, Solicitado: ${quantity})`
          );
        }
        // Descuenta atómicamente las unidades vendidas (`-quantity`) en `CatalogRepository`
        const updatedItem = await this.catalogRepository.adjustStock(
          catalogItem.id,
          -quantity
        );
        // Registra trazabilidad exacta del movimiento de kardex/stock
        stockAdjustments.push({
          itemId: catalogItem.id,
          nombre: catalogItem.nombre,
          previousStock: Number(catalogItem.stock),
          deducted: quantity,
          remainingStock: Number(updatedItem.stock),
        });
        // Toma el precio oficial vigente del catálogo para impedir manipulación de precios desde el cliente
        normalizedProducts.push({
          itemId: catalogItem.id,
          sku: catalogItem.sku,
          name: catalogItem.nombre,
          quantity,
          price: Number(catalogItem.precio),
        });
      } else {
        // Permite ítems libres eventuales fuera de catálogo asegurando precio mínimo positivo
        const cleanPrice = Math.max(100, Number(entry.price ?? entry.precio ?? 5000));
        normalizedProducts.push({
          name: String(entry.name || entry.nombre || 'Producto'),
          quantity,
          price: cleanPrice,
        });
      }
    }

    // Calcula subtotal bruto sumando precio * cantidad de cada línea
    const subtotal = normalizedProducts.reduce(
      (sum, p) => sum + Number(p.price) * Number(p.quantity),
      0
    );
    // Acota el porcentaje de descuento entre 0% y 80%
    const porcentajeDescuento = Math.min(
      80,
      Math.max(0, Number(payload.porcentajeDescuento ?? 0))
    );
    // Liquida descuento comercial, base gravable neta, IVA del 19% y gran total
    const descuento = Number(((subtotal * porcentajeDescuento) / 100).toFixed(2));
    const baseGravable = Math.max(0, subtotal - descuento);
    const impuestos = Number((baseGravable * 0.19).toFixed(2));
    const total = Number((baseGravable + impuestos).toFixed(2));

    // Persiste el pedido extendido con todos sus metadatos tributarios y multicanal
    const order = await this.orderRepository.createExtended({
      customer: customerName,
      products: normalizedProducts,
      status: payload.status || 'Requested',
      usuarioId,
      empleadoId,
      canal,
      subtotal,
      descuento,
      impuestos,
      total,
    });

    // Si `autoGenerateInvoice` es verdadero, emite inmediatamente la factura con hash encadenado
    let invoice = null;
    if (payload.autoGenerateInvoice) {
      const invRes = await this.generateInvoice({
        pedidoId: order.id,
        usuarioId,
        empleadoId,
        canal,
        porcentajeDescuento,
      });
      invoice = invRes.invoice;
    }

    return {
      order,
      stockAdjustments,
      invoice,
    };
  }

  /**
   * Cancela un pedido existente revirtiendo (reintegrando) al inventario las cantidades descontadas.
   * Se dispara desde `OperationalController.cancelOrder` al recibir `POST /operational/orders/:id/cancel`.
   *
   * @param {number} orderId ID del pedido a cancelar.
   * @returns {Promise<{ order: Object, restoredStock: Array<Object> }>}
   */
  async cancelOrder(orderId) {
    const order = await this.orderRepository.findById(orderId);
    // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!order) throw new NotFoundError('Pedido no encontrado');

    // Recorre las líneas vinculadas a catálogo (`itemId`) sumando de vuelta las unidades al stock
    const restoredStock = [];
    for (const prod of order.products || []) {
      if (prod.itemId) {
        const updatedItem = await this.catalogRepository.adjustStock(
          prod.itemId,
          Number(prod.quantity || 1)
        );
        if (updatedItem) {
          restoredStock.push({
            itemId: prod.itemId,
            nombre: updatedItem.nombre,
            restored: Number(prod.quantity || 1),
            newStock: Number(updatedItem.stock),
          });
        }
      }
    }

    // Marca el pedido como `Cancelled` en el repositorio
    const updatedOrder = await this.orderRepository.updateStatus(orderId, 'Cancelled');
    return {
      order: updatedOrder,
      restoredStock,
    };
  }

  // =========================================================================
  // 5. FACTURACIÓN CON IMPUESTOS, DESCUENTOS, CONSECUTIVO Y HASH ENCADENADO
  // =========================================================================

  /**
   * Lista todas las facturas emitidas con su estado y hashes de integridad.
   * Se dispara desde `OperationalController.listInvoices` (`GET /operational/invoices`) y `getExecutiveSummary`.
   *
   * @returns {Promise<Array<Object>>} Colección de facturas.
   */
  async listInvoices() {
    return this.billingRepository.listInvoices();
  }

  /**
   * Genera una factura fiscal interna calculando impuestos/descuentos, asignando consecutivo único,
   * encadenando criptográficamente su `hashActual` con el `prevHash` de la factura anterior (`computeInvoiceChainHash`)
   * y evaluándola en tiempo real con la red neuronal Keras (`aiService.classifyOperation`).
   * Se dispara desde `OperationalController.createInvoice` (`POST /operational/invoices`) o desde `createOperationalOrder`.
   *
   * @param {Object} [payload={}] Datos de facturación.
   * @returns {Promise<{ invoice: Object, warnings: string[], aiClassification: Object|null }>}
   */
  async generateInvoice(payload = {}) {
    // Si la factura referencia un pedido existente, verifica su existencia y recupera sus importes
    let pedido = null;
    if (payload.pedidoId) {
      pedido = await this.orderRepository.findById(payload.pedidoId);
      // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en HTTP
      if (!pedido) throw new NotFoundError('El pedido indicado para facturar no existe');
    }

    // Determina el subtotal desde el payload explícito o desde el pedido asociado
    const subtotal =
      payload.subtotal !== undefined
        ? Number(payload.subtotal)
        : pedido
          ? Number(pedido.subtotal || pedido.totalAmount())
          : 0;

    // Validación de regla de negocio financiera: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en HTTP
    if (subtotal <= 0) {
      throw new ValidationError('El subtotal de la factura debe ser mayor a 0');
    }

    // Calcula descuento en dinero y porcentaje efectivo real sobre el subtotal
    const porcentajeDescuento = Math.min(
      90,
      Math.max(0, Number(payload.porcentajeDescuento ?? 0))
    );
    const descuento =
      payload.descuento !== undefined
        ? Number(payload.descuento)
        : Number(((subtotal * porcentajeDescuento) / 100).toFixed(2));

    const effectiveDiscountPct =
      subtotal > 0 ? Number(((descuento / subtotal) * 100).toFixed(2)) : 0;

    // Liquida base gravable e impuesto (19% IVA por defecto)
    const porcentajeImpuesto = Number(payload.porcentajeImpuesto ?? 19);
    const baseGravable = Math.max(0, subtotal - descuento);
    const impuestos = Number(((baseGravable * porcentajeImpuesto) / 100).toFixed(2));
    const total = Number((baseGravable + impuestos).toFixed(2));

    // Obtiene el siguiente consecutivo (`FAC-XXXX`) y el último hash de la cadena de facturas (o `GENESIS_INVOICE_HASH`)
    const numeroConsecutivo = await this.billingRepository.getNextInvoiceConsecutive();
    const prevHash = await this.billingRepository.getLastInvoiceHash();
    const usuarioId = payload.usuarioId ?? pedido?.usuarioId ?? null;
    const empleadoId = payload.empleadoId ?? pedido?.empleadoId ?? null;
    const canal = normalizeChannel(payload.canal ?? pedido?.canal ?? 'presencial');

    // Calcula el eslabón HMAC-SHA256 inmutable que enlaza todos los valores financieros de esta factura con `prevHash`
    const hashActual = computeInvoiceChainHash(
      {
        numeroConsecutivo,
        pedidoId: pedido?.id || 0,
        usuarioId: usuarioId || 0,
        canal,
        subtotal,
        descuento,
        impuestos,
        total,
        prevHash,
      },
      this.secret
    );

    // Persiste la factura sellada en la tabla `facturas`
    const invoice = await this.billingRepository.createInvoice({
      numeroConsecutivo,
      pedidoId: pedido?.id || null,
      usuarioId,
      empleadoId,
      canal,
      subtotal,
      descuento,
      porcentajeDescuento: effectiveDiscountPct,
      impuestos,
      porcentajeImpuesto,
      total,
      estado: 'Emitida',
      prevHash,
      hashActual,
    });

    // Genera advertencia inmediata de control interno si el descuento supera la política comercial del 30%
    const warnings = [];
    if (effectiveDiscountPct > 30) {
      warnings.push(
        `ALERTA DE FRAUDE / CONTROL: Descuento abusivo del ${effectiveDiscountPct}% aplicado en factura ${numeroConsecutivo}`
      );
    }

    // Si `AiService` está disponible, ejecuta inferencia neuronal Keras para puntuar el riesgo de la factura
    let aiClassification = null;
    if (this.aiService) {
      aiClassification = await this.aiService.classifyOperation({
        monto: total,
        fecha: invoice.created_at,
        metodoPago: 'Tarjeta',
        firmaValida: true,
        frecuencia: 1,
        porcentajeDescuento: effectiveDiscountPct,
        canal,
      });
    }

    return {
      invoice,
      warnings,
      aiClassification,
    };
  }

  /**
   * Anula una factura existente y levanta alerta de auditoría cuando el monto es alto ($\ge \$50.000$)
   * o la factura ya figuraba como `Pagada`.
   * Se dispara desde `OperationalController.cancelInvoice` al recibir `POST /operational/invoices/:id/cancel`.
   *
   * @param {number} invoiceId ID de la factura a anular.
   * @param {string} [reason='Solicitud de anulación'] Motivo registrado.
   * @returns {Promise<{ invoice: Object, reason: string, suspiciousAlert: string|null }>}
   */
  async cancelInvoice(invoiceId, reason = 'Solicitud de anulación') {
    const invoice = await this.billingRepository.findInvoiceById(invoiceId);
    // Validación de existencia: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!invoice) throw new NotFoundError('Factura no encontrada');

    // Actualiza el estado a `Anulada` en la base de datos
    const updated = await this.billingRepository.updateInvoiceStatus(invoiceId, 'Anulada');
    // Evalúa criterio de sospecha por monto significativo o reversión post-pago
    const isSuspicious = Number(invoice.total) >= 50000 || invoice.estado === 'Pagada';

    return {
      invoice: updated,
      reason,
      suspiciousAlert: isSuspicious
        ? `Anulación sospechosa detectada sobre factura ${invoice.numero_consecutivo} ($${Number(invoice.total).toLocaleString()})`
        : null,
    };
  }

  // =========================================================================
  // 6. PAGOS CON COMPROBANTE ADJUNTO Y HASH ENCADENADO
  // =========================================================================

  /**
   * Lista todos los pagos registrados con el estado de su comprobante y cadena criptográfica.
   * Se dispara desde `OperationalController.listPayments` (`GET /operational/payments`) y `getExecutiveSummary`.
   *
   * @returns {Promise<Array<Object>>} Colección de pagos.
   */
  async listPayments() {
    return this.billingRepository.listPayments();
  }

  /**
   * Procesa el pago de una factura verificando autenticidad, unicidad y concordancia de monto del comprobante
   * (`validatePaymentReceipt`), encadenando el pago con el hash anterior (`computePaymentChainHash`),
   * actualizando estados de factura/pedido si es válido y clasificando la operación con Keras.
   * Se dispara desde `OperationalController.processPayment` al recibir `POST /operational/payments`.
   *
   * @param {Object} [payload={}] Datos del pago y metadatos del comprobante digital.
   * @returns {Promise<{ payment: Object, receiptValidation: Object, aiClassification: Object|null }>}
   */
  async processPayment(payload = {}) {
    // Validación de regla de negocio: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!payload.facturaId) {
      throw new ValidationError('facturaId es obligatorio para procesar un pago');
    }

    // Busca la factura a pagar
    const invoice = await this.billingRepository.findInvoiceById(payload.facturaId);
    // Validación de existencia referencial: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en HTTP
    if (!invoice) {
      throw new NotFoundError('La factura asociada al pago no existe');
    }

    // Determina monto pagado, medio de pago y referencia única del soporte documental
    const monto = Number(payload.monto ?? invoice.total);
    const metodoPago = String(payload.metodoPago || 'Tarjeta').trim();
    const referenciaComprobante = String(
      payload.referenciaComprobante || `COMP-${Date.now().toString().slice(-6)}`
    ).trim();

    // Construye metadatos auditables del archivo/pasarela del comprobante
    const comprobanteMetadata = {
      entidad: payload.entidadComprobante || 'PASARELA_APPRESSO',
      archivoNombre:
        payload.archivoComprobante || `comprobante_${referenciaComprobante.toLowerCase()}.pdf`,
      montoComprobante:
        payload.montoComprobante !== undefined ? Number(payload.montoComprobante) : monto,
      observaciones: payload.observaciones || 'Comprobante adjunto digitalmente',
    };

    // Obtiene todas las referencias previas de comprobantes para impedir reutilización fraudulenta de soportes
    const existingReceiptRefs = await this.billingRepository.getAllReceiptReferences();

    // Ejecuta la validación criptográfica y documental pura de dominio sobre el comprobante
    const receiptCheck = validatePaymentReceipt({
      payment: {
        facturaId: invoice.id,
        monto,
        metodoPago,
        referenciaComprobante,
        comprobanteMetadata,
        comprobanteHash: payload.comprobanteHash,
      },
      invoice,
      existingReceiptRefs,
      secret: this.secret,
    });

    // Recupera el último hash de la cadena de pagos (o `GENESIS_PAYMENT_HASH`)
    const prevHash = await this.billingRepository.getLastPaymentHash();
    const usuarioId = payload.usuarioId ?? invoice.usuario_id ?? null;
    const pedidoId = invoice.pedido_id ?? null;

    // Calcula el hash encadenado inmutable del nuevo eslabón de pago
    const hashActual = computePaymentChainHash(
      {
        facturaId: invoice.id,
        pedidoId: pedidoId || 0,
        usuarioId: usuarioId || 0,
        monto,
        metodoPago,
        referenciaComprobante,
        comprobanteHash: receiptCheck.comprobanteHash,
        prevHash,
      },
      this.secret
    );

    // Define el estado según el dictamen del validador de comprobantes ('Aprobado' vs 'Sospechoso')
    const estadoPago = receiptCheck.isValid ? 'Aprobado' : 'Sospechoso';

    // Registra el pago en la tabla `pagos` (incluso si es sospechoso, para trazabilidad forense)
    const payment = await this.billingRepository.createPayment({
      facturaId: invoice.id,
      pedidoId,
      usuarioId,
      monto,
      metodoPago,
      referenciaComprobante,
      comprobanteMetadata,
      comprobanteHash: receiptCheck.comprobanteHash,
      comprobanteValido: receiptCheck.isValid,
      estado: estadoPago,
      prevHash,
      hashActual,
    });

    // Solo cuando el comprobante es íntegro y válido se marca la factura como `Pagada` y el pedido como `Delivered`
    if (receiptCheck.isValid) {
      await this.billingRepository.updateInvoiceStatus(invoice.id, 'Pagada');
      if (pedidoId) {
        await this.orderRepository.updateStatus(pedidoId, 'Delivered');
      }
    }

    // Evalúa el pago recién registrado con el clasificador neuronal Keras
    let aiClassification = null;
    if (this.aiService) {
      aiClassification = await this.aiService.classifyOperation({
        monto,
        fecha: payment.fecha_pago,
        metodoPago,
        firmaValida: receiptCheck.isValid,
        frecuencia: 1,
        porcentajeDescuento: Number(invoice.porcentaje_descuento || 0),
        canal: invoice.canal || 'presencial',
      });
    }

    return {
      payment,
      receiptValidation: receiptCheck,
      aiClassification,
    };
  }

  // =========================================================================
  // 7. VERIFICACIÓN Y SIMULACIÓN DE INTEGRIDAD (HASH ENCADENADO)
  // =========================================================================

  /**
   * Recorre de principio a fin las cadenas criptográficas de facturas y pagos recalculando cada HMAC
   * desde su bloque génesis para detectar cualquier adulteración directa en base de datos.
   * Se dispara desde `OperationalController.verifyIntegrity` (`GET /operational/integrity/verify`),
   * `getExecutiveSummary` y al finalizar `simulateTampering` / `restoreIntegrityChain`.
   *
   * @returns {Promise<Object>} Estado global booleano y reportes detallados de eslabones válidos/comprometidos.
   */
  async verifyIntegrity() {
    // Lee todas las facturas y pagos ordenados cronológicamente
    const [invoices, payments] = await Promise.all([
      this.billingRepository.listInvoices(),
      this.billingRepository.listPayments(),
    ]);

    // Construye índice O(1) de facturas por ID para validar coherencia cruzada pago <-> factura
    const invoicesById = new Map(invoices.map((inv) => [Number(inv.id), inv]));
    // Verifica eslabón por eslabón la cadena de facturas desde `GENESIS_INVOICE_HASH`
    const invoiceChainReport = verifyInvoiceChain(invoices, this.secret);
    // Verifica eslabón por eslabón la cadena de pagos desde `GENESIS_PAYMENT_HASH`
    const paymentChainReport = verifyPaymentChain(payments, invoicesById, this.secret);

    // La integridad global solo es válida si ambas cadenas están 100% intactas
    const isSystemIntegrityValid =
      invoiceChainReport.isChainValid && paymentChainReport.isChainValid;

    return {
      isSystemIntegrityValid,
      checkedAt: new Date().toISOString(),
      invoices: invoiceChainReport,
      payments: paymentChainReport,
    };
  }

  /**
   * Simula un ataque interno a la base de datos alterando el total/descuento de una factura
   * o inyectando una referencia falsa en un pago sin poseer `HMAC_SECRET`, demostrando cómo `verifyIntegrity()`
   * detecta inmediatamente la ruptura del eslabón alterado y su propagación.
   * Se dispara desde `OperationalController.simulateTampering` al recibir `POST /operational/integrity/tamper-demo`.
   *
   * @param {Object} [options={}] Tipo de adulteración (`'invoice_amount'` o `'fake_receipt'`).
   * @returns {Promise<Object>} Reporte de `verifyIntegrity()` evidenciando la corrupción detectada.
   */
  async simulateTampering({ type = 'invoice_amount' } = {}) {
    const invoices = await this.billingRepository.listInvoices();
    const payments = await this.billingRepository.listPayments();

    if (type === 'fake_receipt' && payments.length > 0) {
      // Adultera directamente los campos del último pago simulando un comprobante apócrifo
      const targetPayment = payments[payments.length - 1];
      await this.billingRepository.updatePaymentChainFields(targetPayment.id, {
        referenciaComprobante: 'COMP-FALSO-ALTERADO-999',
        comprobanteValido: false,
        estado: 'Sospechoso',
      });
    } else if (invoices.length > 0) {
      // Adultera directamente el monto y porcentaje de descuento de la primera factura rompiendo su firma HMAC
      const targetInvoice = invoices[0];
      const alteredTotal = Number(targetInvoice.total) + 75000;
      await this.billingRepository.updateInvoiceChainFields(targetInvoice.id, {
        total: alteredTotal,
        porcentajeDescuento: 45,
        estado: 'Alterada',
      });
    }

    // Ejecuta inmediatamente la auditoría para devolver la prueba criptográfica del ataque
    return this.verifyIntegrity();
  }

  /**
   * Saneamiento criptográfico administrativo: recalcula los importes legítimos a partir del subtotal original
   * y reconstruye desde los hashes génesis toda la cadena de facturas y de pagos.
   * Se dispara desde `OperationalController.restoreIntegrity` al recibir `POST /operational/integrity/restore`.
   *
   * @returns {Promise<Object>} Reporte de `verifyIntegrity()` confirmando que el sistema volvió a estado íntegro.
   */
  async restoreIntegrityChain() {
    // 1. Reconstrucción secuencial de la cadena de facturas desde `GENESIS_INVOICE_HASH`
    const invoices = await this.billingRepository.listInvoices();
    let prevInvHash = GENESIS_INVOICE_HASH;

    for (const inv of invoices) {
      // Recalcula descuento legítimo, base gravable, impuestos y total partiendo del `subtotal` inalterado
      const subtotal = Number(inv.subtotal);
      const rawPct = Number(inv.porcentaje_descuento || 0);
      const cleanDiscountPct = rawPct > 30 ? 5 : rawPct;
      const descuento = Number(((subtotal * cleanDiscountPct) / 100).toFixed(2));
      const base = Math.max(0, subtotal - descuento);
      const impuestos = Number(((base * Number(inv.porcentaje_impuesto || 19)) / 100).toFixed(2));
      const total = Number((base + impuestos).toFixed(2));
      const cleanState = inv.estado === 'Alterada' ? 'Pagada' : inv.estado;

      // Recalcula el hash legítimo encadenado con `prevInvHash`
      const newHash = computeInvoiceChainHash(
        {
          numeroConsecutivo: inv.numero_consecutivo,
          pedidoId: inv.pedido_id || 0,
          usuarioId: inv.usuario_id || 0,
          canal: inv.canal || 'presencial',
          subtotal,
          descuento,
          impuestos,
          total,
          prevHash: prevInvHash,
        },
        this.secret
      );

      // Actualiza los campos restaurados en la tabla `facturas`
      await this.billingRepository.updateInvoiceChainFields(inv.id, {
        total,
        descuento,
        porcentajeDescuento: cleanDiscountPct,
        impuestos,
        prevHash: prevInvHash,
        hashActual: newHash,
        estado: cleanState,
      });

      // El hash actual pasa a ser el `prevHash` del siguiente eslabón
      prevInvHash = newHash;
    }

    // 2. Reconstrucción secuencial de la cadena de pagos desde `GENESIS_PAYMENT_HASH`
    const refreshedInvoices = await this.billingRepository.listInvoices();
    const invMap = new Map(refreshedInvoices.map((i) => [Number(i.id), i]));
    const payments = await this.billingRepository.listPayments();
    let prevPayHash = GENESIS_PAYMENT_HASH;

    for (let idx = 0; idx < payments.length; idx++) {
      const pay = payments[idx];
      const inv = invMap.get(Number(pay.factura_id));
      // Alinea el monto pagado con el total restaurado de su factura asociada
      const cleanAmount = inv ? Number(inv.total) : Number(pay.monto);
      // Limpia referencias marcadas con etiquetas de alteración de la demo
      const cleanRef = /FALSO|FAKE|INVALID|ALTERADO/i.test(pay.referencia_comprobante)
        ? `COMP-REST-${String(pay.id).padStart(4, '0')}`
        : pay.referencia_comprobante;

      const cleanMetadata = {
        ...(pay.comprobante_metadata || {}),
        entidad: 'PASARELA_APPRESSO',
        montoComprobante: cleanAmount,
      };

      // Recalcula el hash individual del comprobante limpio
      const cleanReceiptHash = computeReceiptHash(
        {
          facturaId: pay.factura_id,
          metodoPago: pay.metodo_pago,
          montoComprobante: cleanAmount,
          referencia: cleanRef,
          entidad: 'PASARELA_APPRESSO',
        },
        this.secret
      );

      // Recalcula el eslabón de cadena del pago enlazado con `prevPayHash`
      const newPayHash = computePaymentChainHash(
        {
          facturaId: pay.factura_id,
          pedidoId: pay.pedido_id || 0,
          usuarioId: pay.usuario_id || 0,
          monto: cleanAmount,
          metodoPago: pay.metodo_pago,
          referenciaComprobante: cleanRef,
          comprobanteHash: cleanReceiptHash,
          prevHash: prevPayHash,
        },
        this.secret
      );

      // Persiste el pago restaurado y avanza el puntero `prevPayHash`
      await this.billingRepository.updatePaymentChainFields(pay.id, {
        monto: cleanAmount,
        referenciaComprobante: cleanRef,
        comprobanteMetadata: cleanMetadata,
        comprobanteHash: cleanReceiptHash,
        comprobanteValido: true,
        prevHash: prevPayHash,
        hashActual: newPayHash,
        estado: 'Aprobado',
      });

      prevPayHash = newPayHash;
    }

    // Verifica y retorna el dictamen final confirmando 0 registros comprometidos
    return this.verifyIntegrity();
  }
}

module.exports = OperationalService;
