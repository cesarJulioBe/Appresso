const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  toCanonicalKey,
  normalizeDisplayString,
  unifyCategoryName,
  parseAndCleanPrice,
  normalizeEmail,
  detectDuplicateItems,
  detectDuplicateUsers,
  detectInconsistentCategories,
} = require('../../../src/domain/quality/dataCleaner');

const {
  GENESIS_INVOICE_HASH,
  GENESIS_PAYMENT_HASH,
  computeInvoiceChainHash,
  computeReceiptHash,
  computePaymentChainHash,
  verifyInvoiceChain,
  verifyPaymentChain,
} = require('../../../src/domain/integrity/hashChain');

describe('Domain - Data Cleaning, Normalization & Quality', () => {
  it('normalizes strings and unifies inconsistent category names', () => {
    assert.equal(toCanonicalKey('  Café   Caliente!! '), 'cafe caliente');
    assert.equal(normalizeDisplayString('  cappuccino   de   LA  casa '), 'Cappuccino de la Casa');

    const cat1 = unifyCategoryName('  bebidas   calientes cafe ');
    const cat2 = unifyCategoryName('HOT COFFEE');
    assert.equal(cat1.displayName, 'Café Caliente');
    assert.equal(cat2.displayName, 'Café Caliente');
    assert.equal(cat1.canonicalKey, cat2.canonicalKey);
    assert.equal(cat1.wasInconsistent, true);
  });

  it('cleans malformed prices including currency symbols, separators, negatives, and NaN', () => {
    const p1 = parseAndCleanPrice('$ 12.500,00');
    assert.equal(p1.cleanPrice, 12500);
    assert.equal(p1.wasDirty, true);

    const p2 = parseAndCleanPrice('-8500 COP');
    assert.equal(p2.cleanPrice, 8500);
    assert.equal(p2.wasDirty, true);

    const p3 = parseAndCleanPrice('texto_invalido', { defaultPrice: 6000 });
    assert.equal(p3.cleanPrice, 6000);
    assert.equal(p3.wasDirty, true);
  });

  it('detects duplicate items, duplicate users, and inconsistent categories', () => {
    const items = [
      { id: 1, sku: 'CAF-01', nombre: 'Café Americano', precio: 5800, stock: 20 },
      { id: 2, sku: 'CAF-02', nombre: '  cafe   AMERICANO ', precio: -5800, stock: 10 },
    ];
    const itemDup = detectDuplicateItems(items);
    assert.equal(itemDup.totalDuplicateItems, 1);
    assert.equal(itemDup.priceIssues.length, 1);

    const users = [
      { id: 10, nombre: 'Laura Gómez', email: 'laura@appresso.co', documento: 'CC102030' },
      { id: 11, nombre: '  LAURA   gomez ', email: 'laura.dup@appresso.co', documento: 'CC102030' },
    ];
    const userDup = detectDuplicateUsers(users);
    assert.ok(userDup.totalDuplicateUsers >= 1);

    const categories = [
      { id: 1, nombre: 'Café Caliente' },
      { id: 2, nombre: '  cafes   calientes ' },
    ];
    const catIssues = detectInconsistentCategories(categories);
    assert.ok(catIssues.totalInconsistentCategories >= 1);

    const emailClean = normalizeEmail('  Juan..Perez@@gmail,com ');
    assert.equal(emailClean.wasDirty, true);
    assert.ok(emailClean.email.includes('@'));
  });
});

describe('Domain - Chained Hash Integrity (Invoices, Payments & Receipts)', () => {
  const secret = 'test_secret_key_2026';

  it('verifies an intact chain of invoices and detects tampering on any link', () => {
    const inv1 = {
      id: 1,
      numero_consecutivo: 'FAC-000001',
      pedido_id: 101,
      usuario_id: 5,
      canal: 'presencial',
      subtotal: 20000,
      descuento: 1000,
      porcentaje_descuento: 5,
      impuestos: 3610,
      total: 22610,
      estado: 'Pagada',
      prev_hash: GENESIS_INVOICE_HASH,
    };
    inv1.hash_actual = computeInvoiceChainHash(inv1, secret);

    const inv2 = {
      id: 2,
      numero_consecutivo: 'FAC-000002',
      pedido_id: 102,
      usuario_id: 6,
      canal: 'web',
      subtotal: 30000,
      descuento: 0,
      porcentaje_descuento: 0,
      impuestos: 5700,
      total: 35700,
      estado: 'Pagada',
      prev_hash: inv1.hash_actual,
    };
    inv2.hash_actual = computeInvoiceChainHash(inv2, secret);

    const validReport = verifyInvoiceChain([inv1, inv2], secret);
    assert.equal(validReport.isChainValid, true);
    assert.equal(validReport.CompromisedCount, 0);

    // Alterar ilegalmente el monto de la factura 1
    const tamperedInv1 = { ...inv1, total: 99999 };
    const tamperedReport = verifyInvoiceChain([tamperedInv1, inv2], secret);
    assert.equal(tamperedReport.isChainValid, false);
    assert.equal(tamperedReport.CompromisedCount, 1);
    assert.equal(tamperedReport.brokenLinks[0].id, 1);
  });

  it('verifies payment chain and detects fake or reused payment receipts', () => {
    const inv1 = {
      id: 1,
      numero_consecutivo: 'FAC-000001',
      total: 25000,
      estado: 'Pagada',
    };
    const invoicesById = new Map([[1, inv1]]);

    const receiptHash1 = computeReceiptHash(
      {
        facturaId: 1,
        metodoPago: 'Tarjeta',
        montoComprobante: 25000,
        referencia: 'COMP-1001',
        entidad: 'PASARELA_APPRESSO',
      },
      secret
    );

    const pay1 = {
      id: 1,
      factura_id: 1,
      pedido_id: 101,
      usuario_id: 5,
      monto: 25000,
      metodo_pago: 'Tarjeta',
      referencia_comprobante: 'COMP-1001',
      comprobante_metadata: { entidad: 'PASARELA_APPRESSO', montoComprobante: 25000 },
      comprobante_hash: receiptHash1,
      comprobante_valido: true,
      estado: 'Aprobado',
      prev_hash: GENESIS_PAYMENT_HASH,
    };
    pay1.hash_actual = computePaymentChainHash(pay1, secret);

    const validPayReport = verifyPaymentChain([pay1], invoicesById, secret);
    assert.equal(validPayReport.isChainValid, true);

    // Simular comprobante falso / reutilizado
    const pay2Fake = {
      ...pay1,
      id: 2,
      referencia_comprobante: 'COMP-FALSO-999',
      prev_hash: pay1.hash_actual,
    };
    pay2Fake.hash_actual = computePaymentChainHash(pay2Fake, secret);

    const fakeReport = verifyPaymentChain([pay1, pay2Fake], invoicesById, secret);
    assert.equal(fakeReport.isChainValid, false);
    assert.equal(fakeReport.compromisedCount, 1);
  });
});
