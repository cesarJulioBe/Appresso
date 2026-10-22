const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno del proyecto
dotenv.config({ path: path.resolve(__dirname, '.env') });
if (!process.env.HMAC_SECRET) {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

const app = require('./src/infrastructure/server/app');
const pool = require('./src/infrastructure/database/connection');
const { generateTransactionHash } = require('./src/domain/fraud/hashUtils');

const secret = process.env.HMAC_SECRET || 'mi_llave_privada_appresso_2026';

// Comprueba si un servidor externo ya está escuchando en el endpoint indicado
async function isServerRunning(url) {
  try {
    const res = await fetch(`${url}/delivery/cities`, { method: 'GET' });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Genera un conjunto completo de 360 transacciones distribuidas en las 5 casuísticas del sistema:
 * 1. VALID_NORMAL: 180 peticiones
 * 2. VALID_BURST_FRAUD: 60 peticiones (6 ráfagas de 10 txns)
 * 3. INVALID_HASH: 50 peticiones
 * 4. INVALID_FORMAT: 40 peticiones
 * 5. INVALID_DUPLICATE: 30 peticiones
 * Total = 360 transacciones (supera el mínimo de 350 exigido)
 */
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
    'lucia.mendez@cafe.com',
    'andres.restrepo@cafe.com',
    'mariana.duque@cafe.com',
    'esteban.gaviria@cafe.com',
    'paula.zapata@cafe.com'
  ];

  const paymentMethods = ['Tarjeta', 'Efectivo', 'Nequi', 'Daviplata', 'Transferencia', 'Apple Pay', 'Google Pay'];
  const baseTime = Date.now() - 7200000; // 2 horas atrás

  // =========================================================================
  // 1. TRANSACCIONES VÁLIDAS NORMALES (180 peticiones)
  // Espaciadas temporalmente cada 5 segundos para no saturar la ventana deslizante
  // =========================================================================
  const duplicateCandidates = [];
  for (let i = 0; i < 180; i++) {
    currentId++;
    const user = validUsers[i % validUsers.length];
    const value = 5000 + ((i * 1450) % 120000);
    const date = new Date(baseTime + i * 5000).toISOString();
    const paymentMethod = paymentMethods[i % paymentMethods.length];

    const base = { idTxn: currentId, user, date, value, paymentMethod };
    const hash = generateTransactionHash(base, secret);
    const txn = { ...base, hash };

    if (i < 30) {
      duplicateCandidates.push(txn); // Guardamos 30 transacciones para probar duplicados luego
    }

    dataset.push({
      category: 'VALID_NORMAL',
      expectedStatus: 200,
      description: `Válida normal (#${i + 1}) - ${user}`,
      payload: txn,
    });
  }

  // =========================================================================
  // 2. TRANSACCIONES VÁLIDAS EN RÁFAGA / POSIBLE FRAUDE (60 peticiones)
  // 6 ráfagas de 10 transacciones consecutivas en menos de 3 segundos
  // =========================================================================
  const burstUsers = [
    'bot_rafaga_1@cafe.com',
    'bot_rafaga_2@cafe.com',
    'bot_rafaga_3@cafe.com',
    'bot_rafaga_4@cafe.com',
    'bot_rafaga_5@cafe.com',
    'bot_rafaga_6@cafe.com'
  ];

  for (let b = 0; b < burstUsers.length; b++) {
    const burstUser = burstUsers[b];
    const burstStart = Date.now() - 20000 + b * 2000;
    for (let j = 0; j < 10; j++) {
      currentId++;
      const value = 25000 + j * 3000;
      const date = new Date(burstStart + j * 200).toISOString();
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
        description: `Ráfaga fraude usuario ${b + 1} (${j + 1}/10)`,
        payload: { ...base, hash },
      });
    }
  }

  // =========================================================================
  // 3. TRANSACCIONES INVÁLIDAS POR HASH ALTERADO / AUDITADAS EN BD (50 peticiones)
  // Datos modificados tras firmar: montos inflados, usuario alterado, hash corrupto
  // =========================================================================
  for (let k = 0; k < 50; k++) {
    currentId++;
    const user = `sospechoso_hash_${k + 1}@cafe.com`;
    const realValue = 30000;
    const date = new Date(baseTime + k * 8000).toISOString();
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
    if (k % 4 === 0) {
      // Valor modificado después de la firma
      payload = { ...base, value: realValue + 900000, hash: validHash };
      desc = `Monto inflado post-firma (${realValue} -> ${realValue + 900000})`;
    } else if (k % 4 === 1) {
      // Usuario modificado después de la firma
      payload = { ...base, user: 'hacker_suplantador@fraude.com', hash: validHash };
      desc = 'Usuario suplantado tras generar el hash';
    } else if (k % 4 === 2) {
      // Hash firmado con una clave incorrecta
      const fakeHash = generateTransactionHash(base, 'clave_falsa_atacante_2026');
      payload = { ...base, hash: fakeHash };
      desc = 'Hash firmado con clave secreta no autorizada';
    } else {
      // Hash corrupto
      const corruptHash = 'f'.repeat(64);
      payload = { ...base, hash: corruptHash };
      desc = 'Hash corrupto / no determinista';
    }

    dataset.push({
      category: 'INVALID_HASH',
      expectedStatus: 400,
      description: `Hash alterado (#${k + 1}): ${desc}`,
      payload,
    });
  }

  // =========================================================================
  // 4. TRANSACCIONES INVÁLIDAS POR FORMATO / ESQUEMA (40 peticiones)
  // Campos con tipos de datos o valores no permitidos según validateTransaction
  // =========================================================================
  const formatMutations = [
    { mutation: { user: 'correo_sin_arroba_ni_dominio' }, desc: 'Email sin @ ni dominio' },
    { mutation: { user: 'null' }, desc: 'Email texto "null"' },
    { mutation: { user: '   ' }, desc: 'Email en blanco con espacios' },
    { mutation: { user: 0 }, desc: 'Email de tipo numérico' },
    { mutation: { value: 0 }, desc: 'Valor igual a cero (0)' },
    { mutation: { value: -75000 }, desc: 'Valor negativo' },
    { mutation: { value: false }, desc: 'Valor de tipo booleano' },
    { mutation: { value: Infinity }, desc: 'Valor no finito (Infinity)' },
    { mutation: { idTxn: 0 }, desc: 'idTxn igual a cero' },
    { mutation: { idTxn: -9999 }, desc: 'idTxn negativo' },
    { mutation: { idTxn: 'null' }, desc: 'idTxn de tipo texto "null"' },
    { mutation: { idTxn: false }, desc: 'idTxn de tipo booleano' },
    { mutation: { date: '' }, desc: 'Fecha vacía' },
    { mutation: { date: 0 }, desc: 'Fecha de tipo numérico' },
    { mutation: { date: 'fecha-totalmente-invalida' }, desc: 'Fecha con formato no parseable' },
    { mutation: { date: '2026-10-16' }, desc: 'Fecha ISO sin componente de tiempo T' },
    { mutation: { paymentMethod: '' }, desc: 'Método de pago vacío' },
    { mutation: { paymentMethod: false }, desc: 'Método de pago de tipo booleano' },
    { mutation: { hash: '' }, desc: 'Hash vacío' },
    { mutation: { hash: 'hash_muy_corto' }, desc: 'Hash con longitud menor a 64 caracteres' },
  ];

  for (let m = 0; m < 40; m++) {
    currentId++;
    const template = formatMutations[m % formatMutations.length];
    const base = {
      idTxn: currentId,
      user: 'formato.test@cafe.com',
      date: new Date().toISOString(),
      value: 45000,
      paymentMethod: 'Tarjeta',
      hash: 'a'.repeat(64),
    };

    dataset.push({
      category: 'INVALID_FORMAT',
      expectedStatus: 400,
      description: `Error de formato (#${m + 1}): ${template.desc}`,
      payload: { ...base, ...template.mutation },
    });
  }

  // =========================================================================
  // 5. TRANSACCIONES INVÁLIDAS POR DUPLICADO (30 peticiones)
  // Reutilizan el mismo idTxn de transacciones válidas previamente procesadas
  // =========================================================================
  for (let d = 0; d < duplicateCandidates.length; d++) {
    const original = duplicateCandidates[d];
    dataset.push({
      category: 'INVALID_DUPLICATE',
      expectedStatus: 409,
      description: `Transacción duplicada (#${d + 1}) reutiliza idTxn=${original.idTxn}`,
      payload: { ...original },
    });
  }

  return dataset;
}

async function runSuite350() {
  console.log('='.repeat(80));
  console.log('🧪 SUITE DE PRUEBAS DE ESTRÉS: 350+ TRANSACCIONES COMPLETAS - APPRESSO');
  console.log('='.repeat(80));

  const targetHost = process.env.API_URL;
  let server = null;
  let baseUrl;

  if (targetHost) {
    const isExternalActive = await isServerRunning(targetHost);
    if (!isExternalActive) {
      console.error(`❌ Error: El servidor especificado en API_URL (${targetHost}) no responde.`);
      process.exit(1);
    }
    baseUrl = targetHost;
    console.log(`📡 Conectado al servidor externo en: ${targetHost}\n`);
  } else {
    console.log(`⚙️  Iniciando servidor de pruebas embebido con el código actual...`);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    console.log(`🚀 Servidor de pruebas iniciado en puerto dinámico: ${baseUrl}\n`);
  }

  // Base ID único generado a partir de timestamp
  const baseId = Date.now() + 50000;
  const dataset = generateTestDataset(baseId);

  console.log(`📦 Lote preparado: ${dataset.length} transacciones`);
  console.log('  • 180 Válidas normales (200 Procesada)');
  console.log('  •  60 Válidas en ráfaga (simulación de anomalía por ventana deslizante)');
  console.log('  •  50 Inválidas por hash alterado (400 auditadas en BD)');
  console.log('  •  40 Inválidas por formato/esquema (400 VALIDATION_ERROR)');
  console.log('  •  30 Duplicadas (409 DUPLICATE_TRANSACTION)\n');

  console.log('🚀 Iniciando ejecución de las peticiones...\n');

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
    sampleErrors: [],
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

    // Clasificación y evaluación de casuísticas
    let isExpected = false;
    if (item.category === 'VALID_NORMAL') {
      if (status === 200 && body && body.transaction && body.transaction.estado === 'Procesada') {
        stats.validNormalOk++;
        isExpected = true;
      }
    } else if (item.category === 'VALID_BURST_FRAUD') {
      if (status === 200) {
        if (body && body.analysis && body.analysis.isAnomaly) {
          stats.burstFraudDetected++;
        } else {
          stats.burstNormalOk++;
        }
        isExpected = true;
      }
    } else if (item.category === 'INVALID_HASH') {
      if (status === 400 && body && body.error === 'INVALID_HASH' && body.transaction && body.transaction.estado === 'Hash inválido') {
        stats.invalidHashAudited++;
        isExpected = true;
      }
    } else if (item.category === 'INVALID_FORMAT') {
      if (status === 400 && body && body.error === 'VALIDATION_ERROR') {
        stats.invalidFormatRejected++;
        isExpected = true;
      }
    } else if (item.category === 'INVALID_DUPLICATE') {
      if (status === 409 && body && body.error === 'DUPLICATE_TRANSACTION') {
        stats.duplicatesRejected++;
        isExpected = true;
      }
    }

    if (!isExpected) {
      stats.unexpectedErrors++;
      if (stats.sampleErrors.length < 5) {
        stats.sampleErrors.push({
          category: item.category,
          expectedStatus: item.expectedStatus,
          status,
          body,
          errorMsg,
          description: item.description,
        });
      }
    }

    // Progreso cada 30 peticiones o al final
    if (stats.processed % 30 === 0 || stats.processed === stats.total) {
      const pct = Math.round((stats.processed / stats.total) * 100);
      const avgMs = (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(1);
      process.stdout.write(`  ⏳ Progreso: ${stats.processed}/${stats.total} (${pct}%) | Latencia media: ${avgMs}ms\r`);
    }

    // Pequeña pausa de 5ms para fluidez de eventos
    await new Promise(r => setTimeout(r, 5));
  }

  const totalTimeMs = Date.now() - startTime;
  const avgLatency = (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(2);
  const minLatency = Math.min(...stats.latencies).toFixed(2);
  const maxLatency = Math.max(...stats.latencies).toFixed(2);
  const throughput = ((stats.total / (totalTimeMs / 1000))).toFixed(1);

  console.log('\n\n' + '='.repeat(80));
  console.log('📊 REPORTE FINAL DE RESULTADOS (360 PETICIONES)');
  console.log('='.repeat(80));

  console.log(`
┌────────────────────────────────────────────────────────┬─────────┐
│ Casuística / Clasificación                             │ Cantidad│
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

  console.log('⚡ Rendimiento de la Suite:');
  console.log(`  - Tiempo total de prueba : ${(totalTimeMs / 1000).toFixed(2)} s`);
  console.log(`  - Rendimiento (Throughput): ${throughput} req/s`);
  console.log(`  - Latencia media          : ${avgLatency} ms`);
  console.log(`  - Latencia mínima / máxima: ${minLatency} ms / ${maxLatency} ms`);

  // Verificación directa en base de datos PostgreSQL
  console.log('\n🔎 Verificación en Base de Datos PostgreSQL:');
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
    console.log('🎉 TODAS LAS 360 TRANSACCIONES SE COMPORTARON EXACTAMENTE SEGÚN LO ESPERADO.');
  } else {
    console.log(`⚠️  ATENCIÓN: Hubo ${stats.unexpectedErrors} respuestas inesperadas.\n`);
    console.log('🔍 Muestra de respuestas inesperadas:');
    stats.sampleErrors.forEach((err, idx) => {
      console.log(`  [${idx + 1}] Caso: ${err.description} (${err.category})`);
      console.log(`      Status recibido: ${err.status} (esperado: ${err.expectedStatus})`);
      console.log(`      Respuesta: ${JSON.stringify(err.body || err.errorMsg)}`);
    });
  }
  console.log('='.repeat(80) + '\n');

  if (server) {
    server.close();
  }
  await pool.end();
}

runSuite350().catch(async err => {
  console.error('❌ Error fatal en ejecución de pruebas:', err);
  await pool.end();
  process.exit(1);
});
