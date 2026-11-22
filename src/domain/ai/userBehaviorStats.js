const ss = require('simple-statistics');

/**
 * Calcula estadísticas descriptivas y cuartiles seguros con Simple Statistics.
 */
function computeQuartileSummary(values = []) {
  const numeric = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 0);

  if (numeric.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      q1: 0,
      q2: 0,
      q3: 0,
      iqr: 0,
      upperFence: 0,
      lowerFence: 0,
    };
  }

  const sorted = [...numeric].sort((a, b) => a - b);
  const mean = ss.mean(sorted);
  const median = ss.medianSorted(sorted);
  const stdDev = sorted.length > 1 ? ss.standardDeviation(sorted) : 0;
  const q1 = ss.quantileSorted(sorted, 0.25);
  const q2 = median;
  const q3 = ss.quantileSorted(sorted, 0.75);
  const iqr = sorted.length > 1 ? ss.interquartileRange(sorted) : 0;
  const upperFence = q3 + 1.5 * iqr;
  const lowerFence = Math.max(0, q1 - 1.5 * iqr);

  return {
    count: sorted.length,
    min: Number(ss.minSorted(sorted).toFixed(2)),
    max: Number(ss.maxSorted(sorted).toFixed(2)),
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    q1: Number(q1.toFixed(2)),
    q2: Number(q2.toFixed(2)),
    q3: Number(q3.toFixed(2)),
    iqr: Number(iqr.toFixed(2)),
    upperFence: Number(upperFence.toFixed(2)),
    lowerFence: Number(lowerFence.toFixed(2)),
  };
}

/**
 * Construye el perfil estadístico por usuario (clientes y empleados) usando Simple Statistics.
 * Entrada: historial de operaciones (pedidos, facturas, pagos, transacciones), anulaciones y descuentos.
 * Salida: cuartiles (Q1, Q2, Q3, IQR), score de anomalía (0-100), valores atípicos, alertas y estado de comportamiento.
 */
function analyzeUserBehaviorProfiles({
  users = [],
  orders = [],
  invoices = [],
  payments = [],
  transactions = [],
}) {
  // 1. Calcular cuartiles globales de montos y descuentos en el sistema para referencia cruzada
  const allAmounts = [
    ...invoices.map((i) => Number(i.total || 0)),
    ...transactions.map((t) => Number(t.valor || 0)),
    ...orders.map((o) =>
      typeof o.totalAmount === 'function' ? o.totalAmount() : Number(o.total || 0)
    ),
  ].filter((v) => v > 0);

  const allDiscountPcts = invoices
    .map((i) => Number(i.porcentaje_descuento ?? 0))
    .filter((v) => v >= 0);

  const globalAmountStats = computeQuartileSummary(
    allAmounts.length > 0 ? allAmounts : [10000, 18000, 25000, 32000, 45000]
  );
  const globalDiscountStats = computeQuartileSummary(
    allDiscountPcts.length > 0 ? allDiscountPcts : [0, 5, 10, 15, 20]
  );

  // Agrupar operaciones por usuario (por ID o email/nombre)
  const userBuckets = new Map();

  const ensureBucket = (key, userMeta = {}) => {
    const cleanKey = String(key || 'anonimo').toLowerCase().trim();
    if (!userBuckets.has(cleanKey)) {
      userBuckets.set(cleanKey, {
        userId: userMeta.id || null,
        nombre: userMeta.nombre || userMeta.name || String(key),
        email: userMeta.email || (String(key).includes('@') ? String(key) : `${cleanKey}@appresso.co`),
        rol: userMeta.rol || 'cliente',
        amounts: [],
        discountsPct: [],
        discountsValue: [],
        totalOperations: 0,
        cancelledCount: 0,
        invalidHashOrReceiptCount: 0,
        nightOperationsCount: 0,
        channels: {},
        paymentMethods: {},
      });
    }
    return userBuckets.get(cleanKey);
  };

  const userById = new Map();
  for (const u of users) {
    userById.set(Number(u.id), u);
    ensureBucket(u.email || u.nombre || `user_${u.id}`, u);
  }

  // Integrar facturas (incluye descuentos y anulaciones)
  for (const inv of invoices) {
    const userObj =
      userById.get(Number(inv.usuario_id || inv.empleado_id)) ||
      { id: inv.usuario_id, nombre: inv.customer || `Usuario #${inv.usuario_id || 1}` };
    const key = userObj.email || userObj.nombre || `user_${inv.usuario_id || 1}`;
    const bucket = ensureBucket(key, userObj);

    const total = Number(inv.total || 0);
    const discountPct = Number(inv.porcentaje_descuento || 0);
    const discountVal = Number(inv.descuento || 0);

    bucket.totalOperations++;
    if (total > 0) bucket.amounts.push(total);
    bucket.discountsPct.push(discountPct);
    bucket.discountsValue.push(discountVal);

    if (inv.estado === 'Anulada') bucket.cancelledCount++;
    if (inv.estado === 'Alterada') bucket.invalidHashOrReceiptCount++;

    const ch = inv.canal || 'presencial';
    bucket.channels[ch] = (bucket.channels[ch] || 0) + 1;
  }

  // Integrar pedidos
  for (const ord of orders) {
    const userObj = userById.get(Number(ord.usuario_id || ord.usuarioId)) || {
      nombre: ord.customer || 'Cliente',
    };
    const key = userObj.email || ord.customer || `user_${ord.usuario_id || 1}`;
    const bucket = ensureBucket(key, userObj);

    const amount =
      typeof ord.totalAmount === 'function'
        ? ord.totalAmount()
        : Number(ord.total || 0);
    bucket.totalOperations++;
    if (amount > 0) bucket.amounts.push(amount);
    if (ord.status === 'Cancelled' || ord.status === 'Anulado') {
      bucket.cancelledCount++;
    }
    const ch = ord.canal || 'presencial';
    bucket.channels[ch] = (bucket.channels[ch] || 0) + 1;
  }

  // Integrar pagos
  for (const pay of payments) {
    const userObj = userById.get(Number(pay.usuario_id)) || {
      id: pay.usuario_id,
      nombre: `Usuario #${pay.usuario_id || 1}`,
    };
    const key = userObj.email || userObj.nombre || `user_${pay.usuario_id || 1}`;
    const bucket = ensureBucket(key, userObj);

    bucket.totalOperations++;
    if (Number(pay.monto) > 0) bucket.amounts.push(Number(pay.monto));
    if (pay.comprobante_valido === false || pay.estado === 'Sospechoso' || pay.estado === 'Rechazado') {
      bucket.invalidHashOrReceiptCount++;
    }
    const method = pay.metodo_pago || 'Efectivo';
    bucket.paymentMethods[method] = (bucket.paymentMethods[method] || 0) + 1;
  }

  // Integrar transacciones de monitoreo
  for (const txn of transactions) {
    const key = txn.email || `user_${txn.usuario_id || 1}`;
    const userObj = userById.get(Number(txn.usuario_id)) || {
      id: txn.usuario_id,
      email: txn.email,
      nombre: txn.email ? txn.email.split('@')[0] : `Usuario #${txn.usuario_id}`,
    };
    const bucket = ensureBucket(key, userObj);

    const val = Number(txn.valor || 0);
    bucket.totalOperations++;
    if (val > 0) bucket.amounts.push(val);
    if (txn.estado === 'Hash inválido' || txn.es_anomalia) {
      bucket.invalidHashOrReceiptCount++;
    }
    const hour = txn.fecha_txn ? new Date(txn.fecha_txn).getHours() : 12;
    if (hour >= 0 && hour <= 5) {
      bucket.nightOperationsCount++;
    }
    const method = txn.metodo_pago || 'Tarjeta';
    bucket.paymentMethods[method] = (bucket.paymentMethods[method] || 0) + 1;
  }

  const profiles = [];

  for (const bucket of userBuckets.values()) {
    if (bucket.totalOperations === 0 && bucket.amounts.length === 0) continue;

    const quartiles = computeQuartileSummary(bucket.amounts);
    const discountQuartiles = computeQuartileSummary(bucket.discountsPct);
    const cancellationRate =
      bucket.totalOperations > 0
        ? Number(((bucket.cancelledCount / bucket.totalOperations) * 100).toFixed(2))
        : 0;
    const maxDiscountPct = discountQuartiles.max;

    // Detectar valores atípicos (outliers) superiores a la valla intercuartílica global o propia
    const upperFence = Math.max(
      globalAmountStats.upperFence || 150000,
      quartiles.upperFence || 150000
    );
    const outlierAmounts = bucket.amounts.filter((a) => a > upperFence);

    // Z-Score del monto máximo respecto a la media y desviación estándar global
    const maxAmountZScore =
      globalAmountStats.stdDev > 0
        ? Number(
            ss.zScore(quartiles.max, globalAmountStats.mean, globalAmountStats.stdDev).toFixed(2)
          )
        : 0;

    // Cálculo del score de anomalía (0 a 100) y alertas específicas
    let anomalyScore = 0;
    const alerts = [];

    if (maxDiscountPct > 30) {
      anomalyScore += 35;
      alerts.push({
        type: 'DESCUENTO_ABUSADO',
        severity: 'Alta',
        message: `Descuento máximo aplicado de ${maxDiscountPct}% supera el umbral permitido (30%) y Q3+1.5*IQR`,
      });
    } else if (
      discountQuartiles.upperFence > 0 &&
      maxDiscountPct > Math.max(20, globalDiscountStats.upperFence)
    ) {
      anomalyScore += 18;
      alerts.push({
        type: 'DESCUENTO_ATIPICO_IQR',
        severity: 'Media',
        message: `Descuento (${maxDiscountPct}%) por encima del rango intercuartílico esperado`,
      });
    }

    if (bucket.cancelledCount >= 2 || cancellationRate >= 25) {
      anomalyScore += 30;
      alerts.push({
        type: 'ANULACIONES_SOSPECHOSAS',
        severity: 'Alta',
        message: `${bucket.cancelledCount} anulaciones registradas (${cancellationRate}% de sus operaciones)`,
      });
    }

    if (bucket.invalidHashOrReceiptCount > 0) {
      anomalyScore += Math.min(40, bucket.invalidHashOrReceiptCount * 25);
      alerts.push({
        type: 'COMPROBANTE_O_FIRMA_INVALIDA',
        severity: 'Crítica',
        message: `${bucket.invalidHashOrReceiptCount} operación(es) con comprobante falso, firma alterada o ráfaga anómala`,
      });
    }

    if (outlierAmounts.length > 0 || maxAmountZScore > 2.2) {
      anomalyScore += 20;
      alerts.push({
        type: 'MONTO_ATIPICO_CUARTIL',
        severity: 'Media',
        message: `${outlierAmounts.length || 1} monto(s) atípico(s) detectado(s) (Máx: $${quartiles.max.toLocaleString()}, Z-Score: ${maxAmountZScore})`,
      });
    }

    if (bucket.nightOperationsCount >= 3) {
      anomalyScore += 15;
      alerts.push({
        type: 'PATRON_HORARIO_MADRUGADA',
        severity: 'Media',
        message: `${bucket.nightOperationsCount} operaciones realizadas en horario de madrugada (00:00 - 05:59)`,
      });
    }

    anomalyScore = Math.min(100, Math.round(anomalyScore));

    const classification =
      anomalyScore >= 50
        ? 'SOSPECHOSO'
        : anomalyScore >= 25
          ? 'EN_OBSERVACION'
          : 'NORMAL';

    profiles.push({
      userId: bucket.userId,
      nombre: bucket.nombre,
      email: bucket.email,
      rol: bucket.rol,
      totalOperations: bucket.totalOperations,
      cancelledCount: bucket.cancelledCount,
      cancellationRatePct: cancellationRate,
      maxDiscountPct,
      avgDiscountPct: discountQuartiles.mean,
      invalidHashOrReceiptCount: bucket.invalidHashOrReceiptCount,
      quartiles: {
        q1: quartiles.q1,
        q2: quartiles.q2,
        q3: quartiles.q3,
        iqr: quartiles.iqr,
        upperFence: Number(upperFence.toFixed(2)),
        mean: quartiles.mean,
        stdDev: quartiles.stdDev,
        max: quartiles.max,
      },
      maxAmountZScore,
      outlierCount: outlierAmounts.length,
      anomalyScore,
      classification,
      alerts,
      channels: bucket.channels,
      paymentMethods: bucket.paymentMethods,
    });
  }

  // Ordenar perfiles de mayor a menor riesgo
  profiles.sort((a, b) => b.anomalyScore - a.anomalyScore);

  return {
    globalStats: {
      amounts: globalAmountStats,
      discounts: globalDiscountStats,
      totalUsersAnalyzed: profiles.length,
      suspiciousUsersCount: profiles.filter((p) => p.classification === 'SOSPECHOSO').length,
      observationUsersCount: profiles.filter((p) => p.classification === 'EN_OBSERVACION').length,
    },
    profiles,
  };
}

/**
 * Predicción de demanda y ventas usando Regresión Lineal Simple de Simple Statistics
 * (ss.linearRegression, ss.linearRegressionLine, ss.rSquared).
 */
function predictDemandWithSimpleStatistics(dailySeries = [], horizonDays = 7) {
  const cleanSeries = dailySeries
    .map((val, idx) => [idx + 1, Number(val)])
    .filter((pair) => Number.isFinite(pair[1]) && pair[1] >= 0);

  if (cleanSeries.length < 2) {
    return {
      slope: 0,
      intercept: 0,
      rSquared: 0,
      trend: 'estable',
      forecasts: [],
    };
  }

  const regression = ss.linearRegression(cleanSeries);
  const predictFn = ss.linearRegressionLine(regression);
  const r2 = ss.rSquared(cleanSeries, predictFn);
  const n = cleanSeries.length;

  const forecasts = [];
  for (let d = 1; d <= horizonDays; d++) {
    const futureDay = n + d;
    const rawPred = predictFn(futureDay);
    forecasts.push({
      dayIndex: futureDay,
      daysAhead: d,
      predictedDemand: Math.max(0, Number(rawPred.toFixed(2))),
    });
  }

  const trend =
    regression.m > 0.5 ? 'creciente' : regression.m < -0.5 ? 'decreciente' : 'estable';

  return {
    slope: Number(regression.m.toFixed(4)),
    intercept: Number(regression.b.toFixed(4)),
    rSquared: Number((Number.isFinite(r2) ? r2 : 0).toFixed(4)),
    trend,
    historicalStats: computeQuartileSummary(cleanSeries.map((p) => p[1])),
    forecasts,
  };
}

/**
 * Analiza grandes conjuntos de datos y encuentra patrones por horario, monto, frecuencia y canal.
 */
function discoverOperationalPatterns({
  orders = [],
  invoices = [],
  payments = [],
  transactions = [],
}) {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    operations: 0,
    totalAmount: 0,
    anomalies: 0,
  }));

  const byChannel = {
    presencial: { count: 0, amount: 0 },
    web: { count: 0, amount: 0 },
    app: { count: 0, amount: 0 },
    domicilio: { count: 0, amount: 0 },
  };

  const byPaymentMethod = {};
  const allAmounts = [];

  const registerRecord = ({ date, amount, channel, method, isAnomaly }) => {
    const d = date ? new Date(date) : new Date();
    const hour = Number.isFinite(d.getHours()) ? d.getHours() : 12;
    const val = Number(amount || 0);

    byHour[hour].operations += 1;
    byHour[hour].totalAmount += val;
    if (isAnomaly) byHour[hour].anomalies += 1;

    if (channel) {
      const ch = byChannel[channel] ? channel : 'presencial';
      byChannel[ch].count += 1;
      byChannel[ch].amount += val;
    }

    if (method) {
      if (!byPaymentMethod[method]) {
        byPaymentMethod[method] = { count: 0, amount: 0, anomalies: 0 };
      }
      byPaymentMethod[method].count += 1;
      byPaymentMethod[method].amount += val;
      if (isAnomaly) byPaymentMethod[method].anomalies += 1;
    }

    if (val > 0) allAmounts.push(val);
  };

  for (const o of orders) {
    const amount =
      typeof o.totalAmount === 'function' ? o.totalAmount() : Number(o.total || 0);
    registerRecord({
      date: o.createdAt || o.created_at,
      amount,
      channel: o.canal || 'presencial',
      isAnomaly: o.status === 'Cancelled',
    });
  }

  for (const inv of invoices) {
    registerRecord({
      date: inv.created_at,
      amount: inv.total,
      channel: inv.canal || 'presencial',
      isAnomaly:
        inv.estado === 'Anulada' ||
        inv.estado === 'Alterada' ||
        Number(inv.porcentaje_descuento || 0) > 30,
    });
  }

  for (const pay of payments) {
    registerRecord({
      date: pay.fecha_pago,
      amount: pay.monto,
      method: pay.metodo_pago || 'Efectivo',
      isAnomaly: pay.comprobante_valido === false || pay.estado !== 'Aprobado',
    });
  }

  for (const txn of transactions) {
    registerRecord({
      date: txn.fecha_txn,
      amount: txn.valor,
      method: txn.metodo_pago || 'Tarjeta',
      isAnomaly: Boolean(txn.es_anomalia) || txn.estado === 'Hash inválido',
    });
  }

  const peakHour = [...byHour].sort((a, b) => b.operations - a.operations)[0] || byHour[12];
  const highestAnomalyHour =
    [...byHour].sort((a, b) => b.anomalies - a.anomalies)[0] || byHour[0];
  const dominantChannel = Object.entries(byChannel).sort(
    (a, b) => b[1].count - a[1].count
  )[0]?.[0] || 'presencial';

  return {
    amountQuartiles: computeQuartileSummary(allAmounts),
    peakHour,
    highestAnomalyHour,
    dominantChannel,
    byHour,
    byChannel,
    byPaymentMethod,
  };
}

module.exports = {
  computeQuartileSummary,
  analyzeUserBehaviorProfiles,
  predictDemandWithSimpleStatistics,
  discoverOperationalPatterns,
};
