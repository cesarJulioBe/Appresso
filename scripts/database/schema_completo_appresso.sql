-- ============================================================================
-- SCRIPT MAESTRO DE BASE DE DATOS POSTGRESQL — PROYECTO APPRESSO
-- Archivo: scripts/database/schema_completo_appresso.sql
-- ============================================================================
-- INSTRUCCIONES PARA LOS COMPAÑEROS (Julián Cardona y Juan Esteban Zapa):
--   Paso 1: En pgAdmin, DBeaver o consola psql, crear la base de datos vacía:
--           CREATE DATABASE appresso;
--   Paso 2: Conectarse a la base de datos `appresso` y ejecutar TODO este script.
--   Paso 3: Copiar `.env.example` a `.env`, poner su contraseña en DB_PASSWORD
--           y ejecutar `npm run dev` (al iniciar el servidor se poblarán
--           automáticamente las facturas y pagos encadenados con su HMAC_SECRET).
-- ============================================================================

-- 1. Tabla de Usuarios (Clientes, Empleados y Administradores)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150),
  nombre_normalizado VARCHAR(150),
  email VARCHAR(150) UNIQUE NOT NULL,
  rol VARCHAR(30) DEFAULT 'cliente',
  documento VARCHAR(40),
  telefono VARCHAR(30),
  estado VARCHAR(30) NOT NULL DEFAULT 'Activo',
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla de Categorías del Catálogo
CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  nombre_normalizado VARCHAR(120) NOT NULL,
  descripcion TEXT,
  estado VARCHAR(30) DEFAULT 'Activa',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla de Ítems / Productos con Inventario (Stock)
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

-- 4. Tabla de Pedidos Multicanal (Presencial, Web, App, Domicilio)
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer VARCHAR(150) NOT NULL,
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'Requested',
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  empleado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  canal VARCHAR(30) DEFAULT 'presencial',
  subtotal NUMERIC(12, 2) DEFAULT 0,
  descuento NUMERIC(12, 2) DEFAULT 0,
  impuestos NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Tabla de Facturas (Número Consecutivo, Impuestos, Descuentos y Hash Encadenado)
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

-- 6. Tabla de Pagos (Métodos de Pago, Comprobante Adjunto y Hash Encadenado)
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

-- 7. Tabla de Reportes de Calidad y Limpieza de Datos
CREATE TABLE IF NOT EXISTS reportes_calidad (
  id SERIAL PRIMARY KEY,
  puntaje_calidad NUMERIC(5, 2) NOT NULL,
  total_registros INTEGER NOT NULL DEFAULT 0,
  problemas_detectados INTEGER NOT NULL DEFAULT 0,
  registros_corregidos INTEGER NOT NULL DEFAULT 0,
  detalle JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Tabla de Rutas de Entrega (Grafo Ponderado para Algoritmo de Dijkstra)
CREATE TABLE IF NOT EXISTS routes (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(120) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  distance_km NUMERIC(10, 2) NOT NULL,
  pair_route_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Tabla de Umbrales Horarios Antifraude
CREATE TABLE IF NOT EXISTS umbrales_horarios (
  id SERIAL PRIMARY KEY,
  franja VARCHAR(40) UNIQUE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  umbral_transacciones INTEGER NOT NULL,
  ventana_segundos INTEGER NOT NULL DEFAULT 3
);

-- 10. Tabla de Transacciones Monitoreadas (Firma HMAC-SHA256)
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

-- 11. Tabla de Anomalías de Fraude Auditadas
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

-- Índices para acelerar búsquedas, ordenamientos y cruces (JOIN)
CREATE INDEX IF NOT EXISTS idx_items_nombre_norm ON items(nombre_normalizado);
CREATE INDEX IF NOT EXISTS idx_categorias_nombre_norm ON categorias(nombre_normalizado);
CREATE INDEX IF NOT EXISTS idx_orders_usuario_id ON orders(usuario_id);
CREATE INDEX IF NOT EXISTS idx_facturas_pedido_id ON facturas(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pagos_factura_id ON pagos(factura_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_fecha ON transacciones(usuario_id, fecha_txn);

-- Semilla inicial de Umbrales Horarios (si aún no existen)
INSERT INTO umbrales_horarios (franja, hora_inicio, hora_fin, umbral_transacciones, ventana_segundos)
VALUES
  ('mañana', '05:00:01', '12:00:00', 10, 3),
  ('tarde-noche', '12:00:01', '20:00:00', 6, 3),
  ('noche-madrugada', '20:00:01', '05:00:00', 3, 3)
ON CONFLICT (franja) DO NOTHING;

-- Semilla inicial de Rutas entre ciudades para probar Dijkstra (si la tabla está vacía)
INSERT INTO routes (origin, destination, distance_km)
SELECT 'Medellín', 'Pereira', 215
WHERE NOT EXISTS (SELECT 1 FROM routes);

INSERT INTO routes (origin, destination, distance_km)
SELECT 'Pereira', 'Medellín', 215
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE origin = 'Pereira' AND destination = 'Medellín');

INSERT INTO routes (origin, destination, distance_km)
SELECT 'Pereira', 'Cali', 210
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE origin = 'Pereira' AND destination = 'Cali');

INSERT INTO routes (origin, destination, distance_km)
SELECT 'Cali', 'Pereira', 210
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE origin = 'Cali' AND destination = 'Pereira');
