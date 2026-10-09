const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '.env') });
if (!process.env.HMAC_SECRET) {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

const app = require('./src/infrastructure/server/app');
const pool = require('./src/infrastructure/database/connection');
const { generateTransactionHash } = require('./src/domain/fraud/hashUtils');

const secret = process.env.HMAC_SECRET;
if (!secret) {
  console.error('❌ Error: HMAC_SECRET no está configurada.');
  process.exit(1);
}

// Comprueba si un servidor externo ya está escuchando en el puerto dado
async function isServerRunning(url) {
  try {
    const res = await fetch(`${url}/delivery/cities`, { method: 'GET' });
    return res.status < 500;
  } catch {
    return false;
  }
}

// Genera un conjunto variado de 210 transacciones con diferentes casos de prueba
function generateTestDataset(baseId) {
  const dataset = [];
  let currentId = baseId;

  const validUsers = [
    'ana.martinez@cafe.com',
    'carlos.gomez@cafe.com',
    'sofia.herrera@cafe.com',
    'mateo.castro@cafe.com',
    'valentina.ruiz@cafe.com',
    'felipe.torres@cafe.com',
    'camila.rojas@cafe.com',
    'santiago.vargas@cafe.com',
    'isabella.mora@cafe.com',
    'daniel.silva@cafe.com',
  ];

  const paymentMethods = ['Tarjeta', 'Efectivo', 'Nequi', 'Daviplata', 'Transferencia'];
  const baseTime = Date.now() - 3600000; // 1 hora atrás

  // =========================================================================
  // 1. TRANSACCIONES VÁLIDAS NORMALES (110 peticiones)
  // Espaciadas cada 5 segundos para no saturar la ventana de 3 segundos
  // =========================================================================
  const duplicateCandidates = [];
  for (let i = 0; i < 110; i++) {
    currentId++;
    const user = validUsers[i % validUsers.length];
    const value = 5000 + ((i * 1234) % 95000);
    const date = new Date(baseTime + i * 5000).toISOString();
    const paymentMethod = paymentMethods[i % paymentMethods.length];

    const base = { idTxn: currentId, user, date, value, paymentMethod };
    const hash = generateTransactionHash(base, secret);
    const txn = { ...base, hash };

    if (i < 10) {
      duplicateCandidates.push(txn); // Guardamos 10 para probar duplicados luego
    }

    dataset.push({
      category: 'VALID_NORMAL',
      expectedStatus: 200,
      description: `Válida normal (#${i + 1}) - ${user}`,
      payload: txn,
    });
  }

  // =========================================================================
  // 2. TRANSACCIONES VÁLIDAS CON ANOMALÍA POR VENTANA DESLIZANTE (35 peticiones)
  // 7 ráfagas de 5 transacciones consecutivas en menos de 3 segundos
  // =========================================================================
  const burstUsers = ['rafaga1@cafe.com', 'rafaga2@cafe.com', 'rafaga3@cafe.com', 'rafaga4@cafe.com', 'rafaga5@cafe.com'];
  for (let b = 0; b < burstUsers.length; b++) {
    const burstUser = burstUsers[b];
    const burstStart = Date.now() - 10000 + b * 1000;
    for (let j = 0; j < 7; j++) {
      currentId++;
      const value = 15000 + j * 2000;
      const date = new Date(burstStart + j * 300).toISOString();
      const base = {
        idTxn: currentId,
        user: burstUser,
        date,
        value,
        paymentMethod: 'Tarjeta',
      };
      const hash = generateTransactionHash(base, secret);

      dataset.push({
        category: 'VALID_BURST_FRAUD',
        expectedStatus: 200,
        description: `Ráfaga fraude usuario ${b + 1} (txn ${j + 1}/7)`,
        payload: { ...base, hash },
      });
    }
  }

  // =========================================================================
  // 3. TRANSACCIONES INVÁLIDAS POR HASH ALTERADO / AUDITADAS EN BD (35 peticiones)
  // Monto modificado tras firmar, hash corrupto, etc.
  // =========================================================================
  for (let k = 0; k < 35; k++) {
    currentId++;
    const user = `sospechoso_hash_${k}@cafe.com`;
    const realValue = 20000;
    const date = new Date(baseTime + k * 10000).toISOString();
    const base = {
      idTxn: currentId,
      user,
      date,
      value: realValue,
      paymentMethod: 'Tarjeta',
    };
    const validHash = generateTransactionHash(base, secret);

    let payload;
    let desc;
    if (k % 3 === 0) {
      // Valor alterado
      payload = { ...base, value: realValue + 500000, hash: validHash };
      desc = `Hash alterado (monto inflado de ${realValue} a ${realValue + 500000})`;
    } else if (k % 3 === 1) {
      // Usuario alterado
      payload = { ...base, user: 'hacker@malicioso.com', hash: validHash };
      desc = 'Hash alterado (usuario modificado post-firma)';
    } else {
      // Hash corrupto / aleatorio
      const fakeHash = 'e'.repeat(64);
      payload = { ...base, hash: fakeHash };
      desc = 'Hash corrupto / no firmado con el secreto oficial';
    }

    dataset.push({
      category: 'INVALID_HASH',
      expectedStatus: 400,
      description: desc,
      payload,
    });
  }

  // =========================================================================
  // 4. TRANSACCIONES INVÁLIDAS POR FORMATO / ESQUEMA (20 peticiones)
  // Datos mal formados según validateTransaction
  // =========================================================================
  const invalidFormatTemplates = [
    { mutation: { user: 'correo_sin_arroba' }, desc: 'Email sin formato válido' },
    { mutation: { user: '   ' }, desc: 'Email en blanco' },
    { mutation: { value: 0 }, desc: 'Valor igual a 0' },
    { mutation: { value: -50000 }, desc: 'Valor negativo' },
    { mutation: { value: Infinity }, desc: 'Valor no finito' },
    { mutation: { date: 'fecha-invalida' }, desc: 'Fecha no ISO' },
    { mutation: { date: '2026-09-23' }, desc: 'Fecha ISO sin componente de tiempo T' },
    { mutation: { paymentMethod: '' }, desc: 'Método de pago vacío' },
    { mutation: { hash: 'hash_corto_invalido' }, desc: 'Hash con menos de 64 caracteres' },
    { mutation: { hash: 'z'.repeat(64) }, desc: 'Hash con caracteres no hexadecimales' },
  ];

  for (let m = 0; m < 20; m++) {
    currentId++;
    const template = invalidFormatTemplates[m % invalidFormatTemplates.length];
    const base = {
      idTxn: currentId,
      user: 'formato@test.com',
      date: new Date().toISOString(),
      value: 10000,
      paymentMethod: 'Tarjeta',
      hash: 'a'.repeat(64),
    };

    dataset.push({
      category: 'INVALID_FORMAT',
      expectedStatus: 400,
      description: `Error formato: ${template.desc}`,
      payload: { ...base, ...template.mutation },
    });
  }

  // =========================================================================
  // 5. TRANSACCIONES INVÁLIDAS POR DUPLICADO (10 peticiones)
  // Reutilizan idTxn previamente aceptado
  // =========================================================================
  for (let d = 0; d < duplicateCandidates.length; d++) {
    const original = duplicateCandidates[d];
    dataset.push({
      category: 'INVALID_DUPLICATE',
      expectedStatus: 409,
      description: `Transacción duplicada (reutiliza idTxn=${original.idTxn})`,
      payload: { ...original },
    });
  }

  return dataset;
}

async function runBatchTests() {
  console.log('='.repeat(80));
  console.log('🧪 SUITE DE PRUEBAS DE TRANSACCIONES POR LOTES (200+ PETICIONES) - APPRESSO');
  console.log('='.repeat(80));

  const targetHost = process.env.API_URL || 'http://localhost:3000';
  let server = null;
  let baseUrl = targetHost;

  const isExternalActive = await isServerRunning(targetHost);
  if (isExternalActive) {
    console.log(`📡 Conectado al servidor existente en: ${targetHost}\n`);
  } else {
    console.log(`⚙️  Servidor no detectado en ${targetHost}. Iniciando servidor embebido para la prueba...`);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    console.log(`🚀 Servidor de pruebas iniciado en puerto dinámico: ${baseUrl}\n`);
  }

  // Base ID único basado en timestamp
  const baseId = Date.now() + 10000;
  const dataset = generateTestDataset(baseId);

  console.log(`📦 Lote generado: ${dataset.length} peticiones preparadas.`);
  console.log('  - 110 Válidas normales (distribuidas)');
  console.log('  - 35 Válidas en ráfaga (simulación de posible fraude por ventana deslizante)');
  console.log('  - 35 Inválidas por hash alterado (auditadas con estado "Hash inválido")');
  console.log('  - 20 Inválidas por formato/esquema (error 400 VALIDATION_ERROR)');
  console.log('  - 10 Duplicadas (error 409 DUPLICATE_TRANSACTION)\n');

  console.log('🚀 Iniciando envío de transacciones...\n');

  const stats = {
    total: dataset.length,
    processed: 0,
    validNormalOk: 0,
    burstFraudDetected: 0,
    burstNormalOk: 0,
    invalidHashAudited: 0,
    invalidFormatRejected: 0,
    duplicatesRejected: 0,
    unexpectedErrors: 0,
    latencies: [],
  };

  const startTime = Date.now();

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i];
    const itemStart = performance.now();

    let status = 0;
    let body = null;
    let errorMsg = null;

    try {
      const response = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      status = response.status;
      body = await response.json();
    } catch (err) {
      errorMsg = err.message;
    }

    const itemMs = performance.now() - itemStart;
    stats.latencies.push(itemMs);
    stats.processed++;

    // Clasificar y evaluar resultado
    if (item.category === 'VALID_NORMAL') {
      if (status === 200 && body && body.transaction && body.transaction.estado === 'Procesada') {
        stats.validNormalOk++;
      } else {
        stats.unexpectedErrors++;
      }
    } else if (item.category === 'VALID_BURST_FRAUD') {
      if (status === 200) {
        if (body && body.analysis && body.analysis.isAnomaly) {
          stats.burstFraudDetected++;
        } else {
          stats.burstNormalOk++;
        }
      } else {
        stats.unexpectedErrors++;
      }
    } else if (item.category === 'INVALID_HASH') {
      if (status === 400 && body && body.error === 'INVALID_HASH' && body.transaction && body.transaction.estado === 'Hash inválido') {
        stats.invalidHashAudited++;
      } else {
        stats.unexpectedErrors++;
      }
    } else if (item.category === 'INVALID_FORMAT') {
      if (status === 400 && body && body.error === 'VALIDATION_ERROR') {
        stats.invalidFormatRejected++;
      } else {
        stats.unexpectedErrors++;
      }
    } else if (item.category === 'INVALID_DUPLICATE') {
      if (status === 409 && body && body.error === 'DUPLICATE_TRANSACTION') {
        stats.duplicatesRejected++;
      } else {
        stats.unexpectedErrors++;
      }
    }

    // Progreso cada 25 peticiones o al final
    if (stats.processed % 25 === 0 || stats.processed === stats.total) {
      const pct = Math.round((stats.processed / stats.total) * 100);
      const avgMs = (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(1);
      process.stdout.write(`  ⏳ Progreso: ${stats.processed}/${stats.total} (${pct}%) | Latencia media: ${avgMs}ms\r`);
    }

    // Pequeño retardo entre peticiones para permitir registro temporal adecuado
    await new Promise(r => setTimeout(r, 10));
  }

  const totalTimeMs = Date.now() - startTime;
  const avgLatency = (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(2);
  const minLatency = Math.min(...stats.latencies).toFixed(2);
  const maxLatency = Math.max(...stats.latencies).toFixed(2);
  const throughput = ((stats.total / (totalTimeMs / 1000))).toFixed(1);

  console.log('\n\n' + '='.repeat(80));
  console.log('📊 REPORTE DE RESULTADOS DE LA PRUEBA');
  console.log('='.repeat(80));

  console.log(`
┌────────────────────────────────────────────────────────┬─────────┐
│ Métrica / Clasificación                                │ Cantidad│
├────────────────────────────────────────────────────────┼─────────┤
│ Total de peticiones enviadas                           │ ${String(stats.total).padStart(7)} │
│ Transacciones válidas normales (200 Procesada)         │ ${String(stats.validNormalOk).padStart(7)} │
│ Transacciones en ráfaga normales                       │ ${String(stats.burstNormalOk).padStart(7)} │
│ Transacciones en ráfaga con anomalía (POSIBLE_FRAUDE)  │ ${String(stats.burstFraudDetected).padStart(7)} │
│ Transacciones con Hash Inválido (400 - Auditadas en BD)│ ${String(stats.invalidHashAudited).padStart(7)} │
│ Transacciones con Formato Inválido (400 Rechazadas)    │ ${String(stats.invalidFormatRejected).padStart(7)} │
│ Transacciones Duplicadas detectadas (409 Rechazadas)   │ ${String(stats.duplicatesRejected).padStart(7)} │
│ Peticiones con comportamiento inesperado / errores     │ ${String(stats.unexpectedErrors).padStart(7)} │
└────────────────────────────────────────────────────────┴─────────┘
`);

  console.log('⚡ Rendimiento:');
  console.log(`  - Tiempo total de prueba : ${(totalTimeMs / 1000).toFixed(2)} s`);
  console.log(`  - Rendimiento (Throughput): ${throughput} req/s`);
  console.log(`  - Latencia media          : ${avgLatency} ms`);
  console.log(`  - Latencia mínima / máxima: ${minLatency} ms / ${maxLatency} ms`);

  // Consulta directa a la base de datos para auditoría final
  console.log('\n🔎 Verificación directa en base de datos PostgreSQL:');
  try {
    const txnCount = await pool.query(`
      SELECT estado, COUNT(*) as cantidad
      FROM transacciones
      GROUP BY estado
      ORDER BY cantidad DESC;
    `);
    console.log('  📋 Transacciones registradas en BD por estado:');
    txnCount.rows.forEach(r => console.log(`     • ${r.estado.padEnd(16)}: ${r.cantidad}`));

    const anomalyCount = await pool.query(`
      SELECT tipo, COUNT(*) as cantidad
      FROM anomalias
      GROUP BY tipo
      ORDER BY cantidad DESC;
    `);
    console.log('  ⚠️  Anomalías registradas en BD por tipo:');
    anomalyCount.rows.forEach(r => console.log(`     • ${r.tipo.padEnd(16)}: ${r.cantidad}`));
  } catch (dbErr) {
    console.warn('  (No se pudo consultar el resumen de BD:', dbErr.message, ')');
  }

  console.log('\n' + '='.repeat(80));
  if (stats.unexpectedErrors === 0) {
    console.log('🎉 TODAS LAS 210 PETICIONES SE COMPORTARON EXACTAMENTE SEGÚN LO ESPERADO.');
  } else {
    console.log(`⚠️  ATENCIÓN: Hubo ${stats.unexpectedErrors} respuestas inesperadas.`);
  }
  console.log('='.repeat(80) + '\n');

  if (server) {
    server.close();
  }
  await pool.end();
}

runBatchTests().catch(async err => {
  console.error('❌ Error fatal en ejecución de pruebas:', err);
  await pool.end();
  process.exit(1);
});
