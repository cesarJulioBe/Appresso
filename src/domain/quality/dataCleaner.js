/**
 * @file dataCleaner.js
 * @description Motor de Limpieza, Normalización Unicode NFD, Deduplicación y Calidad de Datos Maestros.
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL).
 * (b) Responsabilidad única: Normalizar cadenas de texto (claves canónicas sin diacríticos y formato legible Title Case),
 *     reparar precios mal digitados, estandarizar correos/roles/canales mediante diccionarios de sinónimos y detectar
 *     duplicados en ítems, usuarios y categorías en tiempo lineal usando tablas Hash.
 * (c) Complejidad algorítmica Big-O:
 *     - Funciones escalares de texto/precio (`toCanonicalKey`, `normalizeDisplayString`, `unifyCategoryName`,
 *       `parseAndCleanPrice`, `normalizeEmail`, `normalizeRole`, `normalizeChannel`, `cleanUserInput`, `cleanItemInput`):
 *       $O(L)$ en tiempo y espacio respecto a la longitud $L$ del texto de entrada ($O(1)$ práctico dado que $L$ es acotado
 *       y las búsquedas en `CATEGORY_SYNONYMS`, `ROLE_SYNONYMS` y `CHANNEL_SYNONYMS` son $O(1)$).
 *     - Funciones de auditoría de colecciones (`detectDuplicateItems`, `detectInconsistentCategories`):
 *       $O(n)$ en tiempo promedio y $O(n)$ en espacio auxiliar usando `Map` para agrupar $n$ registros en una sola pasada.
 *     - `detectDuplicateUsers`: $O(n)$ para indexar en `Map` + $O(g \cdot m \log m)$ al ordenar IDs de grupos duplicados pequeños,
 *       comportándose linealmente $O(n)$ en escenarios reales donde el tamaño de cada grupo duplicado $m$ es constante.
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - `DataQualityService` (`src/application/quality/DataQualityService.js`):
 *       1. `getQualityReport()` al consultar el diagnóstico y puntaje global de calidad (`GET /api/operational/quality/report`).
 *       2. `runAutoClean()` al disparar la curación, fusión de duplicados y corrección masiva (`POST /api/operational/quality/clean`).
 *     - `OperationalService` (`src/application/operational/OperationalService.js`):
 *       en tiempo real al crear o editar usuarios (`createUser`, `updateUser`), categorías (`createCategory`, `updateCategory`),
 *       ítems (`createItem`, `updateItem`), pedidos multicanal (`createOperationalOrder`) y facturas (`generateInvoice`).
 */

// Diccionario Hash O(1) que traduce variantes coloquiales, plurales o en inglés hacia la categoría canónica oficial
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

// Diccionario Hash O(1) para homologar denominaciones de cargos/perfiles a los tres roles del modelo de permisos
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

// Diccionario Hash O(1) para estandarizar los puntos de contacto comerciales en los cuatro canales operativos
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
 * Transforma cualquier valor en una clave canónica comparable libre de tildes, signos de puntuación y espacios redundantes.
 *
 * Algoritmo paso a paso ($O(L)$ donde $L$ es la longitud del texto):
 * 1. `normalize('NFD')` (Descomposición Canónica Unicode): separa cada carácter acentuado en su letra base ASCII
 *    seguida de su marca combinante diacrítica (ej. `'é'` $\to$ `'e'` + `'\u0301'`, `'ñ'` $\to$ `'n'` + `'\u0303'`).
 * 2. `.replace(/[\u0300-\u036f]/g, '')`: elimina todo el bloque Unicode de marcas diacríticas combinantes.
 * 3. `.toLowerCase()`: unifica mayúsculas y minúsculas.
 * 4. `.replace(/[^a-z0-9\s]/g, ' ')`: sustituye símbolos o signos de puntuación por espacios simples.
 * 5. `.replace(/\s+/g, ' ').trim()`: colapsa secuencias de espacios múltiples y recorta extremos.
 *
 * @param {*} input - Texto o valor crudo a canonizar.
 * @returns {string} Clave canónica alfanumérica en minúsculas (o `''` si la entrada es nula/indefinida).
 */
function toCanonicalKey(input) {
  // Guarda defensiva contra valores nulos o indefinidos evitando convertirlos en las cadenas 'null' o 'undefined'
  if (input === null || input === undefined) return '';
  return String(input)
    // Descompone caracteres precompuestos en letra base + marca diacrítica Unicode (estándar NFD)
    .normalize('NFD')
    // Suprime todas las tildes, diéresis y virgulillas ubicadas en el rango hexadecimal U+0300..U+036F
    .replace(/[\u0300-\u036f]/g, '')
    // Pasa toda la cadena a minúsculas uniformes
    .toLowerCase()
    // Reemplaza cualquier carácter no alfanumérico (guiones, puntos, signos) por espacio en blanco
    .replace(/[^a-z0-9\s]/g, ' ')
    // Colapsa múltiples espacios consecutivos en un único espacio separador
    .replace(/\s+/g, ' ')
    // Elimina espacios sobrantes al principio y al final
    .trim();
}

/**
 * Formatea un texto sucio para visualización humana en estilo Title Case español conservando sus tildes legítimas ($O(L)$).
 *
 * @param {*} input - Cadena original con posibles saltos de línea, tabulaciones o mayúsculas desordenadas.
 * @returns {string} Cadena limpia con iniciales en mayúscula y conectores gramaticales en minúscula.
 */
function normalizeDisplayString(input) {
  // Retorna cadena vacía si el dato de entrada es nulo o indefinido
  if (input === null || input === undefined) return '';
  // Sustituye saltos de línea/tabuladores por espacio, colapsa espacios repetidos y recorta bordes
  const collapsed = String(input)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Si tras limpiar espacios la cadena quedó vacía, retorna inmediatamente ''
  if (!collapsed) return '';

  // Divide palabra por palabra para aplicar capitalización inteligente según reglas del español
  return collapsed
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      // Mantiene preposiciones, artículos y conjunciones cortas en minúscula cuando van en medio de la frase
      if (['de', 'del', 'la', 'el', 'y', 'en', 'con', 'al'].includes(lower)) {
        return lower;
      }
      // Capitaliza la primera letra de las palabras sustantivas/adjetivas y deja el resto en minúscula
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    // Garantiza que la primera letra absoluta del nombre completo vaya siempre en mayúscula (incluso si inicia con artículo o tilde)
    .replace(/^([a-záéíóúñ])/, (m) => m.toUpperCase());
}

/**
 * Unifica nombres de categorías inconsistentes o sinónimos hacia su denominación canónica oficial ($O(L)$).
 *
 * @param {*} rawCategory - Nombre crudo de categoría recibido.
 * @returns {{canonicalKey: string, displayName: string, wasInconsistent: boolean, reason: string|null}}
 */
function unifyCategoryName(rawCategory) {
  // Obtiene la clave canónica sin tildes ni espacios extra
  const key = toCanonicalKey(rawCategory);
  // Si la categoría venía vacía o solo con símbolos, la asigna por defecto a la categoría 'General'
  if (!key) {
    return {
      canonicalKey: 'general',
      displayName: 'General',
      wasInconsistent: true,
      reason: 'Categoría vacía normalizada a General',
    };
  }

  // Consulta en O(1) si la clave coincide con algún sinónimo conocido del catálogo de cafetería
  if (CATEGORY_SYNONYMS[key]) {
    const unified = CATEGORY_SYNONYMS[key];
    const unifiedKey = toCanonicalKey(unified);
    const rawTrimmed = String(rawCategory).trim();
    // Marca inconsistencia si el texto original no era idéntico carácter por carácter al nombre oficial
    return {
      canonicalKey: unifiedKey,
      displayName: unified,
      wasInconsistent: rawTrimmed !== unified,
      reason: rawTrimmed !== unified ? `Unificada '${rawTrimmed}' -> '${unified}'` : null,
    };
  }

  // Si es una categoría personalizada no listada en sinónimos, normaliza su presentación en Title Case
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
 * Limpia, interpreta y acota precios numéricos o textuales con errores tipográficos o formatos regionales mixtos ($O(L)$).
 * Soporta ejemplos como: `"$ 12.500,00"`, `"12,500"`, `"-8500"`, `"8500 COP"`, `"12..500"`, `"8.5"` ($\to 8500$), `"gratis"`.
 *
 * @param {number|string} rawPrice - Valor crudo del precio.
 * @param {object} [bounds] - Límites de saneamiento financiero en pesos colombianos (COP).
 * @param {number} [bounds.defaultPrice=5000] - Precio de respaldo cuando el valor es irrecuperable o cero.
 * @param {number} [bounds.minPrice=100] - Piso mínimo aceptable para un producto válido.
 * @param {number} [bounds.maxPrice=5000000] - Techo máximo permitido para corregir ceros digitados de más.
 * @returns {{cleanPrice: number, wasDirty: boolean, issues: string[]}} Precio limpio a 2 decimales y bitácora de hallazgos.
 */
function parseAndCleanPrice(rawPrice, { defaultPrice = 5000, minPrice = 100, maxPrice = 5000000 } = {}) {
  // Lista de anomalías detectadas sobre el precio evaluado
  const issues = [];
  // Indicador booleano de si el dato original requirió alguna intervención correctiva
  let wasDirty = false;

  // Ruta rápida cuando el dato ya llega como `number` finito de JavaScript
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) {
    let val = rawPrice;
    // Corrige signos negativos accidentales tomando el valor absoluto |val|
    if (val < 0) {
      issues.push(`Precio negativo (${val}) convertido a valor absoluto`);
      val = Math.abs(val);
      wasDirty = true;
    }
    // Si es cero o inferior al umbral mínimo permitido, sustituye por el precio base configurado
    if (val === 0 || val < minPrice) {
      issues.push(`Precio fuera de rango mínimo (${val}) ajustado a ${defaultPrice}`);
      val = defaultPrice;
      wasDirty = true;
    }
    // Si supera el techo máximo razonable, aplica recorte superior (clamping) a `maxPrice`
    if (val > maxPrice) {
      issues.push(`Precio excesivo (${val}) ajustado a tope ${maxPrice}`);
      val = maxPrice;
      wasDirty = true;
    }
    // Redondea a centavos exactos: round(val * 100) / 100
    return {
      cleanPrice: Math.round(val * 100) / 100,
      wasDirty,
      issues,
    };
  }

  // Ruta de análisis léxico cuando el precio viene como string, null, undefined o NaN
  const rawStr = String(rawPrice ?? '').trim();
  if (!rawStr) {
    return {
      cleanPrice: defaultPrice,
      wasDirty: true,
      issues: [`Precio vacío reemplazado por valor base ${defaultPrice}`],
    };
  }

  // Registra presencia de guion negativo antes de limpiar símbolos no numéricos
  const isNegative = rawStr.includes('-');
  if (isNegative) {
    wasDirty = true;
    issues.push(`Signo negativo detectado en '${rawStr}'`);
  }

  // Detecta cualquier carácter ajeno a dígitos y punto decimal estándar (símbolos '$', 'COP', comas, espacios, letras)
  if (/[^0-9.]/.test(rawStr)) {
    wasDirty = true;
    issues.push(`Formato de precio sucio '${rawStr}' limpiado`);
  }

  // Conserva únicamente dígitos, puntos y comas para desambiguar separadores de miles vs decimales
  let normalized = rawStr.replace(/[^0-9.,]/g, '');

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    // Patrón colombiano/europeo (ej. "12.500" o "12.500,50"): elimina puntos de miles y convierte coma decimal en punto
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    // Patrón anglosajón (ej. "12,500" o "12,500.50"): elimina comas de miles conservando el punto decimal
    normalized = normalized.replace(/,/g, '');
  } else {
    // Caso de separadores repetidos o ambiguos (ej. "12..500" o "8,500"): fragmenta por bloques de puntos/comas
    const parts = normalized.split(/[.,]+/).filter(Boolean);
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      // Si el último bloque tiene exactamente 3 dígitos, se interpreta como grupo de miles (ej. "12..500" -> "12500")
      if (lastPart.length === 3) {
        normalized = parts.join('');
      } else {
        // De lo contrario, el último bloque actúa como parte decimal (ej. "12..50" -> "12.50")
        normalized = parts.slice(0, -1).join('') + '.' + lastPart;
      }
    } else {
      normalized = parts[0] || '';
    }
  }

  // Convierte la cadena normalizada a número de punto flotante IEEE-754
  let parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    // Textos puramente alfabéticos como "gratis" producen NaN y caen al precio por defecto
    issues.push(`Valor no numérico '${rawStr}' corregido a ${defaultPrice}`);
    parsed = defaultPrice;
    wasDirty = true;
  } else if (parsed < minPrice) {
    // Heurística monetaria COP: si escribieron "8.5" con punto abreviando miles, escala multiplicando por 1000 (-> 8500)
    if (parsed < 100 && rawStr.includes('.')) {
      issues.push(`Posible separador de miles mal interpretado en '${rawStr}', escalado x1000`);
      parsed = parsed * 1000;
      wasDirty = true;
    } else {
      issues.push(`Precio inferior al mínimo (${parsed}) ajustado a ${minPrice}`);
      parsed = minPrice;
      wasDirty = true;
    }
  } else if (parsed > maxPrice) {
    // Recorta precios desproporcionados al techo máximo configurado
    issues.push(`Precio superior al límite (${parsed}) ajustado a ${maxPrice}`);
    parsed = maxPrice;
    wasDirty = true;
  }

  // Devuelve el valor saneado con precisión de 2 decimales y el historial de correcciones aplicadas
  return {
    cleanPrice: Math.round(parsed * 100) / 100,
    wasDirty,
    issues,
  };
}

/**
 * Normaliza direcciones de correo electrónico y repara errores frecuentes de digitación ($O(L)$).
 * Corrige espacios internos, arrobas dobles (`@@`), dominios duplicados (`.com.com`), comas finales (`,com`)
 * o ausencia total de `@` generando un buzón corporativo de respaldo a partir de `fallbackName`.
 *
 * @param {*} rawEmail - Correo electrónico crudo recibido.
 * @param {string} [fallbackName='usuario'] - Nombre del usuario para sintetizar un slug si el correo es irrecuperable.
 * @returns {{email: string, wasDirty: boolean, issue: string|null}}
 */
function normalizeEmail(rawEmail, fallbackName = 'usuario') {
  // Limpia espacios, pasa a minúsculas y corrige errores sintácticos habituales de teclado
  const str = String(rawEmail ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/@@+/g, '@')
    .replace(/\.com\.com$/i, '.com')
    .replace(/,com$/i, '.com')
    .trim();

  // Si está vacío o carece por completo de '@', construye un correo válido determinista usando el nombre canónico
  if (!str || !str.includes('@')) {
    const slug = toCanonicalKey(fallbackName).replace(/\s+/g, '.') || 'cliente';
    return {
      email: `${slug}@appresso.co`,
      wasDirty: true,
      issue: `Email inválido '${rawEmail}' normalizado a '${slug}@appresso.co'`,
    };
  }

  // Separa parte local (antes de '@') y dominio (después de '@')
  const [local, domain] = str.split('@');
  // Asegura que el dominio contenga al menos un punto de nivel superior (TLD), completando '.com' si faltaba
  const cleanDomain = domain && domain.includes('.') ? domain : `${domain || 'appresso'}.com`;
  const cleanEmail = `${local || 'cliente'}@${cleanDomain}`;

  // Reporta el correo limpio indicando si difiere del valor crudo recibido
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
 * Estandariza un rol de usuario hacia `'cliente'`, `'empleado'` o `'admin'` en $O(L)$.
 *
 * @param {*} rawRole - Rol de entrada libre (ej. `'Barista'`, `'Gerente'`, `'Customer'`).
 * @returns {'cliente'|'empleado'|'admin'} Rol canónico válido (por defecto `'cliente'`).
 */
function normalizeRole(rawRole) {
  const key = toCanonicalKey(rawRole);
  return ROLE_SYNONYMS[key] || 'cliente';
}

/**
 * Estandariza un canal de operación hacia `'presencial'`, `'web'`, `'app'` o `'domicilio'` en $O(L)$.
 *
 * @param {*} rawChannel - Canal comercial de entrada (ej. `'POS'`, `'Online'`, `'Delivery'`).
 * @returns {'presencial'|'web'|'app'|'domicilio'} Canal canónico válido (por defecto `'presencial'`).
 */
function normalizeChannel(rawChannel) {
  const key = toCanonicalKey(rawChannel);
  return CHANNEL_SYNONYMS[key] || 'presencial';
}

/**
 * Detecta productos duplicados y precios anómalos en el catálogo en tiempo lineal $O(n)$ mediante tablas Hash (`Map`).
 *
 * @param {Array<object>} [items=[]] - Lista de ítems del inventario.
 * @returns {{duplicateGroups: Array<object>, totalDuplicateItems: number, priceIssues: Array<object>}}
 */
function detectDuplicateItems(items = []) {
  // Índice Hash O(1) agrupado por nombre canónico normalizado
  const byNameKey = new Map();
  // Índice Hash O(1) agrupado por código SKU normalizado
  const bySkuKey = new Map();
  // Lista resultante de clústeres con más de un registro equivalente
  const duplicateGroups = [];
  // Lista de productos cuyos precios están sucios, en cero/negativos o exceden 500.000 COP
  const priceIssues = [];

  // Primera pasada O(n): evalúa precios e indexa cada ítem en los mapas Hash
  for (const item of items) {
    const nameKey = toCanonicalKey(item.nombre || item.name);
    const skuKey = item.sku ? toCanonicalKey(item.sku) : null;
    const priceCheck = parseAndCleanPrice(item.precio ?? item.price);

    // Registra alerta de calidad financiera si el precio presentó formato sucio o valores fuera del umbral operativo
    if (priceCheck.wasDirty || Number(item.precio) <= 0 || Number(item.precio) > 500000) {
      priceIssues.push({
        id: item.id,
        nombre: item.nombre,
        precioOriginal: item.precio,
        precioSugerido: priceCheck.cleanPrice,
        issues: priceCheck.issues,
      });
    }

    // Inserta el ítem en el cubo correspondiente a su nombre canónico en O(1)
    if (nameKey) {
      if (!byNameKey.has(nameKey)) {
        byNameKey.set(nameKey, []);
      }
      byNameKey.get(nameKey).push(item);
    }

    // Inserta el ítem en el cubo correspondiente a su SKU canónico en O(1)
    if (skuKey) {
      if (!bySkuKey.has(skuKey)) {
        bySkuKey.set(skuKey, []);
      }
      bySkuKey.get(skuKey).push(item);
    }
  }

  // Segunda pasada O(k) (con k <= n claves únicas): filtra los cubos con colisión de duplicidad (`group.length > 1`)
  for (const [canonicalName, group] of byNameKey.entries()) {
    if (group.length > 1) {
      duplicateGroups.push({
        criterion: 'nombre_normalizado',
        canonicalKey: canonicalName,
        count: group.length,
        // Conserva el primer registro como ID maestro primario y marca los restantes como duplicados fusionables
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

  // Suma el total de registros sobrantes (`duplicateIds.length`) a través de todos los grupos hallados
  return {
    duplicateGroups,
    totalDuplicateItems: duplicateGroups.reduce((acc, g) => acc + g.duplicateIds.length, 0),
    priceIssues,
  };
}

/**
 * Detecta usuarios/clientes registrados dos o más veces cruzando tres criterios en $O(n)$:
 * correo normalizado, número de documento de identidad y nombre completo canónico.
 *
 * @param {Array<object>} [users=[]] - Lista de usuarios registrados.
 * @returns {{duplicateGroups: Array<object>, totalDuplicateUsers: number}}
 */
function detectDuplicateUsers(users = []) {
  // Tres mapas Hash independientes para capturar duplicados por cualquiera de las tres llaves de identidad
  const byEmail = new Map();
  const byName = new Map();
  const byDocument = new Map();
  const duplicateGroups = [];
  // Conjunto Hash `Set` de firmas de IDs (ej. "2-15") para no reportar dos veces exactamente el mismo par por email y nombre
  const seenPairs = new Set();

  // Indexación lineal O(n) de todos los usuarios en los tres diccionarios
  for (const user of users) {
    const emailKey = normalizeEmail(user.email, user.nombre).email;
    const nameKey = toCanonicalKey(user.nombre);
    const docKey = user.documento ? toCanonicalKey(user.documento) : '';

    if (emailKey) {
      if (!byEmail.has(emailKey)) byEmail.set(emailKey, []);
      byEmail.get(emailKey).push(user);
    }
    // Exige longitud mínima >= 3 en nombres para evitar falsos positivos en iniciales sueltas
    if (nameKey && nameKey.length >= 3) {
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(user);
    }
    // Exige longitud mínima >= 4 en documentos para ignorar placeholders vacíos o guiones
    if (docKey && docKey.length >= 4) {
      if (!byDocument.has(docKey)) byDocument.set(docKey, []);
      byDocument.get(docKey).push(user);
    }
  }

  // Helper interno que registra un grupo duplicado si contiene > 1 usuario y su combinación exacta de IDs no fue reportada aún
  const registerGroup = (criterion, key, group) => {
    if (group.length <= 1) return;
    // Ordena numéricamente los IDs para generar una firma determinista invariante al orden de llegada
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

  // Evalúa en orden de prioridad de certeza: primero email, luego documento oficial y finalmente nombre normalizado
  for (const [k, g] of byEmail.entries()) registerGroup('email_normalizado', k, g);
  for (const [k, g] of byDocument.entries()) registerGroup('documento', k, g);
  for (const [k, g] of byName.entries()) registerGroup('nombre_normalizado', k, g);

  return {
    duplicateGroups,
    totalDuplicateUsers: duplicateGroups.reduce((acc, g) => acc + g.duplicateIds.length, 0),
  };
}

/**
 * Audita una colección de categorías en $O(n)$ detectando tanto nombres mal formateados/sinónimos
 * como categorías funcionalmente duplicadas que colisionan en la misma clave canónica.
 *
 * @param {Array<object>} [categories=[]] - Lista de categorías almacenadas.
 * @returns {{formattingIssues: Array<object>, duplicateCategoryGroups: Array<object>, totalInconsistentCategories: number}}
 */
function detectInconsistentCategories(categories = []) {
  // Mapa Hash O(1) para agrupar categorías que apuntan al mismo concepto canónico (ej. 'hot coffee' y 'Café Caliente')
  const byCanonical = new Map();
  const formattingIssues = [];

  // Recorre linealmente todas las categorías evaluando su unificación contra sinónimos y formato Title Case
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

    // Agrupa por `unified.canonicalKey` para descubrir colisiones semánticas entre registros distintos
    if (!byCanonical.has(unified.canonicalKey)) {
      byCanonical.set(unified.canonicalKey, []);
    }
    byCanonical.get(unified.canonicalKey).push({
      ...cat,
      unifiedDisplayName: unified.displayName,
    });
  }

  // Extrae todos los grupos donde coexisten 2 o más categorías equivalentes en base de datos
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
 * Limpia, estandariza y enriquece el payload de entrada para creación o actualización de un Usuario ($O(L)$).
 *
 * @param {object} [payload={}] - Datos crudos enviados para el usuario.
 * @returns {{cleanData: object, warnings: string[], wasCleaned: boolean}}
 */
function cleanUserInput(payload = {}) {
  const warnings = [];
  // Soporta alias en español (`nombre`) o inglés (`name`)
  const rawName = payload.nombre ?? payload.name ?? '';
  const nombre = normalizeDisplayString(rawName) || 'Usuario Sin Nombre';
  // Advierte si fue necesario corregir espacios, saltos o capitalización en el nombre
  if (nombre !== String(rawName).trim()) {
    warnings.push(`Nombre normalizado: '${rawName}' -> '${nombre}'`);
  }

  // Limpia o sintetiza el correo electrónico garantizando formato válido
  const emailInfo = normalizeEmail(payload.email, nombre);
  if (emailInfo.wasDirty && emailInfo.issue) {
    warnings.push(emailInfo.issue);
  }

  // Homologa el rol usando el diccionario de sinónimos
  const rol = normalizeRole(payload.rol ?? payload.role);
  // Limpia el documento dejando exclusivamente caracteres alfanuméricos en mayúsculas (ej. 'CC 10.203.040' -> 'CC10203040')
  const documento = payload.documento
    ? String(payload.documento).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : null;
  // Limpia el teléfono conservando únicamente dígitos y el prefijo internacional '+'
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
 * Limpia, repara precios/stock y genera SKU determinista/automático para un Ítem del catálogo ($O(L)$).
 *
 * @param {object} [payload={}] - Datos crudos del producto.
 * @returns {{cleanData: object, warnings: string[], wasCleaned: boolean}}
 */
function cleanItemInput(payload = {}) {
  const warnings = [];
  const rawName = payload.nombre ?? payload.name ?? '';
  const nombre = normalizeDisplayString(rawName) || 'Producto General';
  if (nombre !== String(rawName).trim()) {
    warnings.push(`Nombre de ítem normalizado: '${rawName}' -> '${nombre}'`);
  }

  // Sanea el precio corrigiendo separadores regionales, signos negativos o valores fuera de escala
  const priceCheck = parseAndCleanPrice(payload.precio ?? payload.price);
  if (priceCheck.wasDirty) {
    warnings.push(...priceCheck.issues);
  }

  // Parsea el inventario disponible como entero en base 10 e impide existencias negativas
  const rawStock = payload.stock ?? 20;
  let stock = parseInt(rawStock, 10);
  if (!Number.isFinite(stock) || stock < 0) {
    warnings.push(`Stock inválido '${rawStock}' ajustado a 0`);
    stock = 0;
  }

  // Normaliza el SKU proporcionado o autogenera uno con prefijo canónico de 6 letras + últimos 4 dígitos de epoch
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

// Exporta todas las primitivas puras de limpieza, normalización y auditoría de calidad de datos
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
