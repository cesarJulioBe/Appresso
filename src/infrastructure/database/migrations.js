const defaultDb = require('./connection');
const config = require('../../config/env');
const { toCanonicalKey } = require('../../domain/quality/dataCleaner');
const {
  GENESIS_INVOICE_HASH,
  GENESIS_PAYMENT_HASH,
  computeInvoiceChainHash,
  computeReceiptHash,
  computePaymentChainHash,
} = require('../../domain/integrity/hashChain');

/**
 * Ejecuta las migraciones idempotentes sobre PostgreSQL sin destruir datos existentes.
 */
async function ensureSchema(db = defaultDb) {
  // 1. Extender tabla usuarios con roles, documento, teléfono y nombre_normalizado
  await db.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS rol VARCHAR(30) DEFAULT 'cliente',
      ADD COLUMN IF NOT EXISTS documento VARCHAR(40),
      ADD COLUMN IF NOT EXISTS telefono VARCHAR(30),
      ADD COLUMN IF NOT EXISTS nombre_normalizado VARCHAR(150);
  `);

  // 2. Tabla categorias
  await db.query(`
    CREATE TABLE IF NOT EXISTS categorias (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      nombre_normalizado VARCHAR(120) NOT NULL,
      descripcion TEXT,
      estado VARCHAR(30) DEFAULT 'Activa',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 3. Tabla items (Catálogo de productos con inventario/stock)
  await db.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      sku VARCHAR(50) NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      nombre_normalizado VARCHAR(150) NOT NULL,
      categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
      precio NUMERIC(12, 2) NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      estado VARCHAR(30) DEFAULT 'Activo',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 4. Extender tabla orders con canal, cliente/empleado y desglose financiero
  await db.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS empleado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS canal VARCHAR(30) DEFAULT 'presencial',
      ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS descuento NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS impuestos NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
  `);

  // 5. Tabla facturas (con número consecutivo, impuestos, descuentos y hash encadenado)
  await db.query(`
    CREATE TABLE IF NOT EXISTS facturas (
      id SERIAL PRIMARY KEY,
      numero_consecutivo VARCHAR(30) UNIQUE NOT NULL,
      pedido_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      empleado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      canal VARCHAR(30) DEFAULT 'presencial',
      subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
      descuento NUMERIC(12, 2) NOT NULL DEFAULT 0,
      porcentaje_descuento NUMERIC(5, 2) NOT NULL DEFAULT 0,
      impuestos NUMERIC(12, 2) NOT NULL DEFAULT 0,
      porcentaje_impuesto NUMERIC(5, 2) NOT NULL DEFAULT 19,
      total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      estado VARCHAR(30) DEFAULT 'Emitida',
      prev_hash VARCHAR(64) NOT NULL,
      hash_actual VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 6. Tabla pagos (con distintos métodos, comprobante adjunto y hash encadenado)
  await db.query(`
    CREATE TABLE IF NOT EXISTS pagos (
      id SERIAL PRIMARY KEY,
      factura_id INTEGER REFERENCES facturas(id) ON DELETE CASCADE,
      pedido_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      monto NUMERIC(12, 2) NOT NULL DEFAULT 0,
      metodo_pago VARCHAR(40) NOT NULL DEFAULT 'Efectivo',
      referencia_comprobante VARCHAR(100) NOT NULL,
      comprobante_metadata JSONB DEFAULT '{}'::jsonb,
      comprobante_hash VARCHAR(64) NOT NULL,
      comprobante_valido BOOLEAN DEFAULT true,
      estado VARCHAR(30) DEFAULT 'Aprobado',
      prev_hash VARCHAR(64) NOT NULL,
      hash_actual VARCHAR(64) NOT NULL,
      fecha_pago TIMESTAMP DEFAULT NOW()
    );
  `);

  // 7. Tabla reportes_calidad (auditoría de limpieza y normalización de datos)
  await db.query(`
    CREATE TABLE IF NOT EXISTS reportes_calidad (
      id SERIAL PRIMARY KEY,
      puntaje_calidad NUMERIC(5, 2) NOT NULL,
      total_registros INTEGER NOT NULL DEFAULT 0,
      problemas_detectados INTEGER NOT NULL DEFAULT 0,
      registros_corregidos INTEGER NOT NULL DEFAULT 0,
      detalle JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

/**
 * Siembra datos iniciales completos y coherentes si las nuevas tablas operativas están vacías.
 */
async function seedInitialOperationalData(db = defaultDb, secret = config.hmacSecret) {
  await ensureSchema(db);
  const effectiveSecret = secret || process.env.HMAC_SECRET || 'appresso_default_hmac_secret';

  // 1. Sembrar Categorías si está vacía
  const catCountRes = await db.query('SELECT COUNT(*) FROM categorias');
  if (parseInt(catCountRes.rows[0].count, 10) === 0) {
    const initialCategories = [
      {
        nombre: 'Café Caliente',
        descripcion: 'Bebidas a base de espresso y filtrados artesanales de origen',
      },
      {
        nombre: 'Café Frío',
        descripcion: 'Cold brew, frappés y lattes helados',
      },
      {
        nombre: 'Pastelería y Panadería',
        descripcion: 'Croissants, tortas artesanales y horneados frescos',
      },
      {
        nombre: 'Desayunos y Brunch',
        descripcion: 'Sándwiches, bowls y combos matutinos',
      },
      {
        nombre: 'Accesorios y Café en Grano',
        descripcion: 'Bolsas de café especial 500g, prensas y métodos',
      },
    ];

    for (const c of initialCategories) {
      await db.query(
        `INSERT INTO categorias (nombre, nombre_normalizado, descripcion, estado)
         VALUES ($1, $2, $3, 'Activa')`,
        [c.nombre, toCanonicalKey(c.nombre), c.descripcion]
      );
    }
  }

  // 2. Sembrar Ítems con inventario si está vacía
  const itemCountRes = await db.query('SELECT COUNT(*) FROM items');
  if (parseInt(itemCountRes.rows[0].count, 10) === 0) {
    const catsRes = await db.query('SELECT id, nombre_normalizado FROM categorias ORDER BY id ASC');
    const catByNorm = new Map(catsRes.rows.map((r) => [r.nombre_normalizado, r.id]));
    const defaultCatId = catsRes.rows[0]?.id || null;

    const initialItems = [
      {
        sku: 'CAF-AME-001',
        nombre: 'Café Americano de Origen',
        catKey: 'cafe caliente',
        precio: 5800,
        stock: 120,
      },
      {
        sku: 'CAF-CAP-002',
        nombre: 'Cappuccino Artesanal',
        catKey: 'cafe caliente',
        precio: 7900,
        stock: 95,
      },
      {
        sku: 'CAF-LAT-003',
        nombre: 'Latte Vainilla Caramel',
        catKey: 'cafe caliente',
        precio: 8500,
        stock: 80,
      },
      {
        sku: 'FRI-CLD-004',
        nombre: 'Cold Brew Naranja & Especias',
        catKey: 'cafe frio',
        precio: 9800,
        stock: 60,
      },
      {
        sku: 'FRI-MAT-005',
        nombre: 'Matcha Latte Frío',
        catKey: 'cafe frio',
        precio: 10500,
        stock: 55,
      },
      {
        sku: 'PAS-CRO-006',
        nombre: 'Croissant de Almendras',
        catKey: 'pasteleria y panaderia',
        precio: 7200,
        stock: 45,
      },
      {
        sku: 'PAS-TOR-007',
        nombre: 'Torta de Zanahoria y Nueces',
        catKey: 'pasteleria y panaderia',
        precio: 8900,
        stock: 40,
      },
      {
        sku: 'BRU-SAN-008',
        nombre: 'Sándwich Ciabatta Serrano',
        catKey: 'desayunos y brunch',
        precio: 16500,
        stock: 35,
      },
      {
        sku: 'GRA-ESP-009',
        nombre: 'Café en Grano Huila Reserva 500g',
        catKey: 'accesorios y cafe en grano',
        precio: 38000,
        stock: 25,
      },
    ];

    for (const it of initialItems) {
      await db.query(
        `INSERT INTO items (sku, nombre, nombre_normalizado, categoria_id, precio, stock, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'Activo')`,
        [
          it.sku,
          it.nombre,
          toCanonicalKey(it.nombre),
          catByNorm.get(it.catKey) || defaultCatId,
          it.precio,
          it.stock,
        ]
      );
    }
  }

  // 3. Asegurar usuarios con distintos roles (cliente, empleado, admin)
  const seedUsers = [
    {
      nombre: 'Laura Gómez',
      email: 'laura.gomez@appresso.co',
      rol: 'cliente',
      documento: 'CC10203040',
      telefono: '+573001112233',
    },
    {
      nombre: 'Carlos Mendoza',
      email: 'carlos.mendoza@appresso.co',
      rol: 'cliente',
      documento: 'CC10203041',
      telefono: '+573002223344',
    },
    {
      nombre: 'Valentina Ríos (Cajera)',
      email: 'valentina.cajera@appresso.co',
      rol: 'empleado',
      documento: 'CC10908070',
      telefono: '+573105556677',
    },
    {
      nombre: 'Andrés Silva (Barista)',
      email: 'andres.barista@appresso.co',
      rol: 'empleado',
      documento: 'CC10908071',
      telefono: '+573108889900',
    },
    {
      nombre: 'César Berrio (Admin)',
      email: 'admin@appresso.co',
      rol: 'admin',
      documento: 'CC1000111222',
      telefono: '+573209990000',
    },
  ];

  for (const u of seedUsers) {
    const existing = await db.query('SELECT id FROM usuarios WHERE email = $1', [u.email]);
    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO usuarios (nombre, nombre_normalizado, email, rol, documento, telefono, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'Activo')`,
        [u.nombre, toCanonicalKey(u.nombre), u.email, u.rol, u.documento, u.telefono]
      );
    } else {
      await db.query(
        `UPDATE usuarios
         SET nombre = COALESCE(nombre, $1),
             nombre_normalizado = COALESCE(nombre_normalizado, $2),
             rol = COALESCE(rol, $3),
             documento = COALESCE(documento, $4),
             telefono = COALESCE(telefono, $5)
         WHERE id = $6`,
        [
          u.nombre,
          toCanonicalKey(u.nombre),
          u.rol,
          u.documento,
          u.telefono,
          existing.rows[0].id,
        ]
      );
    }
  }

  // Normalizar usuarios existentes que no tengan rol o nombre_normalizado
  await db.query(`
    UPDATE usuarios
    SET rol = COALESCE(rol, 'cliente'),
        nombre = COALESCE(nombre, split_part(email, '@', 1)),
        nombre_normalizado = COALESCE(nombre_normalizado, lower(split_part(email, '@', 1)))
    WHERE rol IS NULL OR nombre IS NULL OR nombre_normalizado IS NULL;
  `);

  // 4. Sembrar Facturas y Pagos encadenados iniciales si la tabla facturas está vacía
  const invCountRes = await db.query('SELECT COUNT(*) FROM facturas');
  if (parseInt(invCountRes.rows[0].count, 10) === 0) {
    const usersRes = await db.query('SELECT * FROM usuarios ORDER BY id ASC LIMIT 5');
    const itemsRes = await db.query('SELECT * FROM items ORDER BY id ASC LIMIT 5');

    const cliente1 = usersRes.rows.find((u) => u.rol === 'cliente') || usersRes.rows[0];
    const empleado1 = usersRes.rows.find((u) => u.rol === 'empleado') || usersRes.rows[0];

    const sampleOrders = [
      {
        customer: cliente1?.nombre || 'Laura Gómez',
        usuarioId: cliente1?.id || null,
        empleadoId: empleado1?.id || null,
        canal: 'presencial',
        porcentajeDescuento: 5,
        metodoPago: 'Tarjeta',
        products: [
          {
            itemId: itemsRes.rows[0]?.id,
            name: itemsRes.rows[0]?.nombre || 'Café Americano de Origen',
            quantity: 2,
            price: Number(itemsRes.rows[0]?.precio || 5800),
          },
          {
            itemId: itemsRes.rows[5]?.id || itemsRes.rows[1]?.id,
            name: itemsRes.rows[5]?.nombre || 'Croissant de Almendras',
            quantity: 1,
            price: Number(itemsRes.rows[5]?.precio || 7200),
          },
        ],
      },
      {
        customer: 'Carlos Mendoza',
        usuarioId: cliente1?.id || null,
        empleadoId: empleado1?.id || null,
        canal: 'app',
        porcentajeDescuento: 10,
        metodoPago: 'Transferencia',
        products: [
          {
            itemId: itemsRes.rows[1]?.id,
            name: itemsRes.rows[1]?.nombre || 'Cappuccino Artesanal',
            quantity: 2,
            price: Number(itemsRes.rows[1]?.precio || 7900),
          },
          {
            itemId: itemsRes.rows[3]?.id || itemsRes.rows[2]?.id,
            name: itemsRes.rows[3]?.nombre || 'Cold Brew Naranja & Especias',
            quantity: 1,
            price: Number(itemsRes.rows[3]?.precio || 9800),
          },
        ],
      },
      {
        customer: 'Laura Gómez',
        usuarioId: cliente1?.id || null,
        empleadoId: empleado1?.id || null,
        canal: 'domicilio',
        porcentajeDescuento: 0,
        metodoPago: 'Efectivo',
        products: [
          {
            itemId: itemsRes.rows[4]?.id || itemsRes.rows[0]?.id,
            name: itemsRes.rows[4]?.nombre || 'Matcha Latte Frío',
            quantity: 3,
            price: Number(itemsRes.rows[4]?.precio || 10500),
          },
        ],
      },
    ];

    let prevInvoiceHash = GENESIS_INVOICE_HASH;
    let prevPaymentHash = GENESIS_PAYMENT_HASH;

    for (let i = 0; i < sampleOrders.length; i++) {
      const sample = sampleOrders[i];
      const subtotal = sample.products.reduce(
        (acc, p) => acc + Number(p.price) * Number(p.quantity),
        0
      );
      const descuento = Number(((subtotal * sample.porcentajeDescuento) / 100).toFixed(2));
      const baseGravable = subtotal - descuento;
      const impuestos = Number((baseGravable * 0.19).toFixed(2));
      const total = Number((baseGravable + impuestos).toFixed(2));

      const orderRes = await db.query(
        `INSERT INTO orders (customer, products, status, usuario_id, empleado_id, canal, subtotal, descuento, impuestos, total)
         VALUES ($1, $2, 'Delivered', $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          sample.customer,
          JSON.stringify(sample.products),
          sample.usuarioId,
          sample.empleadoId,
          sample.canal,
          subtotal,
          descuento,
          impuestos,
          total,
        ]
      );
      const createdOrder = orderRes.rows[0];
      const numeroConsecutivo = `FAC-${String(i + 1).padStart(6, '0')}`;

      const invoicePayload = {
        numeroConsecutivo,
        pedidoId: createdOrder.id,
        usuarioId: sample.usuarioId || 0,
        canal: sample.canal,
        subtotal,
        descuento,
        impuestos,
        total,
        prevHash: prevInvoiceHash,
      };
      const hashActualFactura = computeInvoiceChainHash(invoicePayload, effectiveSecret);

      const invRes = await db.query(
        `INSERT INTO facturas (
          numero_consecutivo, pedido_id, usuario_id, empleado_id, canal,
          subtotal, descuento, porcentaje_descuento, impuestos, porcentaje_impuesto,
          total, estado, prev_hash, hash_actual
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 19, $10, 'Pagada', $11, $12)
        RETURNING *`,
        [
          numeroConsecutivo,
          createdOrder.id,
          sample.usuarioId,
          sample.empleadoId,
          sample.canal,
          subtotal,
          descuento,
          sample.porcentajeDescuento,
          impuestos,
          total,
          prevInvoiceHash,
          hashActualFactura,
        ]
      );
      const createdInvoice = invRes.rows[0];
      prevInvoiceHash = hashActualFactura;

      const refComprobante = `COMP-2026-${String(i + 101).padStart(4, '0')}`;
      const comprobanteMeta = {
        entidad: 'PASARELA_APPRESSO',
        montoComprobante: total,
        archivoAdjunto: `comprobante_${numeroConsecutivo.toLowerCase()}.pdf`,
        verificadoAutomaticamente: true,
      };
      const comprobanteHash = computeReceiptHash(
        {
          facturaId: createdInvoice.id,
          metodoPago: sample.metodoPago,
          montoComprobante: total,
          referencia: refComprobante,
          entidad: 'PASARELA_APPRESSO',
        },
        effectiveSecret
      );

      const paymentPayload = {
        facturaId: createdInvoice.id,
        pedidoId: createdOrder.id,
        usuarioId: sample.usuarioId || 0,
        monto: total,
        metodoPago: sample.metodoPago,
        referenciaComprobante: refComprobante,
        comprobanteHash,
        prevHash: prevPaymentHash,
      };
      const hashActualPago = computePaymentChainHash(paymentPayload, effectiveSecret);

      await db.query(
        `INSERT INTO pagos (
          factura_id, pedido_id, usuario_id, monto, metodo_pago,
          referencia_comprobante, comprobante_metadata, comprobante_hash,
          comprobante_valido, estado, prev_hash, hash_actual
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'Aprobado', $9, $10)`,
        [
          createdInvoice.id,
          createdOrder.id,
          sample.usuarioId,
          total,
          sample.metodoPago,
          refComprobante,
          JSON.stringify(comprobanteMeta),
          comprobanteHash,
          prevPaymentHash,
          hashActualPago,
        ]
      );
      prevPaymentHash = hashActualPago;
    }
  }
}

module.exports = {
  ensureSchema,
  seedInitialOperationalData,
};
