const {
  GENESIS_INVOICE_HASH,
  GENESIS_PAYMENT_HASH,
} = require('../../../domain/integrity/hashChain');

class BillingRepository {
  constructor({ db }) {
    this.db = db;
  }

  // ===== FACTURAS =====

  async listInvoices() {
    const result = await this.db.query(`
      SELECT f.*,
        u.nombre AS cliente_nombre,
        u.email AS cliente_email,
        e.nombre AS empleado_nombre
      FROM facturas f
      LEFT JOIN usuarios u ON f.usuario_id = u.id
      LEFT JOIN usuarios e ON f.empleado_id = e.id
      ORDER BY f.id ASC
    `);
    return result.rows;
  }

  async findInvoiceById(id) {
    const result = await this.db.query(
      `SELECT f.*,
         u.nombre AS cliente_nombre,
         u.email AS cliente_email,
         e.nombre AS empleado_nombre
       FROM facturas f
       LEFT JOIN usuarios u ON f.usuario_id = u.id
       LEFT JOIN usuarios e ON f.empleado_id = e.id
       WHERE f.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getLastInvoiceHash() {
    const result = await this.db.query(
      'SELECT hash_actual FROM facturas ORDER BY id DESC LIMIT 1'
    );
    return result.rows[0]?.hash_actual || GENESIS_INVOICE_HASH;
  }

  async getNextInvoiceConsecutive() {
    const result = await this.db.query(
      'SELECT COUNT(*)::int AS total, COALESCE(MAX(id), 0)::int AS max_id FROM facturas'
    );
    const nextNum = Math.max(result.rows[0].total, result.rows[0].max_id) + 1;
    return `FAC-${String(nextNum).padStart(6, '0')}`;
  }

  async createInvoice({
    numeroConsecutivo,
    pedidoId = null,
    usuarioId = null,
    empleadoId = null,
    canal = 'presencial',
    subtotal,
    descuento = 0,
    porcentajeDescuento = 0,
    impuestos,
    porcentajeImpuesto = 19,
    total,
    estado = 'Emitida',
    prevHash,
    hashActual,
  }) {
    const result = await this.db.query(
      `INSERT INTO facturas (
        numero_consecutivo, pedido_id, usuario_id, empleado_id, canal,
        subtotal, descuento, porcentaje_descuento, impuestos, porcentaje_impuesto,
        total, estado, prev_hash, hash_actual
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        numeroConsecutivo,
        pedidoId,
        usuarioId,
        empleadoId,
        canal,
        subtotal,
        descuento,
        porcentajeDescuento,
        impuestos,
        porcentajeImpuesto,
        total,
        estado,
        prevHash,
        hashActual,
      ]
    );
    return result.rows[0];
  }

  async updateInvoiceStatus(id, estado) {
    const result = await this.db.query(
      `UPDATE facturas
       SET estado = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [estado, id]
    );
    return result.rows[0] || null;
  }

  async updateInvoiceChainFields(
    id,
    { total, descuento, porcentajeDescuento, impuestos, prevHash, hashActual, estado }
  ) {
    const result = await this.db.query(
      `UPDATE facturas
       SET total = COALESCE($1, total),
           descuento = COALESCE($2, descuento),
           porcentaje_descuento = COALESCE($3, porcentaje_descuento),
           impuestos = COALESCE($4, impuestos),
           prev_hash = COALESCE($5, prev_hash),
           hash_actual = COALESCE($6, hash_actual),
           estado = COALESCE($7, estado),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [total, descuento, porcentajeDescuento, impuestos, prevHash, hashActual, estado, id]
    );
    return result.rows[0] || null;
  }

  // ===== PAGOS =====

  async listPayments() {
    const result = await this.db.query(`
      SELECT p.*,
        f.numero_consecutivo AS factura_numero,
        f.total AS factura_total,
        u.nombre AS cliente_nombre,
        u.email AS cliente_email
      FROM pagos p
      LEFT JOIN facturas f ON p.factura_id = f.id
      LEFT JOIN usuarios u ON p.usuario_id = u.id
      ORDER BY p.id ASC
    `);
    return result.rows;
  }

  async findPaymentById(id) {
    const result = await this.db.query('SELECT * FROM pagos WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async getLastPaymentHash() {
    const result = await this.db.query(
      'SELECT hash_actual FROM pagos ORDER BY id DESC LIMIT 1'
    );
    return result.rows[0]?.hash_actual || GENESIS_PAYMENT_HASH;
  }

  async getAllReceiptReferences() {
    const result = await this.db.query('SELECT referencia_comprobante FROM pagos');
    return new Set(
      result.rows.map((r) => String(r.referencia_comprobante || '').trim()).filter(Boolean)
    );
  }

  async createPayment({
    facturaId,
    pedidoId = null,
    usuarioId = null,
    monto,
    metodoPago = 'Efectivo',
    referenciaComprobante,
    comprobanteMetadata = {},
    comprobanteHash,
    comprobanteValido = true,
    estado = 'Aprobado',
    prevHash,
    hashActual,
  }) {
    const result = await this.db.query(
      `INSERT INTO pagos (
        factura_id, pedido_id, usuario_id, monto, metodo_pago,
        referencia_comprobante, comprobante_metadata, comprobante_hash,
        comprobante_valido, estado, prev_hash, hash_actual
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        facturaId,
        pedidoId,
        usuarioId,
        monto,
        metodoPago,
        referenciaComprobante,
        JSON.stringify(comprobanteMetadata),
        comprobanteHash,
        comprobanteValido,
        estado,
        prevHash,
        hashActual,
      ]
    );
    return result.rows[0];
  }

  async updatePaymentChainFields(
    id,
    {
      monto,
      referenciaComprobante,
      comprobanteMetadata,
      comprobanteHash,
      comprobanteValido,
      prevHash,
      hashActual,
      estado,
    }
  ) {
    const result = await this.db.query(
      `UPDATE pagos
       SET monto = COALESCE($1, monto),
           referencia_comprobante = COALESCE($2, referencia_comprobante),
           comprobante_metadata = COALESCE($3, comprobante_metadata),
           comprobante_hash = COALESCE($4, comprobante_hash),
           comprobante_valido = COALESCE($5, comprobante_valido),
           prev_hash = COALESCE($6, prev_hash),
           hash_actual = COALESCE($7, hash_actual),
           estado = COALESCE($8, estado)
       WHERE id = $9
       RETURNING *`,
      [
        monto,
        referenciaComprobante,
        comprobanteMetadata ? JSON.stringify(comprobanteMetadata) : null,
        comprobanteHash,
        comprobanteValido,
        prevHash,
        hashActual,
        estado,
        id,
      ]
    );
    return result.rows[0] || null;
  }

  // ===== REPORTES DE CALIDAD =====

  async saveQualityReport({
    puntajeCalidad,
    totalRegistros,
    problemasDetectados,
    registrosCorregidos,
    detalle,
  }) {
    const result = await this.db.query(
      `INSERT INTO reportes_calidad (
        puntaje_calidad, total_registros, problemas_detectados, registros_corregidos, detalle
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        puntajeCalidad,
        totalRegistros,
        problemasDetectados,
        registrosCorregidos,
        JSON.stringify(detalle),
      ]
    );
    return result.rows[0];
  }

  async listQualityReports(limit = 10) {
    const result = await this.db.query(
      'SELECT * FROM reportes_calidad ORDER BY id DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }
}

module.exports = BillingRepository;
