const {
  toCanonicalKey,
  normalizeDisplayString,
  unifyCategoryName,
  parseAndCleanPrice,
  normalizeEmail,
  detectDuplicateItems,
  detectDuplicateUsers,
  detectInconsistentCategories,
} = require('../../domain/quality/dataCleaner');

class DataQualityService {
  constructor({
    userRepository,
    catalogRepository,
    billingRepository,
    db,
    logger,
  }) {
    this.userRepository = userRepository;
    this.catalogRepository = catalogRepository;
    this.billingRepository = billingRepository;
    this.db = db;
    this.logger = logger;
  }

  /**
   * Genera el Reporte Integral de Calidad de Datos evaluando todos los módulos operativos.
   */
  async getQualityReport() {
    const [users, categories, items, invoices, payments, history] = await Promise.all([
      this.userRepository.listAll(),
      this.catalogRepository.listCategories(),
      this.catalogRepository.listItems(),
      this.billingRepository.listInvoices(),
      this.billingRepository.listPayments(),
      this.billingRepository.listQualityReports(5),
    ]);

    const itemAnalysis = detectDuplicateItems(items);
    const userAnalysis = detectDuplicateUsers(users);
    const categoryAnalysis = detectInconsistentCategories(categories);

    // Detectar nombres de ítems o usuarios con formato sucio (espacios extra, mayúsculas desordenadas)
    const unformattedItems = items.filter(
      (i) => String(i.nombre).trim() !== normalizeDisplayString(i.nombre)
    );
    const unformattedUsers = users.filter(
      (u) =>
        (u.nombre && String(u.nombre).trim() !== normalizeDisplayString(u.nombre)) ||
        normalizeEmail(u.email, u.nombre).wasDirty
    );

    const abusiveDiscountInvoices = invoices.filter(
      (inv) => Number(inv.porcentaje_descuento || 0) > 30
    );
    const suspiciousPayments = payments.filter(
      (pay) => pay.comprobante_valido === false || pay.estado === 'Sospechoso'
    );

    const totalRecords =
      users.length + categories.length + items.length + invoices.length + payments.length;

    const totalIssues =
      itemAnalysis.totalDuplicateItems +
      itemAnalysis.priceIssues.length +
      unformattedItems.length +
      userAnalysis.totalDuplicateUsers +
      unformattedUsers.length +
      categoryAnalysis.totalInconsistentCategories +
      abusiveDiscountInvoices.length +
      suspiciousPayments.length;

    const rawScore =
      totalRecords > 0
        ? Math.max(0, 100 - (totalIssues / Math.max(1, totalRecords)) * 100)
        : 100;
    const qualityScore = Number(rawScore.toFixed(2));

    return {
      qualityScore,
      status:
        qualityScore >= 95
          ? 'Óptima'
          : qualityScore >= 80
            ? 'Aceptable (Requiere Limpieza)'
            : 'Crítica (Datos Sucios Detectados)',
      totalRecords,
      totalIssues,
      breakdown: {
        duplicateItems: {
          count: itemAnalysis.totalDuplicateItems,
          groups: itemAnalysis.duplicateGroups,
        },
        malformedPrices: {
          count: itemAnalysis.priceIssues.length,
          items: itemAnalysis.priceIssues,
        },
        inconsistentCategories: {
          count: categoryAnalysis.totalInconsistentCategories,
          formattingIssues: categoryAnalysis.formattingIssues,
          duplicateGroups: categoryAnalysis.duplicateCategoryGroups,
        },
        duplicateUsers: {
          count: userAnalysis.totalDuplicateUsers,
          groups: userAnalysis.duplicateGroups,
        },
        unformattedStrings: {
          itemsCount: unformattedItems.length,
          usersCount: unformattedUsers.length,
        },
        operationalAnomalies: {
          abusiveDiscountsCount: abusiveDiscountInvoices.length,
          suspiciousPaymentsCount: suspiciousPayments.length,
        },
      },
      recentAuditLogs: history,
    };
  }

  /**
   * Ejecuta limpieza, normalización y deduplicación automática sobre todas las tablas operativas.
   */
  async runAutoClean() {
    const beforeReport = await this.getQualityReport();
    const actionsLog = [];
    let recordsCorrected = 0;

    // 1. Limpiar y unificar categorías inconsistentes o duplicadas
    const categories = await this.catalogRepository.listCategories();
    const canonicalCatMap = new Map();

    for (const cat of categories) {
      const unified = unifyCategoryName(cat.nombre);
      if (!canonicalCatMap.has(unified.canonicalKey)) {
        canonicalCatMap.set(unified.canonicalKey, cat);
        if (
          cat.nombre !== unified.displayName ||
          cat.nombre_normalizado !== unified.canonicalKey
        ) {
          await this.catalogRepository.updateCategory(cat.id, {
            nombre: unified.displayName,
            nombreNormalizado: unified.canonicalKey,
            descripcion: cat.descripcion,
            estado: 'Activa',
          });
          recordsCorrected++;
          actionsLog.push(
            `Categoría normalizada: '${cat.nombre}' -> '${unified.displayName}'`
          );
        }
      } else {
        const primaryCat = canonicalCatMap.get(unified.canonicalKey);
        // Reasignar ítems de la categoría duplicada a la principal y eliminar la duplicada
        if (this.db) {
          await this.db.query(
            'UPDATE items SET categoria_id = $1 WHERE categoria_id = $2',
            [primaryCat.id, cat.id]
          );
        }
        await this.catalogRepository.deleteCategory(cat.id);
        recordsCorrected++;
        actionsLog.push(
          `Categoría duplicada '${cat.nombre}' (ID #${cat.id}) fusionada con '${primaryCat.nombre}' (ID #${primaryCat.id})`
        );
      }
    }

    // 2. Limpiar precios mal escritos, normalizar nombres y fusionar ítems duplicados
    const items = await this.catalogRepository.listItems();
    const canonicalItemMap = new Map();

    for (const item of items) {
      const cleanName = normalizeDisplayString(item.nombre);
      const canonicalKey = toCanonicalKey(cleanName);
      const priceInfo = parseAndCleanPrice(item.precio, {
        defaultPrice: 6500,
        minPrice: 500,
        maxPrice: 250000,
      });

      if (!canonicalItemMap.has(canonicalKey)) {
        canonicalItemMap.set(canonicalKey, item);
        const needsUpdate =
          item.nombre !== cleanName ||
          item.nombre_normalizado !== canonicalKey ||
          Number(item.precio) !== priceInfo.cleanPrice;

        if (needsUpdate) {
          await this.catalogRepository.updateItem(item.id, {
            nombre: cleanName,
            nombreNormalizado: canonicalKey,
            precio: priceInfo.cleanPrice,
            stock: Math.max(0, Number(item.stock || 0)),
          });
          recordsCorrected++;
          actionsLog.push(
            `Ítem limpiado: '${item.nombre}' ($${item.precio}) -> '${cleanName}' ($${priceInfo.cleanPrice})`
          );
        }
      } else {
        const primaryItem = canonicalItemMap.get(canonicalKey);
        const addedStock = Math.max(0, Number(item.stock || 0));
        await this.catalogRepository.adjustStock(primaryItem.id, addedStock);
        await this.catalogRepository.deleteItem(item.id);
        recordsCorrected++;
        actionsLog.push(
          `Ítem duplicado '${item.nombre}' (ID #${item.id}) unificado en '${primaryItem.nombre}' (ID #${primaryItem.id}, +${addedStock} stock)`
        );
      }
    }

    // 3. Normalizar y unificar clientes/usuarios registrados dos veces
    const users = await this.userRepository.listAll();
    const seenUserKeys = new Map();

    for (const user of users) {
      const cleanName = normalizeDisplayString(user.nombre || user.email?.split('@')[0]);
      const canonicalName = toCanonicalKey(cleanName);
      const emailCheck = normalizeEmail(user.email, cleanName);
      const dedupKey =
        user.documento && String(user.documento).trim().length >= 5
          ? `doc:${toCanonicalKey(user.documento)}`
          : `name:${canonicalName}`;

      if (!seenUserKeys.has(dedupKey) && !seenUserKeys.has(`email:${emailCheck.email}`)) {
        seenUserKeys.set(dedupKey, user);
        seenUserKeys.set(`email:${emailCheck.email}`, user);

        if (
          user.nombre !== cleanName ||
          user.nombre_normalizado !== canonicalName ||
          user.email !== emailCheck.email
        ) {
          await this.userRepository.update(user.id, {
            nombre: cleanName,
            nombreNormalizado: canonicalName,
            email: emailCheck.email,
          });
          recordsCorrected++;
          actionsLog.push(
            `Usuario normalizado: '${user.nombre}' (${user.email}) -> '${cleanName}' (${emailCheck.email})`
          );
        }
      } else {
        const primaryUser =
          seenUserKeys.get(dedupKey) || seenUserKeys.get(`email:${emailCheck.email}`);
        // Reasignar referencias antes de eliminar el duplicado
        if (this.db && primaryUser && primaryUser.id !== user.id) {
          await this.db.query(
            'UPDATE orders SET usuario_id = $1 WHERE usuario_id = $2',
            [primaryUser.id, user.id]
          );
          await this.db.query(
            'UPDATE facturas SET usuario_id = $1 WHERE usuario_id = $2',
            [primaryUser.id, user.id]
          );
          await this.db.query(
            'UPDATE pagos SET usuario_id = $1 WHERE usuario_id = $2',
            [primaryUser.id, user.id]
          );
          await this.db.query(
            'UPDATE transacciones SET usuario_id = $1 WHERE usuario_id = $2',
            [primaryUser.id, user.id]
          );
          await this.userRepository.delete(user.id);
          recordsCorrected++;
          actionsLog.push(
            `Cliente duplicado '${user.nombre}' (ID #${user.id}) unificado con registro principal #${primaryUser.id}`
          );
        }
      }
    }

    const afterReport = await this.getQualityReport();

    const savedAudit = await this.billingRepository.saveQualityReport({
      puntajeCalidad: afterReport.qualityScore,
      totalRegistros: afterReport.totalRecords,
      problemasDetectados: beforeReport.totalIssues,
      registrosCorregidos: recordsCorrected,
      detalle: {
        previousScore: beforeReport.qualityScore,
        newScore: afterReport.qualityScore,
        actionsLog,
      },
    });

    return {
      previousScore: beforeReport.qualityScore,
      newScore: afterReport.qualityScore,
      issuesDetectedBefore: beforeReport.totalIssues,
      recordsCorrected,
      actionsLog,
      auditRecord: savedAudit,
      report: afterReport,
    };
  }

  /**
   * Inyecta un conjunto de registros sucios (categorías inconsistentes, ítems duplicados,
   * precios mal escritos y clientes registrados dos veces) para demostrar la detección y limpieza.
   */
  async seedDirtyData() {
    const suffix = Date.now().toString().slice(-4);

    // 1. Categoría inconsistente (espacios y mayúsculas/sinónimo)
    const dirtyCat = await this.catalogRepository.createCategory({
      nombre: '   bebidas   calientes  cafe  ',
      nombreNormalizado: 'dirty_cat_' + suffix,
      descripcion: 'Categoría con formato inconsistente y duplicada de Café Caliente',
      estado: 'Activa',
    });

    // 2. Ítem duplicado con nombre sucio y precio desproporcionado/mal escrito
    const dirtyItem1 = await this.catalogRepository.createItem({
      sku: `DUP-CAP-${suffix}`,
      nombre: '   cappuccino    ARTESANAL  ',
      nombreNormalizado: 'dirty_item_' + suffix,
      categoriaId: dirtyCat.id,
      precio: 0, // precio mal escrito / inválido
      stock: 15,
      estado: 'Activo',
    });

    // 3. Ítem con precio excesivo fuera de escala
    const dirtyItem2 = await this.catalogRepository.createItem({
      sku: `ERR-PRE-${suffix}`,
      nombre: '   latte   vainilla   caramel ',
      nombreNormalizado: 'dirty_latte_' + suffix,
      categoriaId: dirtyCat.id,
      precio: 980000, // precio mal digitado (980.000 en vez de 8.500)
      stock: 10,
      estado: 'Activo',
    });

    // 4. Cliente registrado dos veces con mismo documento y nombre mal formateado
    const dirtyUser = await this.userRepository.create({
      nombre: '   laura    GOMEZ   ',
      nombreNormalizado: 'dirty_user_' + suffix,
      email: `laura.gomez.duplicada.${suffix}@appresso.co`,
      rol: 'cliente',
      documento: 'CC10203040',
      telefono: '300 111 2233',
      estado: 'Activo',
    });

    const report = await this.getQualityReport();
    return {
      injected: {
        dirtyCategory: dirtyCat,
        dirtyItems: [dirtyItem1, dirtyItem2],
        duplicateUser: dirtyUser,
      },
      report,
    };
  }
}

module.exports = DataQualityService;
