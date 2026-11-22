const crypto = require('crypto');
const { safeCompareHashes } = require('../fraud/hashUtils');

const GENESIS_INVOICE_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const GENESIS_PAYMENT_HASH = '1111111111111111111111111111111111111111111111111111111111111111';

function formatAmount(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

/**
 * Construye el payload canónico determinista de una factura para el hash encadenado.
 */
function buildInvoiceCanonicalPayload(invoice) {
  const canonical = {
    canal: String(invoice.canal || 'presencial'),
    descuento: formatAmount(invoice.descuento),
    impuestos: formatAmount(invoice.impuestos),
    numeroConsecutivo: String(invoice.numeroConsecutivo ?? invoice.numero_consecutivo ?? ''),
    pedidoId: Number(invoice.pedidoId ?? invoice.pedido_id ?? 0),
    prevHash: String(invoice.prevHash ?? invoice.prev_hash ?? GENESIS_INVOICE_HASH),
    subtotal: formatAmount(invoice.subtotal),
    total: formatAmount(invoice.total),
    usuarioId: Number(invoice.usuarioId ?? invoice.usuario_id ?? 0),
  };

  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Calcula el hash encadenado HMAC-SHA256 de una factura dado su prevHash.
 */
function computeInvoiceChainHash(invoice, secret) {
  if (!secret) throw new Error('HMAC_SECRET es requerido para calcular el hash de la factura');
  const payload = buildInvoiceCanonicalPayload(invoice);
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Calcula el hash criptográfico del comprobante de pago adjunto y valida su autenticidad.
 */
function computeReceiptHash(receiptData = {}, secret) {
  if (!secret) throw new Error('HMAC_SECRET es requerido para firmar el comprobante');
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

  const payload = JSON.stringify(canonicalReceipt, Object.keys(canonicalReceipt).sort());
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Valida si un pago corresponde íntegramente a su comprobante y a la factura asociada.
 */
function validatePaymentReceipt({
  payment,
  invoice,
  existingReceiptRefs = new Set(),
  secret,
}) {
  const issues = [];
  const ref = String(
    payment.referenciaComprobante ?? payment.referencia_comprobante ?? ''
  ).trim();

  if (!ref || ref.length < 4) {
    issues.push('Referencia de comprobante ausente o demasiado corta');
  }

  if (/FALSO|FAKE|INVALID|ALTERADO|TEST_FRAUD/i.test(ref)) {
    issues.push(`Comprobante marcado con firma/referencia fraudulenta (${ref})`);
  }

  if (existingReceiptRefs.has(ref) && ref) {
    issues.push(`Comprobante reutilizado: la referencia '${ref}' ya fue usada en otro pago`);
  }

  const paymentAmount = Number(payment.monto ?? 0);
  const receiptDeclaredAmount = Number(
    payment.comprobanteMetadata?.montoComprobante ??
      payment.comprobante_metadata?.montoComprobante ??
      paymentAmount
  );

  if (Math.abs(paymentAmount - receiptDeclaredAmount) > 0.01) {
    issues.push(
      `El monto del pago ($${formatAmount(paymentAmount)}) no coincide con el monto del comprobante ($${formatAmount(receiptDeclaredAmount)})`
    );
  }

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
 * Construye el payload canónico determinista de un pago para el hash encadenado.
 */
function buildPaymentCanonicalPayload(payment) {
  const canonical = {
    comprobanteHash: String(payment.comprobanteHash ?? payment.comprobante_hash ?? ''),
    facturaId: Number(payment.facturaId ?? payment.factura_id ?? 0),
    metodoPago: String(payment.metodoPago ?? payment.metodo_pago ?? 'Efectivo'),
    monto: formatAmount(payment.monto),
    pedidoId: Number(payment.pedidoId ?? payment.pedido_id ?? 0),
    prevHash: String(payment.prevHash ?? payment.prev_hash ?? GENESIS_PAYMENT_HASH),
    referenciaComprobante: String(
      payment.referenciaComprobante ?? payment.referencia_comprobante ?? ''
    ),
    usuarioId: Number(payment.usuarioId ?? payment.usuario_id ?? 0),
  };

  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Calcula el hash encadenado HMAC-SHA256 de un pago dado su prevHash.
 */
function computePaymentChainHash(payment, secret) {
  if (!secret) throw new Error('HMAC_SECRET es requerido para calcular el hash del pago');
  const payload = buildPaymentCanonicalPayload(payment);
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Verifica la integridad completa de la cadena de facturas en O(n).
 */
function verifyInvoiceChain(invoices = [], secret) {
  const ordered = [...invoices].sort((a, b) => Number(a.id) - Number(b.id));
  let expectedPrevHash = GENESIS_INVOICE_HASH;
  const links = [];
  const brokenLinks = [];

  for (let i = 0; i < ordered.length; i++) {
    const inv = ordered[i];
    const storedPrevHash = inv.prev_hash ?? inv.prevHash ?? GENESIS_INVOICE_HASH;
    const storedHash = inv.hash_actual ?? inv.hashActual ?? '';

    const prevLinkValid = storedPrevHash === expectedPrevHash;
    const recomputedHash = computeInvoiceChainHash(
      { ...inv, prev_hash: storedPrevHash },
      secret
    );
    const payloadHashValid = safeCompareHashes(storedHash, recomputedHash);
    const isCancelledSuspiciously =
      inv.estado === 'Anulada' && Number(inv.total) >= 100000;
    const isAbusiveDiscount = Number(inv.porcentaje_descuento ?? 0) > 30;

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
 * Verifica la integridad completa de la cadena de pagos y sus comprobantes en O(n).
 */
function verifyPaymentChain(payments = [], invoicesById = new Map(), secret) {
  const ordered = [...payments].sort((a, b) => Number(a.id) - Number(b.id));
  let expectedPrevHash = GENESIS_PAYMENT_HASH;
  const seenRefs = new Set();
  const links = [];
  const brokenLinks = [];

  for (let i = 0; i < ordered.length; i++) {
    const pay = ordered[i];
    const storedPrevHash = pay.prev_hash ?? pay.prevHash ?? GENESIS_PAYMENT_HASH;
    const storedHash = pay.hash_actual ?? pay.hashActual ?? '';
    const invoice = invoicesById.get(Number(pay.factura_id ?? pay.facturaId));

    const receiptCheck = validatePaymentReceipt({
      payment: pay,
      invoice,
      existingReceiptRefs: seenRefs,
      secret,
    });

    const ref = String(pay.referencia_comprobante ?? pay.referenciaComprobante ?? '').trim();
    if (ref) seenRefs.add(ref);

    const prevLinkValid = storedPrevHash === expectedPrevHash;
    const recomputedHash = computePaymentChainHash(
      { ...pay, prev_hash: storedPrevHash },
      secret
    );
    const payloadHashValid = safeCompareHashes(storedHash, recomputedHash);
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
