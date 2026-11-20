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
      const httpsTunnel = (data.tunnels || []).find((t) => t.proto === 'https') || (data.tunnels || [])[0];
      if (httpsTunnel && httpsTunnel.public_url) {
        return httpsTunnel.public_url.replace(/\/$/, '');
      }
    }
  } catch {
    // Fallback a la URL de ngrok conocida
  }
  return DEFAULT_NGROK_URL;
}

/**
 * Construye exactamente 300 transacciones distribuidas en las 5 casuísticas:
 * 1. VALID_NORMAL      : 150 transacciones (200 OK - Procesada, sin anomalía)
 * 2. VALID_BURST_FRAUD :  50 transacciones (200 OK - 5 ráfagas de 10 txns -> POSIBLE_FRAUDE)
 * 3. INVALID_HASH      :  40 transacciones (400 INVALID_HASH - Auditadas en BD como Hash inválido + Crítico)
 * 4. INVALID_FORMAT    :  35 transacciones (400 VALIDATION_ERROR - Datos mal formados)
 * 5. INVALID_DUPLICATE :  25 transacciones (409 DUPLICATE_TRANSACTION - Replay de idTxn existente)
 * -------------------------------------------------------------------------
 * TOTAL                : 300 transacciones
 */
function build300Dataset(baseId) {
  const dataset = [];
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
  const baseTime = Date.now() - 3600000;

  // =========================================================================
  // 1. 150 TRANSACCIONES VÁLIDAS NORMALES (usuarios únicos para no disparar ventana deslizante)
  // =========================================================================
  const duplicateCandidates = [];
  for (let i = 0; i < 150; i++) {
    currentId++;
    const user = `cliente.normal.${i + 1}@appresso.co`;
    const value = 6500 + ((i * 1750) % 85000);
    const date = new Date(baseTime + i * 5000).toISOString();
    const paymentMethod = paymentMethods[i % paymentMethods.length];

    const base = { idTxn: currentId, user, date, value, paymentMethod };
    const hash = generateTransactionHash(base, secret);
    const txn = { ...base, hash };

    if (i < 25) {
      duplicateCandidates.push(txn);
    }

    dataset.push({
      category: 'VALID_NORMAL',
      expectedStatus: 200,
      description: `Válida normal #${i + 1} (${paymentMethod})`,
      payload: txn,
    });
  }

  // =========================================================================
  // 2. 50 TRANSACCIONES EN RÁFAGA (5 usuarios x 10 transacciones consecutivas)
  // Disparan anomalía POSIBLE_FRAUDE por ventana deslizante en cualquier franja horaria
  // =========================================================================
  const burstUsers = [
    'rafaga.fraude1@appresso.co',
    'rafaga.fraude2@appresso.co',
    'rafaga.fraude3@appresso.co',
    'rafaga.fraude4@appresso.co',
    'rafaga.fraude5@appresso.co',
  ];

  for (let b = 0; b < burstUsers.length; b++) {
    const burstUser = burstUsers[b];
    const burstStart = Date.now() - 15000 + b * 2000;
    for (let j = 0; j < 10; j++) {
      currentId++;
      const value = 18000 + j * 3500;
      const date = new Date(burstStart + j * 200).toISOString();
      const paymentMethod = paymentMethods[(b + j) % paymentMethods.length];
      const base = { idTxn: currentId, user: burstUser, date, value, paymentMethod };
      const hash = generateTransactionHash(base, secret);

      dataset.push({
        category: 'VALID_BURST_FRAUD',
        expectedStatus: 200,
        description: `Ráfaga usuario ${b + 1} (txn ${j + 1}/10) - ${burstUser}`,
        payload: { ...base, hash },
      });
    }
  }

  // =========================================================================
  // 3. 40 TRANSACCIONES CON HASH INVÁLIDO / ADULTERADAS (400 INVALID_HASH - Auditadas)
  // =========================================================================
  for (let k = 0; k < 40; k++) {
    currentId++;
    const user = `auditoria.hash.${k + 1}@appresso.co`;
    const originalValue = 22000 + k * 1000;
    const date = new Date(baseTime + k * 8000).toISOString();
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
      payload = { ...base, value: originalValue + 750000, hash: validHash };
      desc = `Hash inválido: monto adulterado (${originalValue} -> ${originalValue + 750000})`;
    } else if (k % 4 === 1) {
      payload = { ...base, user: `suplantador.${k}@malicioso.org`, hash: validHash };
      desc = 'Hash inválido: usuario modificado post-firma';
    } else if (k % 4 === 2) {
      payload = { ...base, paymentMethod: 'CriptoNoAutorizado', hash: validHash };
      desc = 'Hash inválido: método de pago modificado post-firma';
    } else {
      const attackerHash = generateTransactionHash(base, 'clave_secreta_falsa_atacante');
      payload = { ...base, hash: attackerHash };
      desc = 'Hash inválido: firmado con llave secreta apócrifa';
    }

    dataset.push({
      category: 'INVALID_HASH',
      expectedStatus: 400,
      description: desc,
      payload,
    });
  }

  // =========================================================================
  // 4. 35 TRANSACCIONES CON FORMATO / ESQUEMA INVÁLIDO (400 VALIDATION_ERROR)
  // =========================================================================
  const invalidTemplates = [
    { mutation: { idTxn: -500 }, desc: 'idTxn negativo' },
    { mutation: { idTxn: 0 }, desc: 'idTxn igual a cero' },
    { mutation: { idTxn: 'abc-123' }, desc: 'idTxn alfanumérico' },
    { mutation: { user: 'usuario_sin_arroba.com' }, desc: 'Email sin símbolo @' },
    { mutation: { user: '   ' }, desc: 'Email en blanco' },
    { mutation: { date: '2026-10-21' }, desc: 'Fecha sin hora ISO 8601' },
    { mutation: { date: 'no-es-una-fecha' }, desc: 'Fecha con texto inválido' },
    { mutation: { value: 0 }, desc: 'Valor igual a 0' },
    { mutation: { value: -35000 }, desc: 'Valor negativo' },
    { mutation: { paymentMethod: '' }, desc: 'Método de pago vacío' },
    { mutation: { hash: '12345abcde' }, desc: 'Hash truncado (< 64 caracteres)' },
    { mutation: { hash: 'z'.repeat(64) }, desc: 'Hash con caracteres fuera de hex' },
  ];

  for (let m = 0; m < 35; m++) {
    currentId++;
    const tpl = invalidTemplates[m % invalidTemplates.length];
    const base = {
      idTxn: currentId,
      user: `formato.invalido.${m + 1}@appresso.co`,
      date: new Date().toISOString(),
      value: 30000,
      paymentMethod: 'Tarjeta',
      hash: 'a'.repeat(64),
    };

    dataset.push({
      category: 'INVALID_FORMAT',
      expectedStatus: 400,
      description: `Formato inválido: ${tpl.desc}`,
      payload: { ...base, ...tpl.mutation },
    });
  }

  // =========================================================================
  // 5. 25 TRANSACCIONES DUPLICADAS (409 DUPLICATE_TRANSACTION)
  // =========================================================================
  for (let d = 0; d < 25; d++) {
    const original = duplicateCandidates[d];
    dataset.push({
      category: 'INVALID_DUPLICATE',
      expectedStatus: 409,
      description: `Duplicada (reintenta idTxn=${original.idTxn})`,
      payload: { ...original },
    });
  }

  return dataset;
}

async function sendWithRetry(url, payload, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Scenario': 'appresso-ngrok-300-suite',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429 && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body, requestId: res.headers.get('x-request-id') };
  }
}

async function main() {
  const baseUrl = await resolveNgrokUrl();
  const endpoint = `${baseUrl}/api/transactions`;

  console.log('='.repeat(80));
  console.log('🌐 ENVÍO DE 300 TRANSACCIONES MULTICASUÍSTICA VÍA NGROK - APPRESSO');
  console.log('='.repeat(80));
  console.log(`📡 Túnel Ngrok destino : ${endpoint}`);
  console.log('🔎 Inspector Ngrok UI  : http://127.0.0.1:4040\n');

  const baseId = Date.now();
  const dataset = build300Dataset(baseId);

  console.log(`📦 Total preparado: ${dataset.length} transacciones`);
  console.log('  1️⃣  150 Válidas Normales               -> Esperado: 200 OK (Procesada / NORMAL)');
  console.log('  2️⃣   50 Válidas en Ráfaga (Fraude)     -> Esperado: 200 OK (POSIBLE_FRAUDE en ventana)');
  console.log('  3️⃣   40 Hash Inválido / Adulteradas    -> Esperado: 400 INVALID_HASH (Auditadas en BD)');
  console.log('  4️⃣   35 Formato / Esquema Inválido     -> Esperado: 400 VALIDATION_ERROR');
  console.log('  5️⃣   25 Transacciones Duplicadas       -> Esperado: 409 DUPLICATE_TRANSACTION\n');

  const stats = {
    total: dataset.length,
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

  const startedAt = Date.now();

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i];
    const t0 = performance.now();

    try {
      const { status, body } = await sendWithRetry(endpoint, item.payload);
      const elapsed = performance.now() - t0;
      stats.latencies.push(elapsed);
      stats.processed++;

      let ok = false;
      if (item.category === 'VALID_NORMAL') {
        if (status === 200 && body?.transaction?.estado === 'Procesada' && body?.analysis?.isAnomaly === false) {
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
            index: i + 1,
            category: item.category,
            status,
            body,
          });
        }
      }
    } catch (err) {
      stats.processed++;
      stats.unexpected++;
      if (stats.unexpectedSamples.length < 5) {
        stats.unexpectedSamples.push({
          index: i + 1,
          category: item.category,
          error: err.message,
        });
      }
    }

    if (stats.processed % 25 === 0 || stats.processed === stats.total) {
      const pct = Math.round((stats.processed / stats.total) * 100);
      const avg = (
        stats.latencies.reduce((acc, v) => acc + v, 0) / (stats.latencies.length || 1)
      ).toFixed(1);
      console.log(
        `  ⏳ Progreso: ${String(stats.processed).padStart(3)}/${stats.total} (${String(pct).padStart(3)}%) | Latencia media vía Ngrok: ${avg} ms`
      );
    }
  }

  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  const avgLatency = (
    stats.latencies.reduce((acc, v) => acc + v, 0) / (stats.latencies.length || 1)
  ).toFixed(2);

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMEN FINAL DE LAS 300 TRANSACCIONES ENVIADAS POR NGROK');
  console.log('='.repeat(80));
  console.log(`
┌──────────────────────────────────────────────────────────────┬──────────┐
│ Casuística                                                   │ Cantidad │
├──────────────────────────────────────────────────────────────┼──────────┤
│ 1. Válidas Normales (200 OK - Estado: Procesada, NORMAL)     │ ${String(stats.validNormalOk).padStart(8)} │
│ 2a. Ráfaga - Previas al umbral (200 OK - NORMAL)             │ ${String(stats.burstNormalOk).padStart(8)} │
│ 2b. Ráfaga - Anomalía detectada (200 OK - POSIBLE_FRAUDE)    │ ${String(stats.burstFraudDetected).padStart(8)} │
│ 3. Hash Inválido / Adulterado (400 INVALID_HASH - Auditadas) │ ${String(stats.invalidHashAudited).padStart(8)} │
│ 4. Formato / Esquema Inválido (400 VALIDATION_ERROR)         │ ${String(stats.invalidFormatRejected).padStart(8)} │
│ 5. Transacciones Duplicadas (409 DUPLICATE_TRANSACTION)      │ ${String(stats.duplicatesRejected).padStart(8)} │
├──────────────────────────────────────────────────────────────┼──────────┤
│ TOTAL ENVIADAS VÍA NGROK                                     │ ${String(stats.processed).padStart(8)} │
│ Respuestas inesperadas                                       │ ${String(stats.unexpected).padStart(8)} │
└──────────────────────────────────────────────────────────────┴──────────┘`);
  console.log(`⏱️  Tiempo total: ${totalSeconds} s | Latencia promedio (Ngrok RTT): ${avgLatency} ms\n`);

  if (stats.unexpected > 0) {
    console.log('⚠️ Muestras inesperadas:', JSON.stringify(stats.unexpectedSamples, null, 2));
  }

  await db.close();
}

main().catch(async (err) => {
  console.error('❌ Error ejecutando lote de 300 transacciones:', err);
  await db.close();
  process.exit(1);
});
