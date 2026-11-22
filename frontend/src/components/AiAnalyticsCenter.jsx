import { useState, useEffect, useCallback } from 'react';
import {
  fetchAiStatus,
  trainAiModels,
  classifySingleOperation,
  fetchRecentClassifiedOperations,
  predictDemandAndAmount,
  fetchUserBehaviorProfiles,
  fetchOperationalPatterns,
} from '../api';

export default function AiAnalyticsCenter() {
  const [aiStatus, setAiStatus] = useState(null);
  const [recentOps, setRecentOps] = useState(null);
  const [userProfiles, setUserProfiles] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [demandResult, setDemandResult] = useState(null);
  const [classifierResult, setClassifierResult] = useState(null);
  const [training, setTraining] = useState(false);

  const [opInput, setOpInput] = useState({
    monto: 24500,
    hora: 14,
    metodoPago: 'Tarjeta',
    firmaValida: true,
    frecuencia: 1,
    porcentajeDescuento: 5,
    tasaAnulacionUsuario: 0,
    canal: 'presencial',
  });

  const [demandInput, setDemandInput] = useState({
    dailySeriesText: '18, 22, 25, 24, 29, 33, 37',
    horizonDays: 7,
    dayOfWeek: 6,
    hour: 15,
    canal: 'app',
    porcentajeDescuento: 10,
  });

  const loadAllAiData = useCallback(async () => {
    try {
      const [status, recent, profiles, pat, demand] = await Promise.all([
        fetchAiStatus(),
        fetchRecentClassifiedOperations(12),
        fetchUserBehaviorProfiles(),
        fetchOperationalPatterns(),
        predictDemandAndAmount({
          dailySeries: [18, 22, 25, 24, 29, 33, 37],
          horizonDays: 7,
          dayOfWeek: 6,
          hour: 15,
          canal: 'app',
          porcentajeDescuento: 10,
        }),
      ]);
      setAiStatus(status);
      setRecentOps(recent);
      setUserProfiles(profiles);
      setPatterns(pat);
      setDemandResult(demand);
    } catch (err) {
      console.error('Error cargando centro de IA:', err);
    }
  }, []);

  useEffect(() => {
    loadAllAiData();
  }, [loadAllAiData]);

  const handleTrainModels = async () => {
    setTraining(true);
    try {
      const status = await trainAiModels({ epochs: 40, augmentationFactor: 2 });
      setAiStatus(status);
      const recent = await fetchRecentClassifiedOperations(12);
      setRecentOps(recent);
    } finally {
      setTraining(false);
    }
  };

  const handleClassify = async (customPayload = null) => {
    const payload = customPayload || opInput;
    if (customPayload) setOpInput(customPayload);
    const res = await classifySingleOperation(payload);
    setClassifierResult(res);
  };

  const handlePredictDemand = async (e) => {
    e.preventDefault();
    const dailySeries = demandInput.dailySeriesText
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);

    const res = await predictDemandAndAmount({
      dailySeries,
      horizonDays: Number(demandInput.horizonDays) || 7,
      dayOfWeek: Number(demandInput.dayOfWeek) || 5,
      hour: Number(demandInput.hour) || 14,
      canal: demandInput.canal,
      porcentajeDescuento: Number(demandInput.porcentajeDescuento) || 5,
    });
    setDemandResult(res);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* SECCIÓN 1: MODELOS KERAS / TENSORFLOW (PREPARACIÓN, DATA AUGMENTATION, SAVE/LOAD & CLASIFICADOR) */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              1. Modelos Keras / TensorFlow.js — Clasificador de Operaciones & Regresor Neuronal
            </h3>
            <p className="text-xs text-neutral-500">
              Incluye normalización Min-Max con tensores, aumento de datos (Data Augmentation) y persistencia en disco (<code className="font-mono">model.json + weights.bin</code>).
            </p>
          </div>
          <button
            type="button"
            disabled={training}
            onClick={handleTrainModels}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            {training
              ? 'Entrenando Redes Keras...'
              : 'Reentrenar y Guardar Modelos en Disco (Data Augmentation)'}
          </button>
        </div>

        {aiStatus?.fraudClassifier && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5 text-xs">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-neutral-500">Arquitectura Keras</p>
              <p className="font-semibold text-neutral-900 mt-0.5">
                {aiStatus.fraudClassifier.architecture}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-neutral-500">Data Augmentation</p>
              <p className="text-lg font-bold text-neutral-900">
                {aiStatus.fraudClassifier.baseSamplesCount} →{' '}
                {aiStatus.fraudClassifier.augmentedSamplesCount} muestras
              </p>
              <p className="text-[11px] text-neutral-400">
                Factor x{aiStatus.fraudClassifier.augmentationFactor + 1} balanceado
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-neutral-500">Accuracy / Loss</p>
              <p className="text-lg font-bold text-emerald-700">
                {(aiStatus.fraudClassifier.finalAccuracy * 100).toFixed(1)}%
              </p>
              <p className="text-[11px] text-neutral-400">
                Loss: {aiStatus.fraudClassifier.finalLoss} ({aiStatus.fraudClassifier.epochs} épocas)
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-neutral-500">Regresor Demanda</p>
              <p className="font-semibold text-neutral-900">
                MSE: {aiStatus.demandRegressor?.finalMseLoss}
              </p>
              <p className="text-[11px] text-neutral-400">
                {aiStatus.demandRegressor?.architecture}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-emerald-800 font-medium">Persistencia en Disco</p>
              <p className="font-semibold text-emerald-950">Guardado y Cargado</p>
              <p className="text-[10px] font-mono text-emerald-700 truncate">
                saved_models/fraud_classifier/model.json
              </p>
            </div>
          </div>
        )}

        {/* Clasificador en vivo */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 border-t border-neutral-100 pt-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-neutral-900">
                Simulador del Clasificador Keras (Normal vs Fraudulenta)
              </h4>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleClassify({
                      monto: 18500,
                      hora: 11,
                      metodoPago: 'Tarjeta',
                      firmaValida: true,
                      frecuencia: 1,
                      porcentajeDescuento: 5,
                      tasaAnulacionUsuario: 0,
                      canal: 'presencial',
                    })
                  }
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800"
                >
                  Caso Normal
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleClassify({
                      monto: 280000,
                      hora: 3,
                      metodoPago: 'Transferencia',
                      firmaValida: false,
                      frecuencia: 7,
                      porcentajeDescuento: 15,
                      tasaAnulacionUsuario: 20,
                      canal: 'web',
                    })
                  }
                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800"
                >
                  Fraude: Firma Falsa / Ráfaga
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleClassify({
                      monto: 145000,
                      hora: 19,
                      metodoPago: 'Efectivo',
                      firmaValida: true,
                      frecuencia: 3,
                      porcentajeDescuento: 55,
                      tasaAnulacionUsuario: 40,
                      canal: 'presencial',
                    })
                  }
                  className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800"
                >
                  Fraude: Descuento Abusado 55%
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">Monto (COP)</label>
                <input
                  type="number"
                  value={opInput.monto}
                  onChange={(e) => setOpInput({ ...opInput, monto: Number(e.target.value) })}
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">Hora (0-23)</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={opInput.hora}
                  onChange={(e) => setOpInput({ ...opInput, hora: Number(e.target.value) })}
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">Frecuencia</label>
                <input
                  type="number"
                  min="1"
                  value={opInput.frecuencia}
                  onChange={(e) =>
                    setOpInput({ ...opInput, frecuencia: Number(e.target.value) })
                  }
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">Descuento (%)</label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={opInput.porcentajeDescuento}
                  onChange={(e) =>
                    setOpInput({ ...opInput, porcentajeDescuento: Number(e.target.value) })
                  }
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">Método Pago</label>
                <select
                  value={opInput.metodoPago}
                  onChange={(e) => setOpInput({ ...opInput, metodoPago: e.target.value })}
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                >
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="PSE">PSE</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">Canal</label>
                <select
                  value={opInput.canal}
                  onChange={(e) => setOpInput({ ...opInput, canal: e.target.value })}
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                >
                  <option value="presencial">Presencial</option>
                  <option value="web">Web</option>
                  <option value="app">App</option>
                  <option value="domicilio">Domicilio</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">
                  Anulaciones Usuario (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={opInput.tasaAnulacionUsuario}
                  onChange={(e) =>
                    setOpInput({
                      ...opInput,
                      tasaAnulacionUsuario: Number(e.target.value),
                    })
                  }
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">
                  Firma / Comprobante
                </label>
                <select
                  value={opInput.firmaValida ? 'true' : 'false'}
                  onChange={(e) =>
                    setOpInput({ ...opInput, firmaValida: e.target.value === 'true' })
                  }
                  className="w-full rounded border border-neutral-300 px-2 py-1.5"
                >
                  <option value="true">Válida (HMAC OK)</option>
                  <option value="false">Falsa / Alterada</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleClassify()}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              Clasificar Operación con Red Neuronal Keras
            </button>
          </div>

          {/* Resultado de inferencia neuronal */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 flex flex-col justify-between">
            {classifierResult ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">
                    Resultado Clasificador Keras:
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      classifierResult.isFraudulent
                        ? 'bg-red-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {classifierResult.classification} (Riesgo {classifierResult.riskLevel})
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span>Probabilidad de Fraude:</span>
                    <span className="font-bold">
                      {(classifierResult.fraudProbability * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                    <div
                      className={`h-full ${
                        classifierResult.isFraudulent ? 'bg-red-600' : 'bg-emerald-600'
                      }`}
                      style={{
                        width: `${Math.min(100, classifierResult.fraudProbability * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-neutral-800 mb-1">
                    Factores Determinantes:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-neutral-700">
                    {classifierResult.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div className="font-mono text-[10px] text-neutral-500 bg-white p-2 rounded border border-neutral-200">
                  Tensor Normalizado [8]: [{classifierResult.normalizedFeatures.join(', ')}]
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 my-auto text-center">
                Selecciona un caso de prueba o haz clic en &ldquo;Clasificar Operación&rdquo; para ejecutar la inferencia en TensorFlow/Keras.
              </p>
            )}
          </div>
        </div>

        {/* Clasificación en lote de operaciones recientes */}
        {recentOps && (
          <div className="border-t border-neutral-100 pt-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-2">
              Operaciones del Sistema Evaluadas Automáticamente ({recentOps.normalCount} Normales /{' '}
              {recentOps.fraudulentCount} Fraudulentas)
            </h4>
            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 text-neutral-500">
                  <tr>
                    <th className="py-1.5 pr-2">Tipo</th>
                    <th className="py-1.5 pr-2">Referencia</th>
                    <th className="py-1.5 pr-2">Usuario</th>
                    <th className="py-1.5 pr-2">Monto</th>
                    <th className="py-1.5 pr-2">Canal / Método</th>
                    <th className="py-1.5 pr-2">Score IA</th>
                    <th className="py-1.5">Clasificación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {recentOps.results.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 pr-2 font-medium">{item.sourceType}</td>
                      <td className="py-1.5 pr-2 font-mono">{item.reference}</td>
                      <td className="py-1.5 pr-2">{item.user}</td>
                      <td className="py-1.5 pr-2 font-semibold">
                        ${Number(item.monto).toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-2">
                        {item.canal} / {item.metodoPago}
                      </td>
                      <td className="py-1.5 pr-2 font-mono">
                        {(item.prediction.fraudProbability * 100).toFixed(1)}%
                      </td>
                      <td className="py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            item.prediction.isFraudulent
                              ? 'bg-red-100 text-red-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.prediction.classification}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: SIMPLE STATISTICS — PERFILES ESTADÍSTICOS Y ANOMALÍAS POR USUARIO */}
      {userProfiles && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              2. Simple Statistics — Perfil Estadístico por Usuario, Cuartiles (Q1, Q2, Q3, IQR) y Detección de Anomalías
            </h3>
            <p className="text-xs text-neutral-500">
              Analiza historial de operaciones, anulaciones y descuentos por usuario para detectar valores atípicos y comportamientos anormales.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 text-xs">
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-neutral-500">Mediana Global (Q2)</p>
              <p className="text-lg font-bold text-neutral-900">
                ${Number(userProfiles.globalStats.amounts.q2).toLocaleString()}
              </p>
              <p className="text-[11px] text-neutral-400">
                Q1: ${Number(userProfiles.globalStats.amounts.q1).toLocaleString()} | Q3: $
                {Number(userProfiles.globalStats.amounts.q3).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-neutral-500">Rango Intercuartílico (IQR)</p>
              <p className="text-lg font-bold text-neutral-900">
                ${Number(userProfiles.globalStats.amounts.iqr).toLocaleString()}
              </p>
              <p className="text-[11px] text-neutral-400">
                Valla Atípicos: ${Number(userProfiles.globalStats.amounts.upperFence).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-neutral-500">Usuarios Analizados</p>
              <p className="text-lg font-bold text-neutral-900">
                {userProfiles.globalStats.totalUsersAnalyzed}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-amber-900 font-medium">Usuarios Sospechosos / Alerta</p>
              <p className="text-lg font-bold text-amber-950">
                {userProfiles.globalStats.suspiciousUsersCount} sospechosos /{' '}
                {userProfiles.globalStats.observationUsersCount} en observación
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="p-2.5">Usuario / Rol</th>
                  <th className="p-2.5">Ops / Anulaciones</th>
                  <th className="p-2.5">Desc. Máx</th>
                  <th className="p-2.5">Cuartiles (Q1 / Q2 / Q3)</th>
                  <th className="p-2.5">IQR / Z-Score</th>
                  <th className="p-2.5">Score Anomalía</th>
                  <th className="p-2.5">Alertas Detectadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {userProfiles.profiles.map((p, idx) => (
                  <tr key={idx}>
                    <td className="p-2.5">
                      <p className="font-semibold text-neutral-900">{p.nombre}</p>
                      <p className="text-[11px] text-neutral-500">
                        {p.email} [{p.rol}]
                      </p>
                    </td>
                    <td className="p-2.5 font-mono">
                      {p.totalOperations} ops ({p.cancelledCount} anuladas — {p.cancellationRatePct}%)
                    </td>
                    <td className="p-2.5 font-mono">{p.maxDiscountPct}%</td>
                    <td className="p-2.5 font-mono text-[11px]">
                      ${p.quartiles.q1.toLocaleString()} / ${p.quartiles.q2.toLocaleString()} / $
                      {p.quartiles.q3.toLocaleString()}
                    </td>
                    <td className="p-2.5 font-mono text-[11px]">
                      IQR: ${p.quartiles.iqr.toLocaleString()} | Z: {p.maxAmountZScore}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          p.classification === 'SOSPECHOSO'
                            ? 'bg-red-100 text-red-800'
                            : p.classification === 'EN_OBSERVACION'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {p.anomalyScore}/100 ({p.classification})
                      </span>
                    </td>
                    <td className="p-2.5">
                      {p.alerts.length > 0 ? (
                        <ul className="list-disc pl-4 text-[11px] text-red-700">
                          {p.alerts.map((a, i) => (
                            <li key={i}>{a.message}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-neutral-400">Comportamiento normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECCIÓN 3: PREDICCIÓN DE DEMANDA Y MONTO ESPERADO + PATRONES OPERATIVOS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col gap-4">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">
              3. Predicción de Demanda y Monto Esperado (Simple Statistics + Keras)
            </h3>
            <p className="text-xs text-neutral-500">
              Combina Regresión Lineal Simple (<code className="font-mono">ss.linearRegression</code>) con la Red Neuronal de Regresión Keras.
            </p>
          </div>

          <form onSubmit={handlePredictDemand} className="grid grid-cols-2 gap-3 text-xs">
            <div className="col-span-2">
              <label className="block text-neutral-700 font-medium mb-1">
                Historial Diario de Demanda (unidades separadas por coma)
              </label>
              <input
                type="text"
                value={demandInput.dailySeriesText}
                onChange={(e) =>
                  setDemandInput({ ...demandInput, dailySeriesText: e.target.value })
                }
                className="w-full rounded border border-neutral-300 px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="block text-neutral-700 font-medium mb-1">Canal Objetivo</label>
              <select
                value={demandInput.canal}
                onChange={(e) => setDemandInput({ ...demandInput, canal: e.target.value })}
                className="w-full rounded border border-neutral-300 px-2.5 py-1.5"
              >
                <option value="presencial">Presencial</option>
                <option value="web">Web</option>
                <option value="app">App</option>
                <option value="domicilio">Domicilio</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-700 font-medium mb-1">Hora Pico (0-23)</label>
              <input
                type="number"
                min="0"
                max="23"
                value={demandInput.hour}
                onChange={(e) => setDemandInput({ ...demandInput, hour: e.target.value })}
                className="w-full rounded border border-neutral-300 px-2.5 py-1.5"
              />
            </div>
            <button
              type="submit"
              className="col-span-2 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white"
            >
              Calcular Predicción de Demanda y Monto Esperado
            </button>
          </form>

          {demandResult && (
            <div className="space-y-3 text-xs border-t border-neutral-100 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-neutral-200 p-3 bg-neutral-50">
                  <p className="text-neutral-500">Regresión Lineal (Simple Statistics)</p>
                  <p className="text-sm font-bold text-neutral-900 mt-0.5">
                    Tendencia: {demandResult.simpleStatisticsRegression.trend.toUpperCase()} (R² ={' '}
                    {demandResult.simpleStatisticsRegression.rSquared})
                  </p>
                  <p className="font-mono text-[11px] text-neutral-600">
                    m = {demandResult.simpleStatisticsRegression.slope} | b ={' '}
                    {demandResult.simpleStatisticsRegression.intercept}
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-emerald-800 font-medium">Regresión Neuronal (Keras)</p>
                  <p className="text-sm font-bold text-emerald-950 mt-0.5">
                    {demandResult.kerasNeuralRegression.predictedDemandUnits} uds → $
                    {Number(
                      demandResult.kerasNeuralRegression.predictedExpectedAmount
                    ).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    Ticket esperado: $
                    {Number(
                      demandResult.kerasNeuralRegression.expectedAverageTicket
                    ).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {demandResult.simpleStatisticsRegression.forecasts.map((f) => (
                  <div
                    key={f.daysAhead}
                    className="rounded border border-neutral-200 px-2.5 py-1.5 text-center"
                  >
                    <p className="text-[10px] text-neutral-500">Día +{f.daysAhead}</p>
                    <p className="font-bold text-neutral-900">{f.predictedDemand} uds</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Patrones operativos descubiertos */}
        {patterns && (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-900">
                4. Descubrimiento de Patrones (Horarios, Montos, Frecuencia y Canal)
              </h3>
              <p className="text-xs text-neutral-500">
                Análisis sobre el volumen consolidado de pedidos, facturas, pagos y transacciones.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg border border-neutral-200 p-3">
                <p className="text-neutral-500">Horario Pico</p>
                <p className="text-base font-bold text-neutral-900">
                  {patterns.peakHour.label}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {patterns.peakHour.operations} operaciones
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 p-3">
                <p className="text-neutral-500">Hora Más Anomalías</p>
                <p className="text-base font-bold text-red-700">
                  {patterns.highestAnomalyHour.label}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {patterns.highestAnomalyHour.anomalies} alertas
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 p-3">
                <p className="text-neutral-500">Canal Dominante</p>
                <p className="text-base font-bold text-neutral-900 uppercase">
                  {patterns.dominantChannel}
                </p>
              </div>
            </div>

            <div className="text-xs space-y-2">
              <p className="font-semibold text-neutral-800">Distribución por Canal:</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(patterns.byChannel).map(([ch, info]) => (
                  <div key={ch} className="rounded border border-neutral-200 p-2.5">
                    <p className="font-semibold capitalize">{ch}</p>
                    <p className="text-neutral-600">{info.count} ops</p>
                    <p className="font-mono text-[11px] text-neutral-500">
                      ${Number(info.amount).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs space-y-2">
              <p className="font-semibold text-neutral-800">Distribución por Método de Pago:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(patterns.byPaymentMethod).map(([method, info]) => (
                  <div key={method} className="rounded border border-neutral-200 px-3 py-1.5">
                    <span className="font-semibold">{method}:</span> {info.count} ops ($
                    {Number(info.amount).toLocaleString()})
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
