/**
 * @file hashChain.js
 * @description Motor de Integridad Criptográfica por Hash Encadenado (`prev_hash -> hash_actual`) y Validación de Comprobantes.
 *
 * (a) Capa: Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL; emplea únicamente `crypto` nativo y `safeCompareHashes`).
 * (b) Responsabilidad única: Garantizar la inmutabilidad contable de facturas y pagos enlazando cada registro con el
 *     HMAC-SHA256 del eslabón inmediatamente anterior (estructura tipo libro mayor / blockchain ligera) y verificar la
 *     autenticidad y unicidad de los comprobantes de pago adjuntos.
 * (c) Complejidad algorítmica Big-O:
 *     - `formatAmount`, `buildInvoiceCanonicalPayload`, `computeInvoiceChainHash`, `computeReceiptHash`,
 *       `buildPaymentCanonicalPayload`, `computePaymentChainHash`:
 *       $O(1)$ en tiempo y espacio (el número de claves del objeto canónico es fijo y constante: $k \le 9$).
 *     - `validatePaymentReceipt`:
 *       $O(1)$ en tiempo promedio y espacio auxiliar (la consulta de reutilización en `existingReceiptRefs.has(ref)` sobre un `Set` es $O(1)$).
 *     - `verifyInvoiceChain(invoices, secret)` y `verifyPaymentChain(payments, invoicesById, secret)`:
 *       $O(n \log n)$ al ordenar cronológicamente/secuencialmente por `id` una copia superficial de los $n$ registros,
 *       seguido de un recorrido lineal criptográfico $O(n)$ verificando eslabón por eslabón; espacio auxiliar $O(n)$.
 *       (Si los registros ya provienen ordenados y se considera solo la verificación secuencial de eslabones, el barrido es $O(n)$).
 * (d) Servicio de `src/application/` que lo invoca y cuándo se dispara:
 *     - `OperationalService` (`src/application/operational/OperationalService.js`):
 *       1. `generateInvoice()` invoca `computeInvoiceChainHash` al emitir cada factura (`POST /api/operational/invoices`).
 *       2. `processPayment()` invoca `validatePaymentReceipt` y `computePaymentChainHash` al registrar pagos (`POST /api/operational/payments`).
 *       3. `verifyIntegrity()` y `simulateTampering()` invocan `verifyInvoiceChain` y `verifyPaymentChain` al auditar o demostrar
 *          detección de adulteraciones en base de datos (`GET /api/operational/integrity/verify`, `POST /api/operational/integrity/tamper`).
 *       4. `restoreIntegrityChain()` recalcula y repara las cadenas desde sus bloques génesis (`POST /api/operational/integrity/restore`).
 */

// Módulo nativo de Node.js para cálculo criptográfico HMAC-SHA256 de 256 bits (64 caracteres hexadecimales)
const crypto = require('crypto');
// Comparador en tiempo constante O(1) para evitar filtración de bytes de firma mediante timing attacks
const { safeCompareHashes } = require('../fraud/hashUtils');

// Semilla criptográfica fija (bloque génesis de 64 ceros) a la que se enlaza `prev_hash` de la primera factura emitida
const GENESIS_INVOICE_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
// Semilla criptográfica fija (bloque génesis de 64 unos) a la que se enlaza `prev_hash` del primer pago registrado
const GENESIS_PAYMENT_HASH = '1111111111111111111111111111111111111111111111111111111111111111';

/**
 * Formatea un importe numérico a representación exacta de 2 decimales (`"0.00"`) en $O(1)$
 * para evitar discrepancias de hash entre `50000` (number) y `"50000.00"` (DECIMAL de SQL).
 *
 * @param {*} value - Monto numérico o textual.
 * @returns {string} Monto formateado con dos decimales fijos.
 */
function formatAmount(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

/**
 * Construye el payload JSON canónico determinista de una factura incluyendo su eslabón previo `prevHash` ($O(1)$).
 *
 * Fórmula del eslabón encadenado $i$:
 * $$H_i = \text{HMAC-SHA256}\Big(K,\; \text{JSON\_Canónico}(\text{datos}_i \,\|\, H_{i-1})\Big)$$
 * Si un atacante modifica `total` o `descuento` en $i$, $H_i$ cambia e invalida automáticamente $H_{i+1}, H_{i+2}, \dots, H_n$.
 *
 * @param {object} invoice - Datos de la factura (soporta camelCase de aplicación y snake_case de persistencia).
 * @returns {string} Cadena JSON con claves ordenadas alfabéticamente.
 */
function buildInvoiceCanonicalPayload(invoice) {
  // Normaliza tipos y nombres de campos en un objeto plano determinista
  const canonical = {
    canal: String(invoice.canal || 'presencial'),
    descuento: formatAmount(invoice.descuento),
    impuestos: formatAmount(invoice.impuestos),
    numeroConsecutivo: String(invoice.numeroConsecutivo ?? invoice.numero_consecutivo ?? ''),
    pedidoId: Number(invoice.pedidoId ?? invoice.pedido_id ?? 0),
    // Inyecta el hash de la factura anterior (o el hash génesis si es la primera) creando la dependencia criptográfica en cadena
    prevHash: String(invoice.prevHash ?? invoice.prev_hash ?? GENESIS_INVOICE_HASH),
    subtotal: formatAmount(invoice.subtotal),
    total: formatAmount(invoice.total),
    usuarioId: Number(invoice.usuarioId ?? invoice.usuario_id ?? 0),
  };

  // Serializa forzando orden alfabético estricto de las claves para garantizar reproducibilidad bit a bit
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Calcula el hash encadenado HMAC-SHA256 en hexadecimal de una factura ($O(1)$).
 *
 * @param {object} invoice - Datos de la factura incluyendo `prevHash` / `prev_hash`.
 * @param {string} secret - Llave secreta simétrica `HMAC_SECRET`.
 * @returns {string} Firma hexadecimal de 64 caracteres.
 */
function computeInvoiceChainHash(invoice, secret) {
  // Impide firmar documentos contables sin llave criptográfica configurada
  if (!secret) throw new Error('HMAC_SECRET es requerido para calcular el hash de la factura');
  // Construye el mensaje canónico determinista
  const payload = buildInvoiceCanonicalPayload(invoice);
  // Ejecuta el algoritmo HMAC con función resumen SHA-256 codificando el mensaje en UTF-8
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Calcula la firma criptográfica HMAC-SHA256 exclusiva del soporte/comprobante de pago adjunto ($O(1)$).
 *
 * @param {object} [receiptData={}] - Metadatos esenciales del comprobante bancario o de pasarela.
 * @param {string} secret - Llave secreta `HMAC_SECRET`.
 * @returns {string} Hash hexadecimal de 64 caracteres del comprobante.
 */
function computeReceiptHash(receiptData = {}, secret) {
  if (!secret) throw new Error('HMAC_SECRET es requerido para firmar el comprobante');
  // Canoniza entidad emisora en mayúsculas, ID de factura, método, monto exacto y código de referencia
  const canonicalReceipt = {
    entidad: String(receiptData.entidad || receiptData.banco || 'PASARELA_APPRESSO')
      .trim()
      .toUpperCase(),
    facturaId: Number(receiptData.facturaId ?? receiptData.factura_id ?? 0),
    metodoPago: String(receiptData.metodoPago ?? receiptData.metodo_pago ?? 'Efectivo').trim(),
    montoComprobante: formatAmount(
      receiptData.montoComprobante ?? receiptData.monto_comprobante ?? receiptData.monto
    ),
    referencia: String(
      receiptData.referencia ?? receiptData.referenciaComprobante ?? receiptData.referencia_comprobante ?? ''
    ).trim(),
  };

  // Serializa con claves ordenadas y genera el resumen autenticado HMAC-SHA256
  const payload = JSON.stringify(canonicalReceipt, Object.keys(canonicalReceipt).sort());
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Valida integralmente la legitimidad de un pago contrastándolo contra su comprobante adjunto,
 * el historial de referencias ya utilizadas (anti-replay) y el total de la factura asociada ($O(1)$ promedio).
 *
 * @param {object} params - Parámetros de validación cruzada.
 * @param {object} params.payment - Datos del pago entrante o almacenado.
 * @param {object|null} params.invoice - Factura asociada al pago.
 * @param {Set<string>} [params.existingReceiptRefs=new Set()] - Conjunto Hash de referencias ya consumidas previamente.
 * @param {string} params.secret - Llave secreta `HMAC_SECRET`.
 * @returns {{isValid: boolean, comprobanteHash: string, expectedReceiptHash: string, issues: string[]}}
 */
function validatePaymentReceipt({
  payment,
  invoice,
  existingReceiptRefs = new Set(),
  secret,
}) {
  const issues = [];
  // Extrae y recorta el código de referencia único del comprobante
  const ref = String(
    payment.referenciaComprobante ?? payment.referencia_comprobante ?? ''
  ).trim();

  // Regla 1: Longitud mínima de referencia bancaria/pasarela
  if (!ref || ref.length < 4) {
    issues.push('Referencia de comprobante ausente o demasiado corta');
  }

  // Regla 2: Detección léxica de marcadores explícitos de comprobantes apócrifos o de prueba de fraude
  if (/FALSO|FAKE|INVALID|ALTERADO|TEST_FRAUD/i.test(ref)) {
    issues.push(`Comprobante marcado con firma/referencia fraudulenta (${ref})`);
  }

  // Regla 3: Protección contra ataque de repetición (Replay Attack) verificando en O(1) en el `Set` de referencias usadas
  if (existingReceiptRefs.has(ref) && ref) {
    issues.push(`Comprobante reutilizado: la referencia '${ref}' ya fue usada en otro pago`);
  }

  // Regla 4: Consistencia entre el monto reportado en el pago y el monto declarado dentro de la metadata del comprobante
  const paymentAmount = Number(payment.monto ?? 0);
  const receiptDeclaredAmount = Number(
    payment.comprobanteMetadata?.montoComprobante ??
      payment.comprobante_metadata?.montoComprobante ??
      paymentAmount
  );

  // Usa tolerancia épsilon de 0.01 (1 centavo) para evitar falsos positivos por aritmética binaria IEEE-754
  if (Math.abs(paymentAmount - receiptDeclaredAmount) > 0.01) {
    issues.push(
      `El monto del pago ($${formatAmount(paymentAmount)}) no coincide con el monto del comprobante ($${formatAmount(receiptDeclaredAmount)})`
    );
  }

  // Regla 5: Conciliación contable contra el saldo total y el estado vigente de la factura
  if (invoice) {
    const invoiceTotal = Number(invoice.total ?? 0);
    if (Math.abs(paymentAmount - invoiceTotal) > 0.01) {
      issues.push(
        `El monto pagado ($${formatAmount(paymentAmount)}) difiere del total de la factura ${invoice.numero_consecutivo || invoice.numeroConsecutivo} ($${formatAmount(invoiceTotal)})`
      );
    }
    if (invoice.estado === 'Anulada') {
      issues.push('Intento de pago sobre una factura anulada');
    }
  }

  // Regla 6: Recalcula el HMAC-SHA256 esperado del comprobante con los atributos reales del pago
  const expectedReceiptHash = computeReceiptHash(
    {
      facturaId: payment.facturaId ?? payment.factura_id,
      metodoPago: payment.metodoPago ?? payment.metodo_pago,
      montoComprobante: receiptDeclaredAmount,
      referencia: ref,
      entidad:
        payment.comprobanteMetadata?.entidad ??
        payment.comprobante_metadata?.entidad ??
        'PASARELA_APPRESSO',
    },
    secret
  );

  // Si el pago ya trae un `comprobanteHash` externo/almacenado, verifica su integridad en tiempo constante contra timing attacks
  const providedHash = payment.comprobanteHash ?? payment.comprobante_hash;
  if (providedHash && !safeCompareHashes(providedHash, expectedReceiptHash)) {
    issues.push('El hash criptográfico del comprobante fue alterado o es apócrifo');
  }

  return {
    isValid: issues.length === 0,
    comprobanteHash: providedHash || expectedReceiptHash,
    expectedReceiptHash,
    issues,
  };
}

/**
 * Construye el payload JSON canónico determinista de un pago enlazando `comprobanteHash` y `prevHash` ($O(1)$).
 *
 * @param {object} payment - Registro de pago.
 * @returns {string} Cadena JSON determinista con claves ordenadas alfabéticamente.
 */
function buildPaymentCanonicalPayload(payment) {
  const canonical = {
    // Incluye el hash del comprobante dentro del hash de cadena para que alterar el soporte rompa también el eslabón del pago
    comprobanteHash: String(payment.comprobanteHash ?? payment.comprobante_hash ?? ''),
    facturaId: Number(payment.facturaId ?? payment.factura_id ?? 0),
    metodoPago: String(payment.metodoPago ?? payment.metodo_pago ?? 'Efectivo'),
    monto: formatAmount(payment.monto),
    pedidoId: Number(payment.pedidoId ?? payment.pedido_id ?? 0),
    // Enlaza criptográficamente con el hash del pago anterior (o con GENESIS_PAYMENT_HASH en el primer pago)
    prevHash: String(payment.prevHash ?? payment.prev_hash ?? GENESIS_PAYMENT_HASH),
    referenciaComprobante: String(
      payment.referenciaComprobante ?? payment.referencia_comprobante ?? ''
    ),
    usuarioId: Number(payment.usuarioId ?? payment.usuario_id ?? 0),
  };

  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Calcula el hash encadenado HMAC-SHA256 de un pago dado su `prevHash` ($O(1)$).
 *
 * @param {object} payment - Datos del pago.
 * @param {string} secret - Llave secreta `HMAC_SECRET`.
 * @returns {string} Firma hexadecimal de 64 caracteres.
 */
function computePaymentChainHash(payment, secret) {
  if (!secret) throw new Error('HMAC_SECRET es requerido para calcular el hash del pago');
  const payload = buildPaymentCanonicalPayload(payment);
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Audita de extremo a extremo la cadena criptográfica de facturas verificando cada eslabón `prev_hash -> hash_actual`.
 * Complejidad: $O(n \log n)$ por ordenamiento ascendente de IDs + $O(n)$ de verificación secuencial de hashes.
 *
 * @param {Array<object>} [invoices=[]] - Lista completa de facturas almacenadas.
 * @param {string} secret - Llave secreta `HMAC_SECRET`.
 * @returns {object} Reporte detallado de eslabones íntegros, eslabones rotos y alertas contables.
 */
function verifyInvoiceChain(invoices = [], secret) {
  // Ordena una copia de las facturas por ID ascendente para reconstruir exactamente la secuencia histórica de emisión
  const ordered = [...invoices].sort((a, b) => Number(a.id) - Number(b.id));
  // El primer eslabón debe apuntar obligatoriamente al bloque génesis de facturas (64 ceros)
  let expectedPrevHash = GENESIS_INVOICE_HASH;
  const links = [];
  const brokenLinks = [];

  // Recorre linealmente los `n` eslabones verificando continuidad de punteros hash e inmutabilidad de datos
  for (let i = 0; i < ordered.length; i++) {
    const inv = ordered[i];
    const storedPrevHash = inv.prev_hash ?? inv.prevHash ?? GENESIS_INVOICE_HASH;
    const storedHash = inv.hash_actual ?? inv.hashActual ?? '';

    // Comprobación 1: ¿El `prev_hash` guardado coincide con el hash final de la factura inmediatamente anterior?
    const prevLinkValid = storedPrevHash === expectedPrevHash;
    // Comprobación 2: Recalcula el HMAC-SHA256 con los montos actuales en BD y compara en tiempo constante con `storedHash`
    const recomputedHash = computeInvoiceChainHash(
      { ...inv, prev_hash: storedPrevHash },
      secret
    );
    const payloadHashValid = safeCompareHashes(storedHash, recomputedHash);
    // Reglas de auditoría interna: detecta anulaciones de alto valor (>= $100.000) y descuentos superiores al 30%
    const isCancelledSuspiciously =
      inv.estado === 'Anulada' && Number(inv.total) >= 100000;
    const isAbusiveDiscount = Number(inv.porcentaje_descuento ?? 0) > 30;

    // Un eslabón está íntegro solo si su enlace previo, su firma de contenido y su estado no presentan adulteración
    const isIntact = prevLinkValid && payloadHashValid && inv.estado !== 'Alterada';

    const linkReport = {
      index: i + 1,
      id: inv.id,
      numeroConsecutivo: inv.numero_consecutivo ?? inv.numeroConsecutivo,
      pedidoId: inv.pedido_id ?? inv.pedidoId,
      subtotal: Number(inv.subtotal),
      descuento: Number(inv.descuento),
      porcentajeDescuento: Number(inv.porcentaje_descuento ?? 0),
      impuestos: Number(inv.impuestos),
      total: Number(inv.total),
      estado: inv.estado,
      prevHash: storedPrevHash,
      expectedPrevHash,
      storedHash,
      recomputedHash,
      prevLinkValid,
      payloadHashValid,
      isIntact,
      warnings: [
        ...(!payloadHashValid
          ? ['ALERTA CRÍTICA: Los montos o datos de la factura fueron alterados después de su emisión (hash no coincide)']
          : []),
        ...(!prevLinkValid
          ? ['ALERTA DE CADENA: El eslabón prev_hash fue roto respecto a la factura anterior']
          : []),
        ...(isAbusiveDiscount
          ? [`Descuento abusivo detectado (${Number(inv.porcentaje_descuento).toFixed(1)}% > 30%)`]
          : []),
        ...(isCancelledSuspiciously
          ? [`Anulación sospechosa de factura de alto monto ($${formatAmount(inv.total)})`]
          : []),
      ],
    };

    links.push(linkReport);
    if (!isIntact) {
      brokenLinks.push(linkReport);
    }

    // Avanza el puntero esperado al hash almacenado actual para auditar el siguiente eslabón `i + 1`
    expectedPrevHash = storedHash || recomputedHash;
  }

  return {
    entity: 'facturas',
    genesisHash: GENESIS_INVOICE_HASH,
    totalRecords: ordered.length,
    intactCount: ordered.length - brokenLinks.length,
    CompromisedCount: brokenLinks.length,
    isChainValid: brokenLinks.length === 0,
    brokenLinks,
    links,
  };
}

/**
 * Audita de extremo a extremo la cadena criptográfica de pagos, la autenticidad de cada comprobante adjunto
 * y la ausencia de comprobantes reutilizados (replay) a lo largo de la historia.
 * Complejidad: $O(n \log n)$ por ordenamiento ascendente de IDs + $O(n)$ de verificación con búsquedas $O(1)$ en `Map` y `Set`.
 *
 * @param {Array<object>} [payments=[]] - Lista completa de pagos registrados.
 * @param {Map<number, object>} [invoicesById=new Map()] - Índice Hash `id -> factura` para cruce contable en $O(1)$.
 * @param {string} secret - Llave secreta `HMAC_SECRET`.
 * @returns {object} Diagnóstico completo de integridad de la cadena de pagos.
 */
function verifyPaymentChain(payments = [], invoicesById = new Map(), secret) {
  // Ordena los pagos ascendentemente por su ID primario sin mutar el arreglo recibido
  const ordered = [...payments].sort((a, b) => Number(a.id) - Number(b.id));
  // El primer pago debe enlazar su `prev_hash` con `GENESIS_PAYMENT_HASH` (64 unos)
  let expectedPrevHash = GENESIS_PAYMENT_HASH;
  // Conjunto incremental O(1) para detectar si un pago posterior reutiliza la referencia de un pago anterior
  const seenRefs = new Set();
  const links = [];
  const brokenLinks = [];

  // Recorre cada eslabón de pago en orden cronológico de emisión
  for (let i = 0; i < ordered.length; i++) {
    const pay = ordered[i];
    const storedPrevHash = pay.prev_hash ?? pay.prevHash ?? GENESIS_PAYMENT_HASH;
    const storedHash = pay.hash_actual ?? pay.hashActual ?? '';
    // Cruza en tiempo constante O(1) contra la factura correspondiente usando el `Map` preindexado
    const invoice = invoicesById.get(Number(pay.factura_id ?? pay.facturaId));

    // Valida autenticidad del comprobante, coincidencia de montos y no-reutilización contra `seenRefs`
    const receiptCheck = validatePaymentReceipt({
      payment: pay,
      invoice,
      existingReceiptRefs: seenRefs,
      secret,
    });

    // Registra la referencia actual en el Set para bloquear su reuso en cualquier pago subsiguiente
    const ref = String(pay.referencia_comprobante ?? pay.referenciaComprobante ?? '').trim();
    if (ref) seenRefs.add(ref);

    // Verifica continuidad del puntero al eslabón previo y recalcula el HMAC-SHA256 del pago completo
    const prevLinkValid = storedPrevHash === expectedPrevHash;
    const recomputedHash = computePaymentChainHash(
      { ...pay, prev_hash: storedPrevHash },
      secret
    );
    const payloadHashValid = safeCompareHashes(storedHash, recomputedHash);
    // El pago solo se declara íntegro si su eslabón previo, su hash de registro y su comprobante son todos legítimos
    const isIntact =
      prevLinkValid &&
      payloadHashValid &&
      receiptCheck.isValid &&
      pay.comprobante_valido !== false;

    const linkReport = {
      index: i + 1,
      id: pay.id,
      facturaId: pay.factura_id ?? pay.facturaId,
      monto: Number(pay.monto),
      metodoPago: pay.metodo_pago ?? pay.metodoPago,
      referenciaComprobante: ref,
      estado: pay.estado,
      prevHash: storedPrevHash,
      expectedPrevHash,
      storedHash,
      recomputedHash,
      prevLinkValid,
      payloadHashValid,
      receiptValid: receiptCheck.isValid && pay.comprobante_valido !== false,
      isIntact,
      warnings: [
        ...(!payloadHashValid
          ? ['ALERTA CRÍTICA: El registro de pago fue modificado ilegalmente (hash de cadena inválido)']
          : []),
        ...(!prevLinkValid
          ? ['ALERTA DE CADENA: Eslabón prev_hash de pago roto']
          : []),
        ...receiptCheck.issues,
      ],
    };

    links.push(linkReport);
    if (!isIntact) {
      brokenLinks.push(linkReport);
    }

    // Actualiza el hash previo esperado para el eslabón siguiente
    expectedPrevHash = storedHash || recomputedHash;
  }

  return {
    entity: 'pagos',
    genesisHash: GENESIS_PAYMENT_HASH,
    totalRecords: ordered.length,
    intactCount: ordered.length - brokenLinks.length,
    compromisedCount: brokenLinks.length,
    isChainValid: brokenLinks.length === 0,
    brokenLinks,
    links,
  };
}

// Exporta constantes génesis, constructores canónicos, firmadores HMAC y verificadores de cadenas contables
module.exports = {
  GENESIS_INVOICE_HASH,
  GENESIS_PAYMENT_HASH,
  buildInvoiceCanonicalPayload,
  computeInvoiceChainHash,
  computeReceiptHash,
  validatePaymentReceipt,
  buildPaymentCanonicalPayload,
  computePaymentChainHash,
  verifyInvoiceChain,
  verifyPaymentChain,
};
