const {
  toCanonicalKey,
  unifyCategoryName,
  normalizeChannel,
  cleanUserInput,
  cleanItemInput,
} = require('../../domain/quality/dataCleaner');
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
const { ValidationError, NotFoundError } = require('../../domain/errors');

class OperationalService {
  constructor({
    userRepository,
    catalogRepository,
    orderRepository,
    billingRepository,
    aiService = null,
    secret,
    logger,
  }) {
    this.userRepository = userRepository;
    this.catalogRepository = catalogRepository;
    this.orderRepository = orderRepository;
    this.billingRepository = billingRepository;
    this.aiService = aiService;
    this.secret = secret || process.env.HMAC_SECRET || 'appresso_default_hmac_secret';
    this.logger = logger;
  }

  setAiService(aiService) {
    this.aiService = aiService;
  }

  // =========================================================================
  // 1. USUARIOS CON ROLES (cliente, empleado, admin)
  // =========================================================================

  async listUsers() {
    return this.userRepository.listAll();
  }

  async createUser(payload = {}) {
    if (!payload.nombre && !payload.email) {
      throw new ValidationError('nombre o email son obligatorios para crear un usuario');
    }

    const { cleanData, warnings, wasCleaned } = cleanUserInput(payload);

    // Verificar si ya existe por email si no es una inyección explícita de prueba sucia
    if (!payload.allowDuplicateForTest) {
      const existingByEmail = await this.userRepository.findByEmail(cleanData.email);
      if (existingByEmail) {
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

    const created = await this.userRepository.create(cleanData);
    return {
      user: created,
      deduplicated: false,
      wasCleaned,
      warnings,
    };
  }

  async updateUser(id, payload = {}) {
    const existing = await this.userRepository.findById(id);
    if (!existing) throw new NotFoundError('Usuario no encontrado');

    const merged = { ...existing, ...payload };
    const { cleanData, warnings } = cleanUserInput(merged);
    const updated = await this.userRepository.update(id, cleanData);
    return { user: updated, warnings };
  }

  async deleteUser(id) {
    const deleted = await this.userRepository.delete(id);
    if (!deleted) throw new NotFoundError('Usuario no encontrado');
    return deleted;
  }

  // =========================================================================
  // 2. CATEGORÍAS (con normalización y unificación automática)
  // =========================================================================

  async listCategories() {
    return this.catalogRepository.listCategories();
  }

  async createCategory(payload = {}) {
    if (!payload.nombre) {
      throw new ValidationError('El nombre de la categoría es obligatorio');
    }

    const unified = unifyCategoryName(payload.nombre);
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

  async updateCategory(id, payload = {}) {
    const existing = await this.catalogRepository.findCategoryById(id);
    if (!existing) throw new NotFoundError('Categoría no encontrada');

    const unified = payload.nombre
      ? unifyCategoryName(payload.nombre)
      : {
          displayName: existing.nombre,
          canonicalKey: existing.nombre_normalizado,
        };

    const updated = await this.catalogRepository.updateCategory(id, {
      nombre: unified.displayName,
      nombreNormalizado: unified.canonicalKey,
      descripcion: payload.descripcion ?? existing.descripcion,
      estado: payload.estado ?? existing.estado,
    });

    return { category: updated };
  }

  async deleteCategory(id) {
    const deleted = await this.catalogRepository.deleteCategory(id);
    if (!deleted) throw new NotFoundError('Categoría no encontrada');
    return deleted;
  }

  // =========================================================================
  // 3. ÍTEMS / CATÁLOGO DE PRODUCTOS E INVENTARIO
  // =========================================================================

  async listItems() {
    return this.catalogRepository.listItems();
  }

  async createItem(payload = {}) {
    if (!payload.nombre && !payload.name) {
      throw new ValidationError('El nombre del ítem es obligatorio');
    }

    const { cleanData, warnings, wasCleaned } = cleanItemInput(payload);

    let categoriaId = cleanData.categoriaId ? Number(cleanData.categoriaId) : null;
    if (!categoriaId && cleanData.categoriaNombre) {
      const catResult = await this.createCategory({ nombre: cleanData.categoriaNombre });
      categoriaId = catResult.category.id;
    }

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

  async updateItem(id, payload = {}) {
    const existing = await this.catalogRepository.findItemById(id);
    if (!existing) throw new NotFoundError('Ítem no encontrado');

    const merged = {
      ...existing,
      ...payload,
      nombre: payload.nombre ?? existing.nombre,
      precio: payload.precio ?? existing.precio,
      stock: payload.stock ?? existing.stock,
    };
    const { cleanData, warnings } = cleanItemInput(merged);

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

  async deleteItem(id) {
    const deleted = await this.catalogRepository.deleteItem(id);
    if (!deleted) throw new NotFoundError('Ítem no encontrado');
    return deleted;
  }

  // =========================================================================
  // 4. PEDIDOS MULTICANAL CON DESCUENTO AUTOMÁTICO DE INVENTARIO
  // =========================================================================

  async createOperationalOrder(payload = {}) {
    const rawItems = payload.items || payload.products || [];
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ValidationError('El pedido debe incluir al menos un ítem');
    }

    const canal = normalizeChannel(payload.canal || payload.channel || 'presencial');
    let customerName = payload.customer || payload.cliente || 'Cliente Mostrador';
    let usuarioId = payload.usuarioId ? Number(payload.usuarioId) : null;
    const empleadoId = payload.empleadoId ? Number(payload.empleadoId) : null;

    if (usuarioId) {
      const userObj = await this.userRepository.findById(usuarioId);
      if (userObj) {
        customerName = userObj.nombre || userObj.email;
      }
    }

    const normalizedProducts = [];
    const stockAdjustments = [];

    for (const entry of rawItems) {
      const quantity = Math.max(1, parseInt(entry.quantity ?? entry.cantidad ?? 1, 10) || 1);
      let catalogItem = null;

      if (entry.itemId || entry.id) {
        catalogItem = await this.catalogRepository.findItemById(entry.itemId || entry.id);
      } else if (entry.name || entry.nombre) {
        catalogItem = await this.catalogRepository.findItemByNormalizedName(
          toCanonicalKey(entry.name || entry.nombre)
        );
      }

      if (catalogItem) {
        if (Number(catalogItem.stock) < quantity) {
          throw new ValidationError(
            `Stock insuficiente para '${catalogItem.nombre}' (Disponible: ${catalogItem.stock}, Solicitado: ${quantity})`
          );
        }
        const updatedItem = await this.catalogRepository.adjustStock(
          catalogItem.id,
          -quantity
        );
        stockAdjustments.push({
          itemId: catalogItem.id,
          nombre: catalogItem.nombre,
          previousStock: Number(catalogItem.stock),
          deducted: quantity,
          remainingStock: Number(updatedItem.stock),
        });
        normalizedProducts.push({
          itemId: catalogItem.id,
          sku: catalogItem.sku,
          name: catalogItem.nombre,
          quantity,
          price: Number(catalogItem.precio),
        });
      } else {
        const cleanPrice = Math.max(100, Number(entry.price ?? entry.precio ?? 5000));
        normalizedProducts.push({
          name: String(entry.name || entry.nombre || 'Producto'),
          quantity,
          price: cleanPrice,
        });
      }
    }

    const subtotal = normalizedProducts.reduce(
      (sum, p) => sum + Number(p.price) * Number(p.quantity),
      0
    );
    const porcentajeDescuento = Math.min(
      80,
      Math.max(0, Number(payload.porcentajeDescuento ?? 0))
    );
    const descuento = Number(((subtotal * porcentajeDescuento) / 100).toFixed(2));
    const baseGravable = Math.max(0, subtotal - descuento);
    const impuestos = Number((baseGravable * 0.19).toFixed(2));
    const total = Number((baseGravable + impuestos).toFixed(2));

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

    // Opcionalmente generar factura automática si se solicita
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

  async cancelOrder(orderId) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('Pedido no encontrado');

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

    const updatedOrder = await this.orderRepository.updateStatus(orderId, 'Cancelled');
    return {
      order: updatedOrder,
      restoredStock,
    };
  }

  // =========================================================================
  // 5. FACTURACIÓN CON IMPUESTOS, DESCUENTOS, CONSECUTIVO Y HASH ENCADENADO
  // =========================================================================

  async listInvoices() {
    return this.billingRepository.listInvoices();
  }

  async generateInvoice(payload = {}) {
    let pedido = null;
    if (payload.pedidoId) {
      pedido = await this.orderRepository.findById(payload.pedidoId);
      if (!pedido) throw new NotFoundError('El pedido indicado para facturar no existe');
    }

    const subtotal =
      payload.subtotal !== undefined
        ? Number(payload.subtotal)
        : pedido
          ? Number(pedido.subtotal || pedido.totalAmount())
          : 0;

    if (subtotal <= 0) {
      throw new ValidationError('El subtotal de la factura debe ser mayor a 0');
    }

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

    const porcentajeImpuesto = Number(payload.porcentajeImpuesto ?? 19);
    const baseGravable = Math.max(0, subtotal - descuento);
    const impuestos = Number(((baseGravable * porcentajeImpuesto) / 100).toFixed(2));
    const total = Number((baseGravable + impuestos).toFixed(2));

    const numeroConsecutivo = await this.billingRepository.getNextInvoiceConsecutive();
    const prevHash = await this.billingRepository.getLastInvoiceHash();
    const usuarioId = payload.usuarioId ?? pedido?.usuarioId ?? null;
    const empleadoId = payload.empleadoId ?? pedido?.empleadoId ?? null;
    const canal = normalizeChannel(payload.canal ?? pedido?.canal ?? 'presencial');

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

    const warnings = [];
    if (effectiveDiscountPct > 30) {
      warnings.push(
        `ALERTA DE FRAUDE / CONTROL: Descuento abusivo del ${effectiveDiscountPct}% aplicado en factura ${numeroConsecutivo}`
      );
    }

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

  async cancelInvoice(invoiceId, reason = 'Solicitud de anulación') {
    const invoice = await this.billingRepository.findInvoiceById(invoiceId);
    if (!invoice) throw new NotFoundError('Factura no encontrada');

    const updated = await this.billingRepository.updateInvoiceStatus(invoiceId, 'Anulada');
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

  async listPayments() {
    return this.billingRepository.listPayments();
  }

  async processPayment(payload = {}) {
    if (!payload.facturaId) {
      throw new ValidationError('facturaId es obligatorio para procesar un pago');
    }

    const invoice = await this.billingRepository.findInvoiceById(payload.facturaId);
    if (!invoice) {
      throw new NotFoundError('La factura asociada al pago no existe');
    }

    const monto = Number(payload.monto ?? invoice.total);
    const metodoPago = String(payload.metodoPago || 'Tarjeta').trim();
    const referenciaComprobante = String(
      payload.referenciaComprobante || `COMP-${Date.now().toString().slice(-6)}`
    ).trim();

    const comprobanteMetadata = {
      entidad: payload.entidadComprobante || 'PASARELA_APPRESSO',
      archivoNombre:
        payload.archivoComprobante || `comprobante_${referenciaComprobante.toLowerCase()}.pdf`,
      montoComprobante:
        payload.montoComprobante !== undefined ? Number(payload.montoComprobante) : monto,
      observaciones: payload.observaciones || 'Comprobante adjunto digitalmente',
    };

    const existingReceiptRefs = await this.billingRepository.getAllReceiptReferences();

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

    const prevHash = await this.billingRepository.getLastPaymentHash();
    const usuarioId = payload.usuarioId ?? invoice.usuario_id ?? null;
    const pedidoId = invoice.pedido_id ?? null;

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

    const estadoPago = receiptCheck.isValid ? 'Aprobado' : 'Sospechoso';

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

    if (receiptCheck.isValid) {
      await this.billingRepository.updateInvoiceStatus(invoice.id, 'Pagada');
      if (pedidoId) {
        await this.orderRepository.updateStatus(pedidoId, 'Delivered');
      }
    }

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

  async verifyIntegrity() {
    const [invoices, payments] = await Promise.all([
      this.billingRepository.listInvoices(),
      this.billingRepository.listPayments(),
    ]);

    const invoicesById = new Map(invoices.map((inv) => [Number(inv.id), inv]));
    const invoiceChainReport = verifyInvoiceChain(invoices, this.secret);
    const paymentChainReport = verifyPaymentChain(payments, invoicesById, this.secret);

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
   * Simula una alteración maliciosa sobre una factura o un pago con comprobante falso
   * para demostrar en vivo cómo el verificador de hash encadenado detecta el fraude.
   */
  async simulateTampering({ type = 'invoice_amount' } = {}) {
    const invoices = await this.billingRepository.listInvoices();
    const payments = await this.billingRepository.listPayments();

    if (type === 'fake_receipt' && payments.length > 0) {
      const targetPayment = payments[payments.length - 1];
      await this.billingRepository.updatePaymentChainFields(targetPayment.id, {
        referenciaComprobante: 'COMP-FALSO-ALTERADO-999',
        comprobanteValido: false,
        estado: 'Sospechoso',
      });
    } else if (invoices.length > 0) {
      const targetInvoice = invoices[0];
      // Alterar el total y descuento en BD sin poder recalcular la firma legítima de toda la cadena
      const alteredTotal = Number(targetInvoice.total) + 75000;
      await this.billingRepository.updateInvoiceChainFields(targetInvoice.id, {
        total: alteredTotal,
        porcentajeDescuento: 45,
        estado: 'Alterada',
      });
    }

    return this.verifyIntegrity();
  }

  /**
   * Recalcula y restaura toda la cadena criptográfica de facturas y pagos legítimos.
   */
  async restoreIntegrityChain() {
    const invoices = await this.billingRepository.listInvoices();
    let prevInvHash = GENESIS_INVOICE_HASH;

    for (const inv of invoices) {
      const subtotal = Number(inv.subtotal);
      const rawPct = Number(inv.porcentaje_descuento || 0);
      const cleanDiscountPct = rawPct > 30 ? 5 : rawPct;
      const descuento = Number(((subtotal * cleanDiscountPct) / 100).toFixed(2));
      const base = Math.max(0, subtotal - descuento);
      const impuestos = Number(((base * Number(inv.porcentaje_impuesto || 19)) / 100).toFixed(2));
      const total = Number((base + impuestos).toFixed(2));
      const cleanState = inv.estado === 'Alterada' ? 'Pagada' : inv.estado;

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

      await this.billingRepository.updateInvoiceChainFields(inv.id, {
        total,
        descuento,
        porcentajeDescuento: cleanDiscountPct,
        impuestos,
        prevHash: prevInvHash,
        hashActual: newHash,
        estado: cleanState,
      });

      prevInvHash = newHash;
    }

    const refreshedInvoices = await this.billingRepository.listInvoices();
    const invMap = new Map(refreshedInvoices.map((i) => [Number(i.id), i]));
    const payments = await this.billingRepository.listPayments();
    let prevPayHash = GENESIS_PAYMENT_HASH;

    for (let idx = 0; idx < payments.length; idx++) {
      const pay = payments[idx];
      const inv = invMap.get(Number(pay.factura_id));
      const cleanAmount = inv ? Number(inv.total) : Number(pay.monto);
      const cleanRef = /FALSO|FAKE|INVALID|ALTERADO/i.test(pay.referencia_comprobante)
        ? `COMP-REST-${String(pay.id).padStart(4, '0')}`
        : pay.referencia_comprobante;

      const cleanMetadata = {
        ...(pay.comprobante_metadata || {}),
        entidad: 'PASARELA_APPRESSO',
        montoComprobante: cleanAmount,
      };

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

    return this.verifyIntegrity();
  }
}

module.exports = OperationalService;
