const API_BASE = 'http://localhost:3000';

// Genera un pedido con datos aleatorios
function randomOrder(i) {
  const products = [
    { name: 'Coffee', quantity: Math.ceil(Math.random() * 3), price: 5000 },
    { name: 'Muffin', quantity: 1, price: 8000 },
  ];
  return { customer: `LoadTest-${i}`, products };
}

// Envía UN pedido y mide cuánto tardó
async function sendOrder(i) {
  const start = performance.now();
  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(randomOrder(i)),
    });
    const ms = performance.now() - start;
    return { ok: response.ok, ms };
  } catch (err) {
    const ms = performance.now() - start;
    return { ok: false, ms, error: err.message };
  }
}

// Dispara N pedidos AL MISMO TIEMPO y mide el resultado del lote completo
async function runBatch(concurrency) {
  const start = performance.now();

  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(sendOrder(i));
  }
  const results = await Promise.all(promises);

  const totalMs = performance.now() - start;
  const successCount = results.filter(r => r.ok).length;
  const failCount = results.length - successCount;
  const times = results.map(r => r.ms);
  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const maxMs = Math.max(...times);
  const minMs = Math.min(...times);

  return { concurrency, totalMs, successCount, failCount, avgMs, minMs, maxMs };
}

async function main() {
  const levels = [10, 20, 50, 100, 500];

  console.log('Concurrencia'.padEnd(14), '| Tiempo total'.padEnd(16), '| Éxitos'.padEnd(10), '| Fallos'.padEnd(10), '| Prom/pedido'.padEnd(14), '| Máximo'.padEnd(12), '| Mínimo');
  console.log('-'.repeat(100));

  for (const level of levels) {
    const result = await runBatch(level);
    console.log(
      String(result.concurrency).padEnd(14),
      `${result.totalMs.toFixed(0)}ms`.padEnd(16),
      String(result.successCount).padEnd(10),
      String(result.failCount).padEnd(10),
      `${result.avgMs.toFixed(1)}ms`.padEnd(14),
      `${result.maxMs.toFixed(1)}ms`.padEnd(12),
      `${result.minMs.toFixed(1)}ms`
    );
  }
}

main();