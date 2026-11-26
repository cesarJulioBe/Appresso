/**
 * @file DataQualityService.js
 * @description Caso de uso de Gobierno, Auditoría y Saneamiento Automático de Calidad de Datos:
 * evalúa el puntaje global de salud (`qualityScore` 0..100), detecta duplicados semánticos, precios corruptos,
 * categorías inconsistentes y cadenas mal formateadas, ejecuta deduplicación/fusión referencial en PostgreSQL
 * y permite inyectar datos sucios de demostración controlada.
 *
 * - **Capa arquitectónica:** Aplicación - Casos de Uso (`src/application/quality`).
 * - **Inyección de Dependencias (`container.js`):** Recibe desde `buildContainer()` en `src/container.js`:
 *   - `userRepository`: Instancia de `UserRepository` (`listAll`, `create`, `update`, `delete`).
 *   - `catalogRepository`: Instancia de `CatalogRepository` (`listCategories`, `listItems`, `createCategory`,
 *     `updateCategory`, `deleteCategory`, `createItem`, `updateItem`, `adjustStock`, `deleteItem`).
 *   - `billingRepository`: Instancia de `BillingRepository` (`listInvoices`, `listPayments`, `listQualityReports`, `saveQualityReport`).
 *   - `db`: Pool/adaptador de conexión PostgreSQL para reasignar llaves foráneas antes de fusionar registros duplicados.
 *   - `logger`: Logger contextualizado con `childLogger('DataQualityService')`.
 * - **Controlador HTTP que dispara cada método (`OperationalController` en `src/interfaces/http/routes/operational.routes.js`):**
 *   1. `getQualityReport()` <- `OperationalController.getQualityReport` (`GET /operational/quality/report`)
 *      y `OperationalController.getExecutiveSummary` (`GET /operational/summary`).
 *   2. `runAutoClean()` <- `OperationalController.runAutoClean` (`POST /operational/quality/clean`).
 *   3. `seedDirtyData()` <- `OperationalController.seedDirtyData` (`POST /operational/quality/seed-dirty`).
 * - **Delegación a Dominio y Repositorios:**
 *   - Dominio: `dataCleaner.js` (`toCanonicalKey`, `normalizeDisplayString`, `unifyCategoryName`,
 *     `parseAndCleanPrice`, `normalizeEmail`, `detectDuplicateItems`, `detectDuplicateUsers`,
 *     `detectInconsistentCategories`).
 *   - Repositorios: `UserRepository`, `CatalogRepository`, `BillingRepository` y conexión `db`.
 */

// Reglas puras de dominio para normalización canónica, limpieza de precios/correos y detección de duplicados
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
  /**
   * Construye el servicio de calidad de datos inyectando los repositorios maestros/transaccionales y el cliente `db`.
   *
   * @param {Object} deps Dependencias provistas por `container.js`.
   */
  constructor({
    userRepository,
    catalogRepository,
    billingRepository,
    db,
    logger,
  }) {
    // Repositorio de clientes, empleados y administradores
    this.userRepository = userRepository;
    // Repositorio de categorías e ítems del catálogo
    this.catalogRepository = catalogRepository;
    // Repositorio de facturación, pagos y bitácora histórica de auditorías de calidad
    this.billingRepository = billingRepository;
    // Adaptador SQL usado para actualizar referencias foráneas al fusionar registros duplicados
    this.db = db;
    // Logger contextual del módulo
    this.logger = logger;
  }

  /**
   * Genera el Reporte Integral de Calidad de Datos inspeccionando todas las entidades operativas
   * y calculando el índice porcentual de salud (`qualityScore` de 0 a 100).
   *
   * Se dispara desde `OperationalController.getQualityReport` (`GET /operational/quality/report`),
   * desde `OperationalController.getExecutiveSummary` (`GET /operational/summary`), y antes/después de `runAutoClean()`.
   *
   * @returns {Promise<Object>} Puntaje, estado cualitativo, conteo de hallazgos desglosados y bitácora reciente.
   */
  async getQualityReport() {
    // 1. Consulta en paralelo todas las tablas operativas y las últimas 5 corridas de auditoría
    const [users, categories, items, invoices, payments, history] = await Promise.all([
      this.userRepository.listAll(),
      this.catalogRepository.listCategories(),
      this.catalogRepository.listItems(),
      this.billingRepository.listInvoices(),
      this.billingRepository.listPayments(),
      this.billingRepository.listQualityReports(5),
    ]);

    // 2. Delega en los detectores puros de `dataCleaner.js` la identificación de duplicados y anomalías de catálogo
    const itemAnalysis = detectDuplicateItems(items);
    const userAnalysis = detectDuplicateUsers(users);
    const categoryAnalysis = detectInconsistentCategories(categories);

    // 3. Detecta ítems cuyo nombre visible presenta espacios múltiples, bordes sucios o capitalización desordenada
    const unformattedItems = items.filter(
      (i) => String(i.nombre).trim() !== normalizeDisplayString(i.nombre)
    );
    // Detecta usuarios con nombre desordenado o con correo electrónico mal formado (`wasDirty`)
    const unformattedUsers = users.filter(
      (u) =>
        (u.nombre && String(u.nombre).trim() !== normalizeDisplayString(u.nombre)) ||
        normalizeEmail(u.email, u.nombre).wasDirty
    );

    // 4. Contabiliza anomalías operacionales en facturación (descuento > 30%) y pagos (comprobante inválido/sospechoso)
    const abusiveDiscountInvoices = invoices.filter(
      (inv) => Number(inv.porcentaje_descuento || 0) > 30
    );
    const suspiciousPayments = payments.filter(
      (pay) => pay.comprobante_valido === false || pay.estado === 'Sospechoso'
    );

    // 5. Suma el universo total de registros auditados en las cinco tablas
    const totalRecords =
      users.length + categories.length + items.length + invoices.length + payments.length;

    // Suma todos los defectos encontrados en formato, duplicidad, precios y reglas operativas
    const totalIssues =
      itemAnalysis.totalDuplicateItems +
      itemAnalysis.priceIssues.length +
      unformattedItems.length +
      userAnalysis.totalDuplicateUsers +
      unformattedUsers.length +
      categoryAnalysis.totalInconsistentCategories +
      abusiveDiscountInvoices.length +
      suspiciousPayments.length;

    // Calcula el puntaje porcentual de calidad: 100% menos la proporción de defectos sobre el total de registros (acotado >= 0)
    const rawScore =
      totalRecords > 0
        ? Math.max(0, 100 - (totalIssues / Math.max(1, totalRecords)) * 100)
        : 100;
    const qualityScore = Number(rawScore.toFixed(2));

    // Retorna el diagnóstico completo con clasificación semáforo ('Óptima', 'Aceptable', 'Crítica')
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
   * Ejecuta el pipeline automatizado de saneamiento, estandarización de cadenas, corrección de precios fuera de escala
   * y fusión referencial de registros duplicados (categorías, ítems y usuarios), persistiendo un acta de auditoría.
   *
   * Se dispara desde `OperationalController.runAutoClean` al recibir `POST /operational/quality/clean`.
   *
   * @returns {Promise<Object>} Comparativa `previousScore` vs `newScore`, bitácora `actionsLog` y reporte actualizado.
   */
  async runAutoClean() {
    // Toma fotografía diagnóstica previa a la intervención para medir mejora neta de puntaje
    const beforeReport = await this.getQualityReport();
    // Bitácora descriptiva paso a paso de cada acción correctiva ejecutada
    const actionsLog = [];
    // Contador acumulado de filas normalizadas o fusionadas
    let recordsCorrected = 0;

    // 1. Limpieza y unificación semántica de categorías inconsistentes o duplicadas
    const categories = await this.catalogRepository.listCategories();
    // Mapa `canonicalKey -> categoría principal` en O(1) para detectar colisiones semánticas
    const canonicalCatMap = new Map();

    for (const cat of categories) {
      // Obtiene el nombre estándar de visualización y la llave canónica unificada (sinónimos incluidos)
      const unified = unifyCategoryName(cat.nombre);
      if (!canonicalCatMap.has(unified.canonicalKey)) {
        // Primera vez que aparece esta categoría canónica: se designa como registro maestro
        canonicalCatMap.set(unified.canonicalKey, cat);
        // Si su nombre visible o clave normalizada estaban sucios, los corrige in-place
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
        // Categoría duplicada detectada: migra sus ítems hacia `primaryCat.id` antes de eliminar la fila redundante
        const primaryCat = canonicalCatMap.get(unified.canonicalKey);
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

    // 2. Limpieza de precios mal digitados, formato Title Case de nombres y consolidación de stock en ítems duplicados
    const items = await this.catalogRepository.listItems();
    const canonicalItemMap = new Map();

    for (const item of items) {
      // Limpia espacios y capitalización del nombre del producto
      const cleanName = normalizeDisplayString(item.nombre);
      // Obtiene llave canónica sin tildes ni caracteres especiales
      const canonicalKey = toCanonicalKey(cleanName);
      // Corrige precios en 0, negativos o desproporcionados (> $250.000 COP) aplicando reglas de dominio
      const priceInfo = parseAndCleanPrice(item.precio, {
        defaultPrice: 6500,
        minPrice: 500,
        maxPrice: 250000,
      });

      if (!canonicalItemMap.has(canonicalKey)) {
        // Primer registro de este producto: se conserva como maestro y se sanean sus campos si estaban sucios
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
        // Producto duplicado: transfiere su inventario positivo al ítem maestro y elimina el duplicado
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

    // 3. Normalización de nombres/emails y deduplicación referencial de usuarios registrados más de una vez
    const users = await this.userRepository.listAll();
    const seenUserKeys = new Map();

    for (const user of users) {
      // Estandariza nombre visible y deriva clave canónica
      const cleanName = normalizeDisplayString(user.nombre || user.email?.split('@')[0]);
      const canonicalName = toCanonicalKey(cleanName);
      // Limpia y valida formato del correo electrónico
      const emailCheck = normalizeEmail(user.email, cleanName);
      // Prioriza documento de identidad (>= 5 caracteres) como llave fuerte de deduplicación; si no tiene, usa nombre canónico
      const dedupKey =
        user.documento && String(user.documento).trim().length >= 5
          ? `doc:${toCanonicalKey(user.documento)}`
          : `name:${canonicalName}`;

      if (!seenUserKeys.has(dedupKey) && !seenUserKeys.has(`email:${emailCheck.email}`)) {
        // Usuario único: registra sus llaves en el índice y corrige formato si presentaba suciedad
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
        // Usuario duplicado: reasigna pedidos, facturas, pagos y transacciones al usuario principal antes de borrarlo
        const primaryUser =
          seenUserKeys.get(dedupKey) || seenUserKeys.get(`email:${emailCheck.email}`);
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

    // 4. Calcula el nuevo estado de calidad posterior a la limpieza
    const afterReport = await this.getQualityReport();

    // 5. Persiste el acta histórica de auditoría en `reportes_calidad`
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

    // Devuelve el resumen ejecutivo del proceso de autolimpieza
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
   * Inyecta deliberadamente registros con defectos típicos del mundo real (categoría sinónima desordenada,
   * producto en $0, producto con precio inflado por error de digitación y cliente duplicado por cédula)
   * para demostrar interactivamente la caída del `qualityScore` y su posterior recuperación con `runAutoClean()`.
   *
   * Se dispara desde `OperationalController.seedDirtyData` al recibir `POST /operational/quality/seed-dirty`.
   *
   * @returns {Promise<{ injected: Object, report: Object }>} Registros sucios insertados y nuevo reporte de calidad.
   */
  async seedDirtyData() {
    // Sufijo corto único de 4 dígitos para permitir múltiples ejecuciones consecutivas de la demo sin colisión de SKU/email
    const suffix = Date.now().toString().slice(-4);

    // 1. Inserta directamente en repositorio una categoría con espacios múltiples y sinónimo de 'Café Caliente'
    const dirtyCat = await this.catalogRepository.createCategory({
      nombre: '   bebidas   calientes  cafe  ',
      nombreNormalizado: 'dirty_cat_' + suffix,
      descripcion: 'Categoría con formato inconsistente y duplicada de Café Caliente',
      estado: 'Activa',
    });

    // 2. Inserta ítem duplicado de Cappuccino Artesanal con espaciado irregular y precio inválido ($0)
    const dirtyItem1 = await this.catalogRepository.createItem({
      sku: `DUP-CAP-${suffix}`,
      nombre: '   cappuccino    ARTESANAL  ',
      nombreNormalizado: 'dirty_item_' + suffix,
      categoriaId: dirtyCat.id,
      precio: 0,
      stock: 15,
      estado: 'Activo',
    });

    // 3. Inserta ítem con precio desproporcionado ($980.000 COP) simulando ceros de más al digitar
    const dirtyItem2 = await this.catalogRepository.createItem({
      sku: `ERR-PRE-${suffix}`,
      nombre: '   latte   vainilla   caramel ',
      nombreNormalizado: 'dirty_latte_' + suffix,
      categoriaId: dirtyCat.id,
      precio: 980000,
      stock: 10,
      estado: 'Activo',
    });

    // 4. Inserta cliente duplicado compartiendo documento `CC10203040` con nombre sin normalizar
    const dirtyUser = await this.userRepository.create({
      nombre: '   laura    GOMEZ   ',
      nombreNormalizado: 'dirty_user_' + suffix,
      email: `laura.gomez.duplicada.${suffix}@appresso.co`,
      rol: 'cliente',
      documento: 'CC10203040',
      telefono: '300 111 2233',
      estado: 'Activo',
    });

    // Recalcula inmediatamente el reporte para reflejar los nuevos hallazgos detectados
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
