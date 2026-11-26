/**
 * @file BillingRepository.js
 * @description Repositorio de acceso a datos para `facturas`, `pagos` (con integridad criptográfica encadenada) y `reportes_calidad`.
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Repositorios).
 * - (b) Responsabilidad única (SRP): Administrar la lectura y escritura SQL de documentos fiscales (`facturas`),
 *       recaudos con soporte documental (`pagos`) y auditorías históricas de limpieza (`reportes_calidad`),
 *       exponiendo los eslabones `prev_hash` y `hash_actual` necesarios para verificar la inmutabilidad contable.
 * - (c) Quién lo dispara / invoca:
 *       - Instanciado en `src/container.js` con inyección de `{ db }`.
 *       - Invocado por `OperationalService` (emisión de facturas consecutivas, cobros y verificación de integridad),
 *         `DataQualityService` (reparación/re-encadenamiento de registros y persistencia de reportes de calidad),
 *         `BenchmarkService` y `AiService`.
 * - (d) Buenas prácticas aplicadas:
 *       - Consultas 100 % parametrizadas (`$1, $2...`) contra SQL Injection y serialización JSON controlada para columnas `JSONB`.
 *       - Soporte de libro mayor encadenado (*Tamper-Evident Hash Chain*) retornando bloques génesis cuando la tabla está vacía.
 *       - Uso de `Set` en memoria (`getAllReceiptReferences`) para detección O(1) de comprobantes duplicados.
 *       - Enriquecimiento relacional con `LEFT JOIN` a `usuarios` y `facturas` evitando consultas N+1.
 */

// Importa los hashes semilla iniciales del dominio para encadenar la primera factura o el primer pago
const {
  // Constante de 64 caracteres usada cuando aún no existen facturas previas en base de datos
  GENESIS_INVOICE_HASH,
  // Constante de 64 caracteres usada cuando aún no existen pagos previos en base de datos
  GENESIS_PAYMENT_HASH,
} = require('../../../domain/integrity/hashChain');

// Define el repositorio encargado de persistir facturas, pagos y reportes de calidad de datos
class BillingRepository {
  /**
   * Inicializa el repositorio con la conexión a PostgreSQL inyectada.
   *
   * @param {object} deps - Dependencias inyectadas.
   * @param {object} deps.db - Adaptador de base de datos con método `query(text, params)`.
   */
  constructor({ db }) {
    // Almacena el adaptador de base de datos en la instancia del repositorio
    this.db = db;
  }

  // ===== FACTURAS =====

  /**
   * Lista todas las facturas ordenadas cronológicamente por `id`, incluyendo datos descriptivos
   * del cliente comprador y del empleado emisor mediante doble `LEFT JOIN` a `usuarios`.
   *
   * Consulta ejecutada:
   * `SELECT f.*, u.nombre AS cliente_nombre, u.email AS cliente_email, e.nombre AS empleado_nombre FROM facturas f LEFT JOIN usuarios u ... LEFT JOIN usuarios e ... ORDER BY f.id ASC`
   *
   * @returns {Promise<Array<object>>} Arreglo de facturas enriquecidas en orden de cadena ascendente.
   */
  async listInvoices() {
    // Ejecuta la consulta uniendo tanto al cliente (u) como al empleado (e) sobre la misma tabla 'usuarios'
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
    // Devuelve todas las facturas respetando el orden secuencial requerido para auditar la cadena de hashes
    return result.rows;
  }

  /**
   * Busca una factura individual por su identificador primario junto con la información del cliente y empleado.
   *
   * Consulta ejecutada:
   * `SELECT f.*, u.nombre AS cliente_nombre, u.email AS cliente_email, e.nombre AS empleado_nombre FROM facturas f ... WHERE f.id = $1`
   *
   * @param {number|string} id - Identificador primario de la factura.
   * @returns {Promise<object|null>} Registro enriquecido de la factura o `null` si no existe.
   */
  async findInvoiceById(id) {
    // Consulta parametrizada por clave primaria con LEFT JOIN hacia cliente y empleado
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
    // Retorna la factura localizada o null si el ID no existe
    return result.rows[0] || null;
  }

  /**
   * Obtiene el `hash_actual` de la última factura emitida para encadenar criptográficamente la siguiente.
   * Si la tabla `facturas` está vacía, retorna `GENESIS_INVOICE_HASH`.
   *
   * Consulta ejecutada: `SELECT hash_actual FROM facturas ORDER BY id DESC LIMIT 1`
   *
   * @returns {Promise<string>} Hash de 64 caracteres del último eslabón de facturación o el hash génesis.
   */
  async getLastInvoiceHash() {
    // Recupera únicamente el campo hash_actual del registro con mayor ID
    const result = await this.db.query(
      'SELECT hash_actual FROM facturas ORDER BY id DESC LIMIT 1'
    );
    // Devuelve el hash hallado o el bloque génesis cuando se va a emitir la primera factura
    return result.rows[0]?.hash_actual || GENESIS_INVOICE_HASH;
  }

  /**
   * Calcula y formatea el siguiente número consecutivo de facturación (ej. `'FAC-000004'`),
   * tomando el máximo entre el conteo actual de filas y el mayor `id` existente para evitar colisiones tras borrados.
   *
   * Consulta ejecutada: `SELECT COUNT(*)::int AS total, COALESCE(MAX(id), 0)::int AS max_id FROM facturas`
   *
   * @returns {Promise<string>} Consecutivo formateado con prefijo `FAC-` y 6 dígitos con ceros a la izquierda.
   */
  async getNextInvoiceConsecutive() {
    // Consulta en una sola pasada tanto la cantidad de facturas como el ID máximo registrado
    const result = await this.db.query(
      'SELECT COUNT(*)::int AS total, COALESCE(MAX(id), 0)::int AS max_id FROM facturas'
    );
    // Suma 1 al mayor de los dos indicadores garantizando monotonicidad estricta
    const nextNum = Math.max(result.rows[0].total, result.rows[0].max_id) + 1;
    // Formatea el número con relleno de ceros hasta 6 posiciones (ej. FAC-000001)
    return `FAC-${String(nextNum).padStart(6, '0')}`;
  }

  /**
   * Inserta una nueva factura fiscal con desglose tributario completo y sus hashes de integridad encadenada.
   *
   * Consulta ejecutada:
   * `INSERT INTO facturas (numero_consecutivo, pedido_id, usuario_id, empleado_id, canal, subtotal, descuento, porcentaje_descuento, impuestos, porcentaje_impuesto, total, estado, prev_hash, hash_actual) VALUES ($1..$14) RETURNING *`
   *
   * @param {object} data - Datos completos de la factura a emitir.
   * @param {string} data.numeroConsecutivo - Consecutivo único (ej. `'FAC-000001'`).
   * @param {number|null} [data.pedidoId=null] - ID del pedido asociado en `orders`.
   * @param {number|null} [data.usuarioId=null] - ID del cliente receptor.
   * @param {number|null} [data.empleadoId=null] - ID del empleado cajero/emisor.
   * @param {string} [data.canal='presencial'] - Canal comercial de la venta.
   * @param {number} data.subtotal - Valor bruto antes de descuentos e impuestos.
   * @param {number} [data.descuento=0] - Monto descontado.
   * @param {number} [data.porcentajeDescuento=0] - Porcentaje de descuento aplicado.
   * @param {number} data.impuestos - Monto de impuestos calculado.
   * @param {number} [data.porcentajeImpuesto=19] - Tarifa porcentual de impuesto (19% por defecto).
   * @param {number} data.total - Valor neto final a pagar.
   * @param {string} [data.estado='Emitida'] - Estado inicial de la factura (`'Emitida'`, `'Pagada'`, `'Anulada'`).
   * @param {string} data.prevHash - Hash de la factura inmediatamente anterior (o génesis).
   * @param {string} data.hashActual - Hash HMAC-SHA256 calculado para esta factura.
   * @returns {Promise<object>} Registro completo de la factura insertada.
   */
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
    // Ejecuta INSERT parametrizado con los 14 campos de facturación y cadena criptográfica
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
    // Retorna la factura creada con su ID y timestamps autogenerados
    return result.rows[0];
  }

  /**
   * Actualiza el estado de una factura (por ejemplo, de `'Emitida'` a `'Pagada'` cuando se aprueba su pago).
   *
   * Consulta ejecutada: `UPDATE facturas SET estado = $1, updated_at = NOW() WHERE id = $2 RETURNING *`
   *
   * @param {number|string} id - Identificador primario de la factura.
   * @param {string} estado - Nuevo estado documental de la factura.
   * @returns {Promise<object|null>} Factura actualizada o `null` si no existe.
   */
  async updateInvoiceStatus(id, estado) {
    // Actualiza el estado y sella la fecha de modificación en PostgreSQL
    const result = await this.db.query(
      `UPDATE facturas
       SET estado = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [estado, id]
    );
    // Devuelve la fila modificada o null si el ID no existe
    return result.rows[0] || null;
  }

  /**
   * Actualiza campos financieros y re-encadena los hashes (`prev_hash`, `hash_actual`) de una factura
   * durante procesos autorizados de saneamiento/reparación de calidad de datos.
   *
   * Consulta ejecutada: `UPDATE facturas SET ... updated_at = NOW() WHERE id = $8 RETURNING *`
   *
   * @param {number|string} id - Identificador primario de la factura a corregir.
   * @param {object} fields - Valores corregidos y nuevos eslabones de hash.
   * @returns {Promise<object|null>} Factura actualizada o `null` si no existe.
   */
  async updateInvoiceChainFields(
    id,
    { total, descuento, porcentajeDescuento, impuestos, prevHash, hashActual, estado }
  ) {
    // Ejecuta UPDATE parcial seguro mediante COALESCE preservando valores no enviados
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
    // Retorna la factura reparada o null
    return result.rows[0] || null;
  }

  // ===== PAGOS =====

  /**
   * Lista todos los pagos ordenados secuencialmente por `id` junto con el consecutivo/total de su factura
   * y los datos del cliente mediante `LEFT JOIN`.
   *
   * Consulta ejecutada:
   * `SELECT p.*, f.numero_consecutivo AS factura_numero, f.total AS factura_total, u.nombre AS cliente_nombre, u.email AS cliente_email FROM pagos p ... ORDER BY p.id ASC`
   *
   * @returns {Promise<Array<object>>} Lista ordenada de pagos lista para visualización y verificación de cadena.
   */
  async listPayments() {
    // Consulta todos los pagos enriquecidos con información de factura y usuario pagador
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
    // Devuelve las filas en orden ascendente de eslabón
    return result.rows;
  }

  /**
   * Busca un pago individual por su clave primaria.
   *
   * Consulta ejecutada: `SELECT * FROM pagos WHERE id = $1`
   *
   * @param {number|string} id - Identificador primario del pago.
   * @returns {Promise<object|null>} Registro del pago o `null` si no existe.
   */
  async findPaymentById(id) {
    // Ejecuta búsqueda parametrizada por ID en la tabla 'pagos'
    const result = await this.db.query('SELECT * FROM pagos WHERE id = $1', [id]);
    // Retorna el pago encontrado o null
    return result.rows[0] || null;
  }

  /**
   * Recupera el `hash_actual` del último pago registrado para enlazar el próximo pago en la cadena.
   * Si aún no hay pagos, devuelve `GENESIS_PAYMENT_HASH`.
   *
   * Consulta ejecutada: `SELECT hash_actual FROM pagos ORDER BY id DESC LIMIT 1`
   *
   * @returns {Promise<string>} Hash de 64 caracteres del último pago o hash génesis de pagos.
   */
  async getLastPaymentHash() {
    // Obtiene el hash del último registro insertado en la tabla 'pagos'
    const result = await this.db.query(
      'SELECT hash_actual FROM pagos ORDER BY id DESC LIMIT 1'
    );
    // Retorna el último eslabón o la constante génesis si la tabla está vacía
    return result.rows[0]?.hash_actual || GENESIS_PAYMENT_HASH;
  }

  /**
   * Obtiene el conjunto único (`Set`) de todas las referencias de comprobantes de pago registradas hasta el momento,
   * permitiendo validar en tiempo constante O(1) que un comprobante no sea reutilizado de forma fraudulenta.
   *
   * Consulta ejecutada: `SELECT referencia_comprobante FROM pagos`
   *
   * @returns {Promise<Set<string>>} Conjunto de referencias de comprobante limpias y no vacías.
   */
  async getAllReceiptReferences() {
    // Consulta únicamente la columna liviana 'referencia_comprobante' de todos los pagos
    const result = await this.db.query('SELECT referencia_comprobante FROM pagos');
    // Normaliza con trim(), descarta cadenas vacías y construye un Set de búsqueda rápida O(1)
    return new Set(
      result.rows.map((r) => String(r.referencia_comprobante || '').trim()).filter(Boolean)
    );
  }

  /**
   * Registra un nuevo pago asociado a una factura junto con los metadatos de su comprobante y hashes de integridad.
   *
   * Consulta ejecutada:
   * `INSERT INTO pagos (factura_id, pedido_id, usuario_id, monto, metodo_pago, referencia_comprobante, comprobante_metadata, comprobante_hash, comprobante_valido, estado, prev_hash, hash_actual) VALUES ($1..$12) RETURNING *`
   *
   * @param {object} data - Atributos del pago y su soporte documental.
   * @param {number} data.facturaId - ID de la factura que se está pagando.
   * @param {number|null} [data.pedidoId=null] - ID opcional del pedido asociado.
   * @param {number|null} [data.usuarioId=null] - ID opcional del usuario que realiza el pago.
   * @param {number} data.monto - Monto monetario pagado.
   * @param {string} [data.metodoPago='Efectivo'] - Medio de pago utilizado (`Efectivo`, `Tarjeta`, `Transferencia`, etc.).
   * @param {string} data.referenciaComprobante - Número o código de referencia del comprobante.
   * @param {object} [data.comprobanteMetadata={}] - Metadatos adicionales del soporte (entidad, archivo adjunto, etc.).
   * @param {string} data.comprobanteHash - Hash criptográfico de verificación del comprobante.
   * @param {boolean} [data.comprobanteValido=true] - Indicador booleano del resultado de validación del soporte.
   * @param {string} [data.estado='Aprobado'] - Estado del pago (`'Aprobado'`, `'Rechazado'`, `'En Revisión'`).
   * @param {string} data.prevHash - Hash del pago anterior en la cadena (o génesis).
   * @param {string} data.hashActual - Hash HMAC-SHA256 calculado para este pago.
   * @returns {Promise<object>} Fila completa del pago recién registrado.
   */
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
    // Ejecuta INSERT parametrizado serializando comprobanteMetadata como texto JSON para la columna JSONB
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
    // Retorna el pago insertado con su ID y fecha_pago autogenerados
    return result.rows[0];
  }

  /**
   * Actualiza atributos y re-encadena los hashes (`comprobante_hash`, `prev_hash`, `hash_actual`)
   * de un pago durante procesos controlados de saneamiento en `DataQualityService`.
   *
   * Consulta ejecutada: `UPDATE pagos SET ... WHERE id = $9 RETURNING *`
   *
   * @param {number|string} id - Identificador primario del pago a actualizar.
   * @param {object} fields - Campos financieros, de soporte y criptográficos a actualizar.
   * @returns {Promise<object|null>} Registro del pago actualizado o `null` si no existe.
   */
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
    // Ejecuta UPDATE parcial seguro convirtiendo comprobanteMetadata a JSON solo cuando fue suministrado
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
    // Retorna la fila actualizada del pago o null si el ID no existe
    return result.rows[0] || null;
  }

  // ===== REPORTES DE CALIDAD =====

  /**
   * Almacena el resultado consolidado de una auditoría o proceso de limpieza de calidad de datos.
   *
   * Consulta ejecutada:
   * `INSERT INTO reportes_calidad (puntaje_calidad, total_registros, problemas_detectados, registros_corregidos, detalle) VALUES ($1..$5) RETURNING *`
   *
   * @param {object} report - Métricas y hallazgos de la corrida de calidad.
   * @param {number} report.puntajeCalidad - Calificación porcentual de salud de datos (0 a 100).
   * @param {number} report.totalRegistros - Total de registros inspeccionados.
   * @param {number} report.problemasDetectados - Total de inconsistencias o duplicados hallados.
   * @param {number} report.registrosCorregidos - Cantidad de registros normalizados o reparados.
   * @param {object} report.detalle - Desglose estructurado de hallazgos serializado en `JSONB`.
   * @returns {Promise<object>} Registro del reporte de calidad persistido.
   */
  async saveQualityReport({
    puntajeCalidad,
    totalRegistros,
    problemasDetectados,
    registrosCorregidos,
    detalle,
  }) {
    // Inserta las métricas y serializa el objeto 'detalle' a JSON para almacenamiento en columna JSONB
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
    // Devuelve el reporte recién guardado con su ID y timestamp
    return result.rows[0];
  }

  /**
   * Lista los reportes históricos de calidad de datos más recientes primero.
   *
   * Consulta ejecutada: `SELECT * FROM reportes_calidad ORDER BY id DESC LIMIT $1`
   *
   * @param {number} [limit=10] - Cantidad máxima de reportes recientes a recuperar.
   * @returns {Promise<Array<object>>} Arreglo de reportes de calidad ordenados del más reciente al más antiguo.
   */
  async listQualityReports(limit = 10) {
    // Ejecuta SELECT parametrizado acotando el número máximo de filas devueltas
    const result = await this.db.query(
      'SELECT * FROM reportes_calidad ORDER BY id DESC LIMIT $1',
      [limit]
    );
    // Retorna el historial reciente de auditorías de calidad
    return result.rows;
  }
}

// Exporta la clase BillingRepository para su registro en el contenedor de dependencias
module.exports = BillingRepository;
