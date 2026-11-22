/**
 * Módulo de Limpieza, Normalización y Calidad de Datos (Dominio Puro)
 * Cubre:
 * - Normalización y unificación de strings (O(n))
 * - Limpieza y corrección de precios mal escritos
 * - Unificación de categorías inconsistentes
 * - Detección y fusión de ítems duplicados y clientes registrados dos veces
 * - Validación de esquemas y cálculo de puntaje de calidad de datos
 */

const CATEGORY_SYNONYMS = {
  'cafe caliente': 'Café Caliente',
  'cafes calientes': 'Café Caliente',
  'bebidas calientes cafe': 'Café Caliente',
  'bebida caliente': 'Café Caliente',
  'hot coffee': 'Café Caliente',
  'cafe frio': 'Café Frío',
  'cafes frios': 'Café Frío',
  'bebidas frias': 'Café Frío',
  'cold brew': 'Café Frío',
  'pasteleria': 'Pastelería y Panadería',
  'panaderia': 'Pastelería y Panadería',
  'pasteleria y panaderia': 'Pastelería y Panadería',
  'postres': 'Pastelería y Panadería',
  'reposteria': 'Pastelería y Panadería',
  'desayunos': 'Desayunos y Brunch',
  'desayunos y brunch': 'Desayunos y Brunch',
  'brunch': 'Desayunos y Brunch',
  'accesorios': 'Accesorios y Café en Grano',
  'cafe en grano': 'Accesorios y Café en Grano',
  'accesorios y cafe en grano': 'Accesorios y Café en Grano',
};

const ROLE_SYNONYMS = {
  cliente: 'cliente',
  customer: 'cliente',
  comprador: 'cliente',
  empleado: 'empleado',
  employee: 'empleado',
  cajero: 'empleado',
  barista: 'empleado',
  vendedor: 'empleado',
  admin: 'admin',
  administrador: 'admin',
  gerente: 'admin',
};

const CHANNEL_SYNONYMS = {
  presencial: 'presencial',
  tienda: 'presencial',
  local: 'presencial',
  pos: 'presencial',
  web: 'web',
  pagina: 'web',
  online: 'web',
  app: 'app',
  movil: 'app',
  aplicacion: 'app',
  domicilio: 'domicilio',
  delivery: 'domicilio',
  reparto: 'domicilio',
};

/**
 * Elimina tildes/diacríticos, caracteres especiales repetidos y espacios extra.
 * Complejidad: O(L) donde L es la longitud del string.
 */
function toCanonicalKey(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza un texto legible manteniendo tildes correctas y formato Title Case limpio.
 */
function normalizeDisplayString(input) {
  if (input === null || input === undefined) return '';
  const collapsed = String(input)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!collapsed) return '';

  return collapsed
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (['de', 'del', 'la', 'el', 'y', 'en', 'con', 'al'].includes(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .replace(/^([a-záéíóúñ])/, (m) => m.toUpperCase());
}

/**
 * Unifica nombres de categorías inconsistentes a su nombre canónico estándar.
 */
function unifyCategoryName(rawCategory) {
  const key = toCanonicalKey(rawCategory);
  if (!key) {
    return {
      canonicalKey: 'general',
      displayName: 'General',
      wasInconsistent: true,
      reason: 'Categoría vacía normalizada a General',
    };
  }

  if (CATEGORY_SYNONYMS[key]) {
    const unified = CATEGORY_SYNONYMS[key];
    const unifiedKey = toCanonicalKey(unified);
    const rawTrimmed = String(rawCategory).trim();
    return {
      canonicalKey: unifiedKey,
      displayName: unified,
      wasInconsistent: rawTrimmed !== unified,
      reason: rawTrimmed !== unified ? `Unificada '${rawTrimmed}' -> '${unified}'` : null,
    };
  }

  const displayName = normalizeDisplayString(rawCategory);
  return {
    canonicalKey: key,
    displayName,
    wasInconsistent: String(rawCategory).trim() !== displayName,
    reason:
      String(rawCategory).trim() !== displayName
        ? `Formato normalizado '${rawCategory}' -> '${displayName}'`
        : null,
  };
}

/**
 * Limpia y corrige precios mal escritos:
 * Ejemplos soportados: "$ 12.500,00", "12,500", "-8500", "8500 COP", "12..500", "gratis"
 */
function parseAndCleanPrice(rawPrice, { defaultPrice = 5000, minPrice = 100, maxPrice = 5000000 } = {}) {
  const issues = [];
  let wasDirty = false;

  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) {
    let val = rawPrice;
    if (val < 0) {
      issues.push(`Precio negativo (${val}) convertido a valor absoluto`);
      val = Math.abs(val);
      wasDirty = true;
    }
    if (val === 0 || val < minPrice) {
      issues.push(`Precio fuera de rango mínimo (${val}) ajustado a ${defaultPrice}`);
      val = defaultPrice;
      wasDirty = true;
    }
    if (val > maxPrice) {
      issues.push(`Precio excesivo (${val}) ajustado a tope ${maxPrice}`);
      val = maxPrice;
      wasDirty = true;
    }
    return {
      cleanPrice: Math.round(val * 100) / 100,
      wasDirty,
      issues,
    };
  }

  const rawStr = String(rawPrice ?? '').trim();
  if (!rawStr) {
    return {
      cleanPrice: defaultPrice,
      wasDirty: true,
      issues: [`Precio vacío reemplazado por valor base ${defaultPrice}`],
    };
  }

  const isNegative = rawStr.includes('-');
  if (isNegative) {
    wasDirty = true;
    issues.push(`Signo negativo detectado en '${rawStr}'`);
  }

  // Detectar caracteres no numéricos como '$', 'COP', letras o espacios
  if (/[^0-9.]/.test(rawStr)) {
    wasDirty = true;
    issues.push(`Formato de precio sucio '${rawStr}' limpiado`);
  }

  // Manejo de separadores de miles colombianos/latinos: "12.500,00" o "12,500.00" o "12.500"
  let normalized = rawStr.replace(/[^0-9.,]/g, '');

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    // Formato "12.500" o "12.500,50" -> quitar puntos de miles y cambiar coma por punto
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    // Formato "12,500" o "12,500.50" -> quitar comas de miles
    normalized = normalized.replace(/,/g, '');
  } else {
    // Múltiples puntos o comas mal escritos como "12..500" o "8,500"
    const parts = normalized.split(/[.,]+/).filter(Boolean);
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 3) {
        normalized = parts.join('');
      } else {
        normalized = parts.slice(0, -1).join('') + '.' + lastPart;
      }
    } else {
      normalized = parts[0] || '';
    }
  }

  let parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    issues.push(`Valor no numérico '${rawStr}' corregido a ${defaultPrice}`);
    parsed = defaultPrice;
    wasDirty = true;
  } else if (parsed < minPrice) {
    // Si alguien escribió "8.5" queriendo decir "8500" en pesos
    if (parsed < 100 && rawStr.includes('.')) {
      issues.push(`Posible separador de miles mal interpretado en '${rawStr}', escalado x1000`);
      parsed = parsed * 1000;
      wasDirty = true;
    } else {
      issues.push(`Precio inferior al mínimo (${parsed}) ajustado a ${ minPrice }`);
      parsed = minPrice;
      wasDirty = true;
    }
  } else if (parsed > maxPrice) {
    issues.push(`Precio superior al límite (${parsed}) ajustado a ${maxPrice}`);
    parsed = maxPrice;
    wasDirty = true;
  }

  return {
    cleanPrice: Math.round(parsed * 100) / 100,
    wasDirty,
    issues,
  };
}

/**
 * Normaliza un correo electrónico y corrige errores comunes de tipeo.
 */
function normalizeEmail(rawEmail, fallbackName = 'usuario') {
  const str = String(rawEmail ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/@@+/g, '@')
    .replace(/\.com\.com$/i, '.com')
    .replace(/,com$/i, '.com')
    .trim();

  if (!str || !str.includes('@')) {
    const slug = toCanonicalKey(fallbackName).replace(/\s+/g, '.') || 'cliente';
    return {
      email: `${slug}@appresso.co`,
      wasDirty: true,
      issue: `Email inválido '${rawEmail}' normalizado a '${slug}@appresso.co'`,
    };
  }

  const [local, domain] = str.split('@');
  const cleanDomain = domain && domain.includes('.') ? domain : `${domain || 'appresso'}.com`;
  const cleanEmail = `${local || 'cliente'}@${cleanDomain}`;

  return {
    email: cleanEmail,
    wasDirty: cleanEmail !== String(rawEmail ?? '').trim(),
    issue:
      cleanEmail !== String(rawEmail ?? '').trim()
        ? `Email limpiado '${rawEmail}' -> '${cleanEmail}'`
        : null,
  };
}

/**
 * Normaliza rol de usuario ('cliente' | 'empleado' | 'admin')
 */
function normalizeRole(rawRole) {
  const key = toCanonicalKey(rawRole);
  return ROLE_SYNONYMS[key] || 'cliente';
}

/**
 * Normaliza canal de operación ('presencial' | 'web' | 'app' | 'domicilio')
 */
function normalizeChannel(rawChannel) {
  const key = toCanonicalKey(rawChannel);
  return CHANNEL_SYNONYMS[key] || 'presencial';
}

/**
 * Detecta ítems duplicados en una lista en O(n) usando mapa hash de claves canónicas y SKUs.
 */
function detectDuplicateItems(items = []) {
  const byNameKey = new Map();
  const bySkuKey = new Map();
  const duplicateGroups = [];
  const priceIssues = [];

  for (const item of items) {
    const nameKey = toCanonicalKey(item.nombre || item.name);
    const skuKey = item.sku ? toCanonicalKey(item.sku) : null;
    const priceCheck = parseAndCleanPrice(item.precio ?? item.price);

    if (priceCheck.wasDirty || Number(item.precio) <= 0 || Number(item.precio) > 500000) {
      priceIssues.push({
        id: item.id,
        nombre: item.nombre,
        precioOriginal: item.precio,
        precioSugerido: priceCheck.cleanPrice,
        issues: priceCheck.issues,
      });
    }

    if (nameKey) {
      if (!byNameKey.has(nameKey)) {
        byNameKey.set(nameKey, []);
      }
      byNameKey.get(nameKey).push(item);
    }

    if (skuKey) {
      if (!bySkuKey.has(skuKey)) {
        bySkuKey.set(skuKey, []);
      }
      bySkuKey.get(skuKey).push(item);
    }
  }

  for (const [canonicalName, group] of byNameKey.entries()) {
    if (group.length > 1) {
      duplicateGroups.push({
        criterion: 'nombre_normalizado',
        canonicalKey: canonicalName,
        count: group.length,
        primaryId: group[0].id,
        duplicateIds: group.slice(1).map((i) => i.id),
        items: group.map((i) => ({
          id: i.id,
          sku: i.sku,
          nombre: i.nombre,
          precio: Number(i.precio),
          stock: Number(i.stock ?? 0),
        })),
      });
    }
  }

  return {
    duplicateGroups,
    totalDuplicateItems: duplicateGroups.reduce((acc, g) => acc + g.duplicateIds.length, 0),
    priceIssues,
  };
}

/**
 * Detecta usuarios/clientes registrados dos o más veces (por email normalizado, nombre canónico o documento).
 */
function detectDuplicateUsers(users = []) {
  const byEmail = new Map();
  const byName = new Map();
  const byDocument = new Map();
  const duplicateGroups = [];
  const seenPairs = new Set();

  for (const user of users) {
    const emailKey = normalizeEmail(user.email, user.nombre).email;
    const nameKey = toCanonicalKey(user.nombre);
    const docKey = user.documento ? toCanonicalKey(user.documento) : '';

    if (emailKey) {
      if (!byEmail.has(emailKey)) byEmail.set(emailKey, []);
      byEmail.get(emailKey).push(user);
    }
    if (nameKey && nameKey.length >= 3) {
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(user);
    }
    if (docKey && docKey.length >= 4) {
      if (!byDocument.has(docKey)) byDocument.set(docKey, []);
      byDocument.get(docKey).push(user);
    }
  }

  const registerGroup = (criterion, key, group) => {
    if (group.length <= 1) return;
    const ids = group.map((u) => u.id).sort((a, b) => a - b);
    const signature = ids.join('-');
    if (seenPairs.has(signature)) return;
    seenPairs.add(signature);

    duplicateGroups.push({
      criterion,
      canonicalKey: key,
      count: group.length,
      primaryId: ids[0],
      duplicateIds: ids.slice(1),
      users: group.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        documento: u.documento,
        rol: u.rol,
      })),
    });
  };

  for (const [k, g] of byEmail.entries()) registerGroup('email_normalizado', k, g);
  for (const [k, g] of byDocument.entries()) registerGroup('documento', k, g);
  for (const [k, g] of byName.entries()) registerGroup('nombre_normalizado', k, g);

  return {
    duplicateGroups,
    totalDuplicateUsers: duplicateGroups.reduce((acc, g) => acc + g.duplicateIds.length, 0),
  };
}

/**
 * Detecta categorías inconsistentes en una lista de categorías.
 */
function detectInconsistentCategories(categories = []) {
  const byCanonical = new Map();
  const formattingIssues = [];

  for (const cat of categories) {
    const unified = unifyCategoryName(cat.nombre);
    if (unified.wasInconsistent) {
      formattingIssues.push({
        id: cat.id,
        nombreOriginal: cat.nombre,
        nombreUnificado: unified.displayName,
        canonicalKey: unified.canonicalKey,
        reason: unified.reason,
      });
    }

    if (!byCanonical.has(unified.canonicalKey)) {
      byCanonical.set(unified.canonicalKey, []);
    }
    byCanonical.get(unified.canonicalKey).push({
      ...cat,
      unifiedDisplayName: unified.displayName,
    });
  }

  const duplicateCategoryGroups = [];
  for (const [canonicalKey, group] of byCanonical.entries()) {
    if (group.length > 1) {
      duplicateCategoryGroups.push({
        canonicalKey,
        unifiedName: group[0].unifiedDisplayName,
        primaryId: group[0].id,
        duplicateIds: group.slice(1).map((c) => c.id),
        categories: group.map((c) => ({ id: c.id, nombre: c.nombre })),
      });
    }
  }

  return {
    formattingIssues,
    duplicateCategoryGroups,
    totalInconsistentCategories:
      formattingIssues.length +
      duplicateCategoryGroups.reduce((acc, g) => acc + g.duplicateIds.length, 0),
  };
}

/**
 * Limpia y valida los datos de entrada de un Usuario.
 */
function cleanUserInput(payload = {}) {
  const warnings = [];
  const rawName = payload.nombre ?? payload.name ?? '';
  const nombre = normalizeDisplayString(rawName) || 'Usuario Sin Nombre';
  if (nombre !== String(rawName).trim()) {
    warnings.push(`Nombre normalizado: '${rawName}' -> '${nombre}'`);
  }

  const emailInfo = normalizeEmail(payload.email, nombre);
  if (emailInfo.wasDirty && emailInfo.issue) {
    warnings.push(emailInfo.issue);
  }

  const rol = normalizeRole(payload.rol ?? payload.role);
  const documento = payload.documento
    ? String(payload.documento).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : null;
  const telefono = payload.telefono
    ? String(payload.telefono).replace(/[^0-9+]/g, '')
    : null;

  return {
    cleanData: {
      nombre,
      nombreNormalizado: toCanonicalKey(nombre),
      email: emailInfo.email,
      rol,
      documento,
      telefono,
      estado: payload.estado || 'Activo',
    },
    warnings,
    wasCleaned: warnings.length > 0,
  };
}

/**
 * Limpia y valida los datos de entrada de un Ítem / Producto.
 */
function cleanItemInput(payload = {}) {
  const warnings = [];
  const rawName = payload.nombre ?? payload.name ?? '';
  const nombre = normalizeDisplayString(rawName) || 'Producto General';
  if (nombre !== String(rawName).trim()) {
    warnings.push(`Nombre de ítem normalizado: '${rawName}' -> '${nombre}'`);
  }

  const priceCheck = parseAndCleanPrice(payload.precio ?? payload.price);
  if (priceCheck.wasDirty) {
    warnings.push(...priceCheck.issues);
  }

  const rawStock = payload.stock ?? 20;
  let stock = parseInt(rawStock, 10);
  if (!Number.isFinite(stock) || stock < 0) {
    warnings.push(`Stock inválido '${rawStock}' ajustado a 0`);
    stock = 0;
  }

  const sku = payload.sku
    ? String(payload.sku).trim().toUpperCase().replace(/\s+/g, '-')
    : `SKU-${toCanonicalKey(nombre).slice(0, 6).toUpperCase().replace(/\s+/g, '')}-${Date.now().toString().slice(-4)}`;

  return {
    cleanData: {
      sku,
      nombre,
      nombreNormalizado: toCanonicalKey(nombre),
      categoriaId: payload.categoriaId ?? payload.categoria_id ?? null,
      categoriaNombre: payload.categoriaNombre ?? payload.categoria ?? null,
      precio: priceCheck.cleanPrice,
      stock,
      estado: payload.estado || 'Activo',
    },
    warnings,
    wasCleaned: warnings.length > 0,
  };
}

module.exports = {
  toCanonicalKey,
  normalizeDisplayString,
  unifyCategoryName,
  parseAndCleanPrice,
  normalizeEmail,
  normalizeRole,
  normalizeChannel,
  detectDuplicateItems,
  detectDuplicateUsers,
  detectInconsistentCategories,
  cleanUserInput,
  cleanItemInput,
};
