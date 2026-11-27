/**
 * @file migrations.js
 * @description Motor de migraciones DDL idempotentes y sembrado (seeding) operativo inicial con integridad criptográfica.
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Esquema y Semillas).
 * - (b) Responsabilidad única (SRP): Garantizar que todas las tablas y columnas requeridas por la plataforma
 *       existan en PostgreSQL sin destruir información previa, y poblar datos maestros/operativos iniciales
 *       (categorías, ítems, usuarios por rol, pedidos, facturas y pagos encadenados) cuando la base está vacía.
 * - (c) Quién lo dispara / invoca:
 *       1. `src/server.js` al arrancar la aplicación (`seedInitialOperationalData(db, config.hmacSecret)`).
 *       2. Suites de pruebas de integración y scripts de aprovisionamiento (`ensureSchema` / `seedInitialOperationalData`).
 * - (d) Buenas prácticas aplicadas:
 *       - Migraciones 100 % idempotentes (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `COALESCE`).
 *       - Consultas de inserción y actualización parametrizadas (`$1, $2...`) contra inyección SQL.
 *       - Normalización canónica (`toCanonicalKey`) al sembrar nombres para evitar duplicados semánticos.
 *       - Construcción de cadenas de bloques ligeras (HMAC-SHA256 con `prev_hash` -> `hash_actual`) desde el bloque génesis
 *         tanto para facturas como para pagos y comprobantes iniciales.
 */

// Importa el adaptador de base de datos por defecto por si el llamador no inyecta uno explícito
const defaultDb = require('./connection');
// Importa las variables de configuración de entorno (incluyendo el secreto HMAC por defecto)
const config = require('../../config/env');
// Importa la utilidad de dominio que transforma nombres libres en claves canónicas sin tildes ni ruido
const { toCanonicalKey } = require('../../domain/quality/dataCleaner');
// Importa las constantes génesis y funciones criptográficas de dominio para encadenar facturas, recibos y pagos
const {
  // Hash semilla inicial (64 caracteres) que actúa como eslabón previo de la primera factura
  GENESIS_INVOICE_HASH,
  // Hash semilla inicial (64 caracteres) que actúa como eslabón previo del primer pago
  GENESIS_PAYMENT_HASH,
  // Función pura que calcula el HMAC-SHA256 del eslabón actual en la cadena de facturas
  computeInvoiceChainHash,
  // Función pura que genera la huella criptográfica verificable de un comprobante de pago
  computeReceiptHash,
  // Función pura que calcula el HMAC-SHA256 del eslabón actual en la cadena de pagos
  computePaymentChainHash,
} = require('../../domain/integrity/hashChain');

/**
 * Ejecuta las migraciones DDL idempotentes sobre PostgreSQL para crear o extender
 * las tablas operativas del sistema sin alterar ni borrar registros existentes.
 *
 * Consultas ejecutadas:
 * 1. `ALTER TABLE usuarios` agregando `rol`, `documento`, `telefono` y `nombre_normalizado`.
 * 2. `CREATE TABLE IF NOT EXISTS categorias` para agrupar productos del catálogo.
 * 3. `CREATE TABLE IF NOT EXISTS items` para productos, precios unitarios y control de stock.
 * 4. `ALTER TABLE orders` extendiendo pedidos con referencias de usuario/empleado, canal y montos financieros.
 * 5. `CREATE TABLE IF NOT EXISTS facturas` con numeración consecutiva única e integridad encadenada (`prev_hash`, `hash_actual`).
 * 6. `CREATE TABLE IF NOT EXISTS pagos` con metadatos JSONB de comprobante y doble hash de integridad.
 * 7. `CREATE TABLE IF NOT EXISTS reportes_calidad` para almacenar auditorías históricas de limpieza de datos.
 *
 * @param {object} [db=defaultDb] - Adaptador de conexión con método `query(sql, params)`.
 * @returns {Promise<void>} Promesa que concluye cuando todo el esquema ha sido verificado/actualizado.
 */
async function ensureSchema(db = defaultDb) {
  // 0A. Crea la tabla base 'usuarios' si la base de datos es completamente nueva (en un computador recién clonado)
  await db.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150),
      email VARCHAR(150) UNIQUE NOT NULL,
      estado VARCHAR(30) NOT NULL DEFAULT 'Activo',
      fecha_creacion TIMESTAMP DEFAULT NOW(),
      fecha_actualizacion TIMESTAMP DEFAULT NOW()
    );
  `);

  // 1. Extiende la tabla 'usuarios' añadiendo atributos operativos si aún no existen en el esquema
  await db.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS rol VARCHAR(30) DEFAULT 'cliente',
      ADD COLUMN IF NOT EXISTS documento VARCHAR(40),
      ADD COLUMN IF NOT EXISTS telefono VARCHAR(30),
      ADD COLUMN IF NOT EXISTS nombre_normalizado VARCHAR(150);
  `);

  // 2. Crea la tabla 'categorias' para clasificar el menú/catálogo con clave normalizada y marcas de tiempo
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

  // 3. Crea la tabla 'items' (catálogo de productos con SKU, llave foránea a categorias, precio exacto NUMERIC y stock)
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

  // 0B. Crea la tabla base 'orders' si la base de datos acaba de ser creada desde cero
  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer VARCHAR(150) NOT NULL,
      products JSONB NOT NULL DEFAULT '[]'::jsonb,
      status VARCHAR(40) NOT NULL DEFAULT 'Requested',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 4. Extiende la tabla 'orders' con trazabilidad de cliente/empleado, canal de venta y desglose tributario/financiero
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

  // 5. Crea la tabla 'facturas' con consecutivo único, impuestos/descuentos explícitos y eslabones criptográficos
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

  // 6. Crea la tabla 'pagos' vinculada en cascada a facturas, con soporte JSONB para comprobantes y cadena de hashes
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

  // 7. Crea la tabla 'reportes_calidad' para persistir métricas y hallazgos de auditorías de calidad de datos
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

  // 8. Crea la tabla 'routes' (grafo de rutas terrestres entre ciudades para el algoritmo de Dijkstra)
  await db.query(`
    CREATE TABLE IF NOT EXISTS routes (
      id SERIAL PRIMARY KEY,
      origin VARCHAR(120) NOT NULL,
      destination VARCHAR(120) NOT NULL,
      distance_km NUMERIC(10, 2) NOT NULL,
      pair_route_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 9. Crea la tabla 'umbrales_horarios' (configuración antifraude por franja horaria)
  await db.query(`
    CREATE TABLE IF NOT EXISTS umbrales_horarios (
      id SERIAL PRIMARY KEY,
      franja VARCHAR(40) UNIQUE NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fin TIME NOT NULL,
      umbral_transacciones INTEGER NOT NULL,
      ventana_segundos INTEGER NOT NULL DEFAULT 3
    );
  `);

  // 10. Crea la tabla 'transacciones' (eventos firmados con HMAC-SHA256 e idempotencia por id_txn)
  await db.query(`
    CREATE TABLE IF NOT EXISTS transacciones (
      id SERIAL PRIMARY KEY,
      id_txn BIGINT UNIQUE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      valor NUMERIC(14, 2) NOT NULL,
      fecha_txn TIMESTAMP NOT NULL,
      estado VARCHAR(40) NOT NULL DEFAULT 'Procesada',
      hash VARCHAR(64) NOT NULL,
      metodo_pago VARCHAR(50),
      fecha_creacion TIMESTAMP DEFAULT NOW(),
      fecha_actualizacion TIMESTAMP DEFAULT NOW()
    );
  `);

  // 11. Crea la tabla 'anomalias' (alertas de fraude por ráfaga en ventana deslizante o hash inválido)
  await db.query(`
    CREATE TABLE IF NOT EXISTS anomalias (
      id SERIAL PRIMARY KEY,
      transaccion_id INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
      tipo VARCHAR(50) NOT NULL DEFAULT 'POSIBLE_FRAUDE',
      nivel VARCHAR(30) NOT NULL DEFAULT 'Alto',
      cantidad_transacciones INTEGER NOT NULL,
      ventana_segundos INTEGER NOT NULL,
      fecha_creacion TIMESTAMP DEFAULT NOW(),
      fecha_actualizacion TIMESTAMP DEFAULT NOW()
    );
  `);
}

/**
 * Garantiza primero la existencia del esquema (`ensureSchema`) y luego siembra datos operativos
 * iniciales coherentes y encadenados criptográficamente únicamente si las tablas están vacías.
 *
 * Operaciones realizadas:
 * - Siembra 5 categorías base de cafetería si `categorias` tiene 0 registros.
 * - Siembra 9 productos con SKU, precio e inventario inicial si `items` tiene 0 registros.
 * - Inserta o completa (upsert lógico con `COALESCE`) 5 usuarios con roles `cliente`, `empleado` y `admin`,
 *   y normaliza cualquier usuario previo que tenga campos nulos.
 * - Si `facturas` está vacía, genera 3 pedidos de muestra con sus respectivas facturas consecutivas
 *   (`FAC-000001`..`FAC-000003`) y pagos aprobados con hashes encadenados válidos.
 *
 * @param {object} [db=defaultDb] - Adaptador de base de datos con método `query(sql, params)`.
 * @param {string} [secret=config.hmacSecret] - Secreto HMAC utilizado para firmar la cadena de hashes inicial.
 * @returns {Promise<void>} Promesa resuelta al completar la verificación y siembra inicial.
 */
async function seedInitialOperationalData(db = defaultDb, secret = config.hmacSecret) {
  // Asegura que todas las tablas y columnas requeridas existan antes de consultar o insertar registros
  await ensureSchema(db);
  // Resuelve la clave secreta efectiva con respaldo escalonado en caso de entornos de prueba sin variable definida
  const effectiveSecret = secret || process.env.HMAC_SECRET || 'appresso_default_hmac_secret';

  // 1. Consulta cuántos registros existen actualmente en la tabla 'categorias'
  const catCountRes = await db.query('SELECT COUNT(*) FROM categorias');
  // Convierte el conteo devuelto por PostgreSQL (string) a entero base 10 y verifica si la tabla está vacía
  if (parseInt(catCountRes.rows[0].count, 10) === 0) {
    // Define el catálogo maestro inicial de categorías de la tienda Appresso
    const initialCategories = [
      {
        // Categoría para bebidas calientes de especialidad
        nombre: 'Café Caliente',
        descripcion: 'Bebidas a base de espresso y filtrados artesanales de origen',
      },
      {
        // Categoría para bebidas refrescantes a base de café o té
        nombre: 'Café Frío',
        descripcion: 'Cold brew, frappés y lattes helados',
      },
      {
        // Categoría de acompañamientos dulces y horneados
        nombre: 'Pastelería y Panadería',
        descripcion: 'Croissants, tortas artesanales y horneados frescos',
      },
      {
        // Categoría de platos fuertes ligeros de mañana/tarde
        nombre: 'Desayunos y Brunch',
        descripcion: 'Sándwiches, bowls y combos matutinos',
      },
      {
        // Categoría de retail (café empacado y métodos de extracción)
        nombre: 'Accesorios y Café en Grano',
        descripcion: 'Bolsas de café especial 500g, prensas y métodos',
      },
    ];

    // Recorre secuencialmente cada categoría semilla para insertarla en PostgreSQL
    for (const c of initialCategories) {
      // Ejecuta INSERT parametrizado calculando al vuelo su clave canónica normalizada
      await db.query(
        `INSERT INTO categorias (nombre, nombre_normalizado, descripcion, estado)
         VALUES ($1, $2, $3, 'Activa')`,
        // Parámetros seguros: $1 nombre visible, $2 nombre canónico sin tildes, $3 descripción
        [c.nombre, toCanonicalKey(c.nombre), c.descripcion]
      );
    }
  }

  // 2. Consulta cuántos productos existen actualmente en la tabla 'items'
  const itemCountRes = await db.query('SELECT COUNT(*) FROM items');
  // Si no hay productos registrados, procede a poblar el inventario inicial
  if (parseInt(itemCountRes.rows[0].count, 10) === 0) {
    // Recupera los IDs y nombres normalizados de todas las categorías recién creadas o existentes
    const catsRes = await db.query('SELECT id, nombre_normalizado FROM categorias ORDER BY id ASC');
    // Construye un diccionario en memoria (nombre_normalizado -> id) para resolución O(1) de llaves foráneas
    const catByNorm = new Map(catsRes.rows.map((r) => [r.nombre_normalizado, r.id]));
    // Guarda el ID de la primera categoría como respaldo seguro si alguna clave no coincidiera
    const defaultCatId = catsRes.rows[0]?.id || null;

    // Define los 9 productos iniciales con SKU estandarizado, precio en COP e inventario disponible
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

    // Recorre cada producto semilla para persistirlo en la tabla 'items'
    for (const it of initialItems) {
      // Inserta el producto vinculándolo a su categoría correspondiente mediante parámetros posicionales
      await db.query(
        `INSERT INTO items (sku, nombre, nombre_normalizado, categoria_id, precio, stock, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'Activo')`,
        [
          // $1: Código único de referencia de inventario (SKU)
          it.sku,
          // $2: Nombre comercial del producto
          it.nombre,
          // $3: Nombre normalizado para búsquedas y deduplicación
          toCanonicalKey(it.nombre),
          // $4: ID de la categoría asociada (o categoría por defecto si no se encontrara)
          catByNorm.get(it.catKey) || defaultCatId,
          // $5: Precio unitario de venta
          it.precio,
          // $6: Unidades iniciales disponibles en inventario
          it.stock,
        ]
      );
    }
  }

  // 3. Define los usuarios base del ecosistema cubriendo los tres roles operativos (cliente, empleado, admin)
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

  // Itera sobre cada usuario semilla verificando si ya existe por correo electrónico
  for (const u of seedUsers) {
    // Busca de manera parametrizada si el email ya está registrado en 'usuarios'
    const existing = await db.query('SELECT id FROM usuarios WHERE email = $1', [u.email]);
    // Si no existe ningún registro con ese correo, lo crea desde cero con estado 'Activo'
    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO usuarios (nombre, nombre_normalizado, email, rol, documento, telefono, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'Activo')`,
        // Parámetros $1..$6 con los datos completos y el nombre normalizado
        [u.nombre, toCanonicalKey(u.nombre), u.email, u.rol, u.documento, u.telefono]
      );
    } else {
      // Si ya existía (ej. creado previamente por transacciones de fraude), rellena únicamente los campos nulos sin sobrescribir datos válidos
      await db.query(
        `UPDATE usuarios
         SET nombre = COALESCE(nombre, $1),
             nombre_normalizado = COALESCE(nombre_normalizado, $2),
             rol = COALESCE(rol, $3),
             documento = COALESCE(documento, $4),
             telefono = COALESCE(telefono, $5)
         WHERE id = $6`,
        [
          // $1..$5: Valores de respaldo en caso de que las columnas actuales sean NULL
          u.nombre,
          toCanonicalKey(u.nombre),
          u.rol,
          u.documento,
          u.telefono,
          // $6: Identificador primario del usuario existente
          existing.rows[0].id,
        ]
      );
    }
  }

  // Saneamiento masivo: completa rol y nombres derivados del correo en cualquier usuario histórico que haya quedado con valores NULL
  await db.query(`
    UPDATE usuarios
    SET rol = COALESCE(rol, 'cliente'),
        nombre = COALESCE(nombre, split_part(email, '@', 1)),
        nombre_normalizado = COALESCE(nombre_normalizado, lower(split_part(email, '@', 1)))
    WHERE rol IS NULL OR nombre IS NULL OR nombre_normalizado IS NULL;
  `);

  // 4. Verifica si la tabla 'facturas' está vacía para sembrar pedidos, facturas y pagos encadenados de demostración
  const invCountRes = await db.query('SELECT COUNT(*) FROM facturas');
  // Solo ejecuta la siembra transaccional inicial si aún no se ha emitido ninguna factura
  if (parseInt(invCountRes.rows[0].count, 10) === 0) {
    // Obtiene los primeros 5 usuarios ordenados por ID para asociar clientes y empleados reales
    const usersRes = await db.query('SELECT * FROM usuarios ORDER BY id ASC LIMIT 5');
    // Obtiene los primeros 5 ítems del catálogo para construir líneas de pedido realistas
    const itemsRes = await db.query('SELECT * FROM items ORDER BY id ASC LIMIT 5');

    // Selecciona el primer usuario con rol 'cliente' (o el primero disponible como fallback)
    const cliente1 = usersRes.rows.find((u) => u.rol === 'cliente') || usersRes.rows[0];
    // Selecciona el primer usuario con rol 'empleado' (o el primero disponible como fallback)
    const empleado1 = usersRes.rows.find((u) => u.rol === 'empleado') || usersRes.rows[0];

    // Estructura 3 órdenes de ejemplo cubriendo distintos canales ('presencial', 'app', 'domicilio') y métodos de pago
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

    // Inicializa el puntero del hash previo de facturas con la constante del bloque génesis
    let prevInvoiceHash = GENESIS_INVOICE_HASH;
    // Inicializa el puntero del hash previo de pagos con la constante del bloque génesis
    let prevPaymentHash = GENESIS_PAYMENT_HASH;

    // Procesa en orden estricto cada pedido de muestra para mantener intacto el encadenamiento criptográfico
    for (let i = 0; i < sampleOrders.length; i++) {
      // Extrae la orden de muestra en la posición actual
      const sample = sampleOrders[i];
      // Calcula el subtotal bruto sumando (precio unitario * cantidad) de cada línea de producto
      const subtotal = sample.products.reduce(
        (acc, p) => acc + Number(p.price) * Number(p.quantity),
        0
      );
      // Calcula el valor monetario del descuento redondeado a 2 decimales
      const descuento = Number(((subtotal * sample.porcentajeDescuento) / 100).toFixed(2));
      // Determina la base gravable neta tras aplicar el descuento comercial
      const baseGravable = subtotal - descuento;
      // Calcula el IVA del 19 % sobre la base gravable redondeado a 2 decimales
      const impuestos = Number((baseGravable * 0.19).toFixed(2));
      // Obtiene el total final a pagar sumando base gravable más impuestos
      const total = Number((baseGravable + impuestos).toFixed(2));

      // Inserta el pedido en estado 'Delivered' con todo su desglose financiero y recupera la fila creada
      const orderRes = await db.query(
        `INSERT INTO orders (customer, products, status, usuario_id, empleado_id, canal, subtotal, descuento, impuestos, total)
         VALUES ($1, $2, 'Delivered', $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          // $1: Nombre del cliente asociado al pedido
          sample.customer,
          // $2: Arreglo de productos serializado en formato JSON para columna JSONB/JSON
          JSON.stringify(sample.products),
          // $3: ID del cliente en tabla usuarios
          sample.usuarioId,
          // $4: ID del empleado que atendió la orden
          sample.empleadoId,
          // $5: Canal de venta ('presencial', 'app', 'domicilio')
          sample.canal,
          // $6..$9: Montos financieros calculados
          subtotal,
          descuento,
          impuestos,
          total,
        ]
      );
      // Toma el registro del pedido recién insertado con su ID autogenerado
      const createdOrder = orderRes.rows[0];
      // Formatea el número consecutivo legal con relleno de 6 ceros (ej. 'FAC-000001')
      const numeroConsecutivo = `FAC-${String(i + 1).padStart(6, '0')}`;

      // Construye la carga útil canónica que firmará el eslabón actual de la factura
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
      // Calcula el hash HMAC-SHA256 actual de la factura enlazándola criptográficamente con la anterior
      const hashActualFactura = computeInvoiceChainHash(invoicePayload, effectiveSecret);

      // Persiste la factura en estado 'Pagada' guardando tanto prev_hash como hash_actual
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
      // Extrae la fila completa de la factura creada (incluyendo su `id` primario)
      const createdInvoice = invRes.rows[0];
      // Avanza el puntero de cadena: el hash actual pasará a ser el `prev_hash` de la siguiente factura
      prevInvoiceHash = hashActualFactura;

      // Genera una referencia única de comprobante de pasarela (ej. 'COMP-2026-0101')
      const refComprobante = `COMP-2026-${String(i + 101).padStart(4, '0')}`;
      // Arma los metadatos de auditoría del soporte de pago adjunto
      const comprobanteMeta = {
        entidad: 'PASARELA_APPRESSO',
        montoComprobante: total,
        archivoAdjunto: `comprobante_${numeroConsecutivo.toLowerCase()}.pdf`,
        verificadoAutomaticamente: true,
      };
      // Calcula el hash individual de integridad del comprobante de pago
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

      // Construye la carga útil canónica del pago vinculándolo al comprobante y al pago anterior
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
      // Calcula el hash HMAC-SHA256 del eslabón actual en la cadena inmutable de pagos
      const hashActualPago = computePaymentChainHash(paymentPayload, effectiveSecret);

      // Inserta el registro de pago aprobado junto con sus metadatos JSON y hashes de verificación
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
      // Avanza el puntero de la cadena de pagos para la siguiente iteración del ciclo
      prevPaymentHash = hashActualPago;
    }
  }

  // 5. Sembrar umbrales horarios por defecto si la tabla 'umbrales_horarios' está vacía
  const umbralesCountRes = await db.query('SELECT COUNT(*) FROM umbrales_horarios');
  if (parseInt(umbralesCountRes.rows[0].count, 10) === 0) {
    await db.query(`
      INSERT INTO umbrales_horarios (franja, hora_inicio, hora_fin, umbral_transacciones, ventana_segundos)
      VALUES
        ('mañana', '05:00:01', '12:00:00', 10, 3),
        ('tarde-noche', '12:00:01', '20:00:00', 6, 3),
        ('noche-madrugada', '20:00:01', '05:00:00', 3, 3)
    `);
  }

  // 6. Sembrar rutas iniciales entre ciudades si la tabla 'routes' está vacía
  const routesCountRes = await db.query('SELECT COUNT(*) FROM routes');
  if (parseInt(routesCountRes.rows[0].count, 10) === 0) {
    await db.query(`
      INSERT INTO routes (origin, destination, distance_km)
      VALUES
        ('Medellín', 'Pereira', 215),
        ('Pereira', 'Medellín', 215),
        ('Pereira', 'Cali', 210),
        ('Cali', 'Pereira', 210)
    `);
  }
}

// Exporta las funciones públicas de migración de esquema y sembrado operativo inicial
module.exports = {
  // Función que garantiza de forma idempotente todas las tablas y columnas en PostgreSQL
  ensureSchema,
  // Función que asegura el esquema e inserta los datos semilla operativos si las tablas están vacías
  seedInitialOperationalData,
};
