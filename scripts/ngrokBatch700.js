const config = require('../src/config/env');
const db = require('../src/infrastructure/database/connection');
const { generateTransactionHash } = require('../src/domain/fraud/hashUtils');

const secret = config.hmacSecret;
const DEFAULT_NGROK_URL = 'https://unsocial-overall-riverside.ngrok-free.dev';

async function resolveNgrokUrl() {
  if (process.env.API_URL) {
    return process.env.API_URL.replace(/\/$/, '');
  }
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    if (res.ok) {
      const data = await res.json();
      const httpsTunnel =
        (data.tunnels || []).find((t) => t.proto === 'https') || (data.tunnels || [])[0];
      if (httpsTunnel && httpsTunnel.public_url) {
        return httpsTunnel.public_url.replace(/\/$/, '');
      }
    }
  } catch {
    // Fallback a la URL de ngrok configurada
  }
  return DEFAULT_NGROK_URL;
}

/**
 * Construye 720 transacciones cubriendo todas las casuísticas y las 3 franjas horarias:
 * 1. VALID_NORMAL      : 380 transacciones (200 OK - Procesada / NORMAL)
 * 2. VALID_BURST_FRAUD : 120 transacciones (200 OK - Ráfagas en Mañana [umbral 10], Tarde-Noche [umbral 6] y Noche-Madrugada [umbral 3])
 * 3. INVALID_HASH      :  90 transacciones (400 INVALID_HASH - Auditadas en BD como Hash inválido + HASH_INVALIDO Crítico)
 * 4. INVALID_FORMAT    :  70 transacciones (400 VALIDATION_ERROR - Esquema/tipos inválidos)
 * 5. INVALID_DUPLICATE :  60 transacciones (409 DUPLICATE_TRANSACTION - Replay de idTxn existente)
 * -------------------------------------------------------------------------
 * TOTAL                : 720 transacciones (supera las 700 solicitadas)
 */
function build720Dataset(baseId) {
  const normalAndErrors = [];
  const burstsByUser = [];
  const duplicates = [];
  let currentId = baseId;

  const paymentMethods = [
    'Tarjeta',
    'Efectivo',
    'Nequi',
    'Daviplata',
    'Transferencia',
    'Apple Pay',
    'Google Pay',
  ];
  const baseTime = Date.now() - 7200000;

  // =========================================================================
  // 1. 380 TRANSACCIONES VÁLIDAS NORMALES
  // =========================================================================
  const duplicateCandidates = [];
  for (let i = 0; i < 380; i++) {
    currentId++;
    const user = `cliente.normal.${i + 1}@appresso.co`;
    const value = 6000 + ((i * 1650) % 92000);
    const date = new Date(baseTime + i * 5000).toISOString();
    const paymentMethod = paymentMethods[i % paymentMethods.length];

    const base = { idTxn: currentId, user, date, value, paymentMethod };
    const hash = generateTransactionHash(base, secret);
    const txn = { ...base, hash };

    if (i < 60) {
      duplicateCandidates.push(txn);
    }

    normalAndErrors.push({
      category: 'VALID_NORMAL',
      expectedStatus: 200,
      description: `Válida normal #${i + 1}`,
      payload: txn,
    });
  }

  // =========================================================================
  // 2. 120 TRANSACCIONES EN RÁFAGA PROBANDO LAS 3 FRANJAS HORARIAS EN MEMORIA
  // - Mañana (09:15:00-05:00, umbral=10): 3 usuarios x 12 txns = 36 txns (27 previas + 9 fraude)
  // - Tarde-Noche (15:30:00-05:00, umbral=6): 4 usuarios x 11 txns = 44 txns (20 previas + 24 fraude)
  // - Noche-Madrugada (22:45:00-05:00, umbral=3): 5 usuarios x 8 txns = 40 txns (10 previas + 30 fraude)
  // =========================================================================
  const slotConfigs = [
    {
      franja: 'mañana',
      isoBase: '2026-11-19T09:15:00.000-05:00',
      usersCount: 3,
      txnsPerUser: 12,
    },
    {
      franja: 'tarde-noche',
      isoBase: '2026-11-19T15:30:00.000-05:00',
      usersCount: 4,
      txnsPerUser: 11,
    },
    {
      franja: 'noche-madrugada',
      isoBase: '2026-11-19T22:45:00.000-05:00',
      usersCount: 5,
      txnsPerUser: 8,
    },
  ];

  let burstGroupIdx = 0;
  for (const slot of slotConfigs) {
    const slotStartMs = new Date(slot.isoBase).getTime();
    for (let u = 0; u < slot.usersCount; u++) {
      burstGroupIdx++;
      const burstUser = `rafaga.${slot.franja}.${u + 1}.${baseId}@appresso.co`;
      const userSequence = [];

      for (let j = 0; j < slot.txnsPerUser; j++) {
        currentId++;
        const value = 15000 + j * 2500;
        // Todas dentro de 2.2 segundos (< ventana de 3 segundos)
        const date = new Date(slotStartMs + u * 10000 + j * 180).toISOString();
        const paymentMethod = paymentMethods[(burstGroupIdx + j) % paymentMethods.length];
        const base = { idTxn: currentId, user: burstUser, date, value, paymentMethod };
        const hash = generateTransactionHash(base, secret);

        userSequence.push({
          category: 'VALID_BURST_FRAUD',
          expectedStatus: 200,
          description: `Ráfaga [${slot.franja}] ${burstUser} (${j + 1}/${slot.txnsPerUser})`,
          payload: { ...base, hash },
        });
      }
      burstsByUser.push(userSequence);
    }
  }

  // =========================================================================
  // 3. 90 TRANSACCIONES CON HASH INVÁLIDO / ADULTERADAS (400 INVALID_HASH - Auditadas)
  // =========================================================================
  for (let k = 0; k < 90; k++) {
    currentId++;
    const user = `auditoria.hash.${k + 1}@appresso.co`;
    const originalValue = 20000 + k * 500;
    const date = new Date(baseTime + k * 6000).toISOString();
    const base = {
      idTxn: currentId,
      user,
      date,
      value: originalValue,
      paymentMethod: paymentMethods[k % paymentMethods.length],
    };
    const validHash = generateTransactionHash(base, secret);

    let payload;
    let desc;
    if (k % 4 === 0) {
      payload = { ...base, value: originalValue + 800000, hash: validHash };
      desc = 'Hash inválido: monto adulterado post-firma';
    } else if (k % 4 === 1) {
      payload = { ...base, user: `atacante.${k}@malicioso.org`, hash: validHash };
      desc = 'Hash inválido: usuario modificado post-firma';
    } else if (k % 4 === 2) {
      payload = { ...base, paymentMethod: 'MetodoAlterado', hash: validHash };
      desc = 'Hash inválido: método de pago modificado post-firma';
    } else {
      const fakeHash = generateTransactionHash(base, 'llave_falsa_atacante_2026');
      payload = { ...base, hash: fakeHash };
      desc = 'Hash inválido: firmado con llave secreta incorrecta';
    }

    normalAndErrors.push({
      category: 'INVALID_HASH',
      expectedStatus: 400,
      description: desc,
      payload,
    });
  }

  // =========================================================================
  // 4. 70 TRANSACCIONES CON FORMATO / ESQUEMA INVÁLIDO (400 VALIDATION_ERROR)
  // =========================================================================
  const invalidTemplates = [
    { mutation: { idTxn: -999 }, desc: 'idTxn negativo' },
    { mutation: { idTxn: 0 }, desc: 'idTxn igual a 0' },
    { mutation: { idTxn: 'no-numerico' }, desc: 'idTxn string' },
    { mutation: { user: 'correo_sin_arroba.com' }, desc: 'Email sin @' },
    { mutation: { user: '' }, desc: 'Email vacío' },
    { mutation: { date: '2026-11-19' }, desc: 'Fecha sin hora ISO T' },
    { mutation: { date: 'fecha_corrupta' }, desc: 'Fecha inválida' },
    { mutation: { value: 0 }, desc: 'Monto igual a 0' },
    { mutation: { value: -45000 }, desc: 'Monto negativo' },
    { mutation: { paymentMethod: '' }, desc: 'Método de pago vacío' },
    { mutation: { hash: 'abc12345' }, desc: 'Hash menor a 64 caracteres' },
    { mutation: { hash: 'z'.repeat(64) }, desc: 'Hash no hexadecimal' },
  ];

  for (let m = 0; m < 70; m++) {
    currentId++;
    const tpl = invalidTemplates[m % invalidTemplates.length];
    const base = {
      idTxn: currentId,
      user: `formato.invalido.${m + 1}@appresso.co`,
      date: new Date().toISOString(),
      value: 28000,
      paymentMethod: 'Tarjeta',
      hash: 'a'.repeat(64),
    };

    normalAndErrors.push({
      category: 'INVALID_FORMAT',
      expectedStatus: 400,
      description: `Formato inválido: ${tpl.desc}`,
      payload: { ...base, ...tpl.mutation },
    });
  }

  // =========================================================================
  // 5. 60 TRANSACCIONES DUPLICADAS (409 DUPLICATE_TRANSACTION)
  // =========================================================================
  for (let d = 0; d < 60; d++) {
    const original = duplicateCandidates[d];
    duplicates.push({
      category: 'INVALID_DUPLICATE',
      expectedStatus: 409,
      description: `Duplicada (reintenta idTxn=${original.idTxn})`,
      payload: { ...original },
    });
  }

  return {
    normalAndErrors,
    burstsByUser,
    duplicates,
    totalCount:
      normalAndErrors.length +
      burstsByUser.reduce((sum, arr) => sum + arr.length, 0) +
      duplicates.length,
  };
}

async function sendWithRetry(url, payload, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Scenario': 'appresso-ngrok-720-suite',
        },
        body: JSON.stringify(payload),
      });

      if ((res.status === 429 || res.status >= 502) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }

      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function main() {
  const baseUrl = await resolveNgrokUrl();
  const endpoint = `${baseUrl}/api/transactions`;

  console.log('='.repeat(80));
  console.log('🚀 SUITE DE ESTRÉS Y REVISIÓN: 720 TRANSACCIONES VÍA NGROK - APPRESSO');
  console.log('='.repeat(80));
  console.log(`📡 Túnel Ngrok activo : ${endpoint}`);
  console.log('🔎 Inspector Ngrok UI : http://127.0.0.1:4040\n');

  const baseId = Date.now();
  const { normalAndErrors, burstsByUser, duplicates, totalCount } = build720Dataset(baseId);

  console.log(`📦 Total preparado: ${totalCount} transacciones`);
  console.log('  1️⃣  380 Válidas Normales             -> 200 OK (Procesada / NORMAL)');
  console.log('  2️⃣  120 Válidas en Ráfaga (3 franjas)-> 200 OK (57 previas NORMAL + 63 POSIBLE_FRAUDE)');
  console.log('  3️⃣   90 Hash Inválido / Adulteradas  -> 400 INVALID_HASH (Auditadas en BD)');
  console.log('  4️⃣   70 Formato / Esquema Inválido   -> 400 VALIDATION_ERROR');
  console.log('  5️⃣   60 Transacciones Duplicadas     -> 409 DUPLICATE_TRANSACTION\n');

  const stats = {
    total: totalCount,
    processed: 0,
    validNormalOk: 0,
    burstNormalOk: 0,
    burstFraudDetected: 0,
    invalidHashAudited: 0,
    invalidFormatRejected: 0,
    duplicatesRejected: 0,
    unexpected: 0,
    unexpectedSamples: [],
    latencies: [],
  };

  function evaluateItem(item, status, body) {
    let ok = false;
    if (item.category === 'VALID_NORMAL') {
      if (
        status === 200 &&
        body?.transaction?.estado === 'Procesada' &&
        body?.analysis?.isAnomaly === false
      ) {
        stats.validNormalOk++;
        ok = true;
      }
    } else if (item.category === 'VALID_BURST_FRAUD') {
      if (status === 200 && body?.transaction?.estado === 'Procesada') {
        if (body?.analysis?.isAnomaly) {
          stats.burstFraudDetected++;
        } else {
          stats.burstNormalOk++;
        }
        ok = true;
      }
    } else if (item.category === 'INVALID_HASH') {
      if (
        status === 400 &&
        body?.error === 'INVALID_HASH' &&
        body?.transaction?.estado === 'Hash inválido' &&
        body?.anomaly?.tipo === 'HASH_INVALIDO'
      ) {
        stats.invalidHashAudited++;
        ok = true;
      }
    } else if (item.category === 'INVALID_FORMAT') {
      if (status === 400 && body?.error === 'VALIDATION_ERROR') {
        stats.invalidFormatRejected++;
        ok = true;
      }
    } else if (item.category === 'INVALID_DUPLICATE') {
      if (status === 409 && body?.error === 'DUPLICATE_TRANSACTION') {
        stats.duplicatesRejected++;
        ok = true;
      }
    }

    if (!ok) {
      stats.unexpected++;
      if (stats.unexpectedSamples.length < 5) {
        stats.unexpectedSamples.push({
          category: item.category,
          description: item.description,
          status,
          body,
        });
      }
    }
  }

  async function processSingle(item) {
    const t0 = performance.now();
    try {
      const { status, body } = await sendWithRetry(endpoint, item.payload);
      const elapsed = performance.now() - t0;
      stats.latencies.push(elapsed);
      stats.processed++;
      evaluateItem(item, status, body);
    } catch (err) {
      stats.processed++;
      stats.unexpected++;
      if (stats.unexpectedSamples.length < 5) {
        stats.unexpectedSamples.push({
          category: item.category,
          description: item.description,
          error: err.message,
        });
      }
    }

    if (stats.processed % 60 === 0 || stats.processed === stats.total) {
      const pct = Math.round((stats.processed / stats.total) * 100);
      const avg = (
        stats.latencies.reduce((acc, v) => acc + v, 0) / (stats.latencies.length || 1)
      ).toFixed(1);
      console.log(
        `  ⏳ Progreso: ${String(stats.processed).padStart(3)}/${stats.total} (${String(pct).padStart(3)}%) | Latencia media RTT: ${avg} ms`
      );
    }
  }

  async function runInBatches(items, concurrency = 6) {
    for (let i = 0; i < items.length; i += concurrency) {
      const slice = items.slice(i, i + concurrency);
      await Promise.all(slice.map((item) => processSingle(item)));
    }
  }

  const startedAt = Date.now();

  // Fase 1: Válidas normales, hash inválido y formato inválido (concurrencia controlada = 6)
  await runInBatches(normalAndErrors, 6);

  // Fase 2: Ráfagas por usuario (los usuarios corren en paralelo entre sí, pero cada usuario envía su ráfaga en orden)
  await Promise.all(
    burstsByUser.map(async (userSeq) => {
      for (const item of userSeq) {
        await processSingle(item);
      }
    })
  );

  // Fase 3: Duplicadas (después de que las originales de Fase 1 ya fueron guardadas)
  await runInBatches(duplicates, 6);

  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  const avgLatency = (
    stats.latencies.reduce((acc, v) => acc + v, 0) / (stats.latencies.length || 1)
  ).toFixed(2);
  const throughput = (stats.processed / (Number(totalSeconds) || 1)).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log('📊 REPORTE FINAL DE AUDITORÍA: 720 TRANSACCIONES VÍA NGROK');
  console.log('='.repeat(80));
  console.log(`
┌──────────────────────────────────────────────────────────────┬──────────┐
│ Casuística Evaluada                                          │ Cantidad │
├──────────────────────────────────────────────────────────────┼──────────┤
│ 1. Válidas Normales (200 OK - Estado: Procesada, NORMAL)     │ ${String(stats.validNormalOk).padStart(8)} │
│ 2a. Ráfaga - Previas al umbral de su franja (200 OK - NORMAL)│ ${String(stats.burstNormalOk).padStart(8)} │
│ 2b. Ráfaga - Anomalía detectada (200 OK - POSIBLE_FRAUDE)    │ ${String(stats.burstFraudDetected).padStart(8)} │
│ 3. Hash Inválido / Adulterado (400 INVALID_HASH - Auditadas) │ ${String(stats.invalidHashAudited).padStart(8)} │
│ 4. Formato / Esquema Inválido (400 VALIDATION_ERROR)         │ ${String(stats.invalidFormatRejected).padStart(8)} │
│ 5. Transacciones Duplicadas (409 DUPLICATE_TRANSACTION)      │ ${String(stats.duplicatesRejected).padStart(8)} │
├──────────────────────────────────────────────────────────────┼──────────┤
│ TOTAL PROCESADAS VÍA NGROK                                   │ ${String(stats.processed).padStart(8)} │
│ Respuestas inesperadas / errores                             │ ${String(stats.unexpected).padStart(8)} │
└──────────────────────────────────────────────────────────────┴──────────┘`);
  console.log(
    `⚡ Tiempo total: ${totalSeconds} s | Throughput: ${throughput} txns/s | Latencia media RTT: ${avgLatency} ms\n`
  );

  if (stats.unexpected > 0) {
    console.log('⚠️ Muestras inesperadas:', JSON.stringify(stats.unexpectedSamples, null, 2));
  }

  await db.close();
}

main().catch(async (err) => {
  console.error('❌ Error ejecutando lote de 720 transacciones:', err);
  await db.close();
  process.exit(1);
});
