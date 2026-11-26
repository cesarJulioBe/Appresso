/**
 * @file AlgorithmBenchmark.jsx
 * @description Laboratorio de Algoritmos y Análisis Experimental de Complejidad Computacional (Big-O).
 *
 * - Vista de la interfaz que representa: Sección "Algoritmos y Benchmark", donde se comparan
 *   empíricamente algoritmos ingenuos vs optimizados (O(n) vs O(log n), O(n²) vs O(n log n),
 *   O(n²) vs O(n) con Hash Map) tanto sobre los datos reales de PostgreSQL como sobre lotes
 *   sintéticos escalables (`n = 100, 500, 1000, 2500`).
 * - Desde dónde se monta: Renderizado en `frontend/src/App.jsx` cuando `activeView === 'benchmarks'`.
 * - Funciones de `frontend/src/api.js` que consume y rutas HTTP que dispara:
 *   - `fetchAlgorithmBenchmarks({ entity, sortBy, searchId })`
 *     -> `GET /operational/benchmarks?entity=<entity>&sortBy=<sortBy>&searchId=<searchId>`
 *     Se dispara automáticamente al montar o cambiar los filtros (`useEffect` sobre `runAnalysis`)
 *     y manualmente al presionar el botón "Ejecutar Comparación".
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchAlgorithmBenchmarks } from '../api';

export default function AlgorithmBenchmark() {
  // Estado `entity`: entidad de la base de datos a evaluar (`orders`, `invoices`, `payments` o `transactions`).
  const [entity, setEntity] = useState('orders');

  // Estado `sortBy`: criterio de ordenamiento para enfrentar Bubble Sort O(n²) vs Merge Sort O(n log n) (`date` o `amount`).
  const [sortBy, setSortBy] = useState('date');

  // Estado `searchId`: ID objetivo opcional para comparar Búsqueda Lineal O(n) vs Búsqueda Binaria O(log n).
  const [searchId, setSearchId] = useState('');

  // Estado `data`: respuesta JSON del backend con `liveSystemMetrics` (datos reales) y `experimentalBenchmark` (escalabilidad).
  const [data, setData] = useState(null);

  // Estado `loading`: indica cuando el backend está midiendo tiempos y operaciones elementales.
  const [loading, setLoading] = useState(false);

  /**
   * Callback `runAnalysis`:
   * Invoca `GET /operational/benchmarks` enviando los parámetros actuales (`entity`, `sortBy`, `searchId`).
   * Al estar envuelto en `useCallback`, se actualiza cada vez que cambia uno de esos filtros.
   */
  const runAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAlgorithmBenchmarks({ entity, sortBy, searchId });
      setData(res);
    } catch (err) {
      console.error('Error ejecutando benchmark:', err);
    } finally {
      setLoading(false);
    }
  }, [entity, sortBy, searchId]);

  // Efecto reactivo: ejecuta automáticamente el benchmark al montar la vista y cuando cambian `entity`, `sortBy` o `searchId`.
  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  // Accesos abreviados a las dos secciones de la respuesta del servidor
  const live = data?.liveSystemMetrics;
  const exp = data?.experimentalBenchmark;

  return (
    <div className="flex flex-col gap-8">
      {/* Barra superior de control interactiva: selectores de entidad/criterio, input de ID y botón de ejecución */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">
            Laboratorio de Algoritmos y Análisis Experimental — O(n), O(n²), O(n log n) y O(log n)
          </h3>
          <p className="text-xs text-neutral-500">
            Compara operaciones elementales y tiempos reales en nanosegundos/milisegundos sobre datos de la BD y lotes escalables.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Selector del módulo/tabla real sobre el cual medir búsqueda y ordenamiento */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Módulo a Analizar
            </label>
            <select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs"
            >
              <option value="orders">Pedidos (orders)</option>
              <option value="invoices">Facturas (facturas)</option>
              <option value="payments">Pagos (pagos)</option>
              <option value="transactions">Transacciones (transacciones)</option>
            </select>
          </div>

          {/* Selector de campo llave para los algoritmos de ordenamiento */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Ordenar Por
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs"
            >
              <option value="date">Fecha (Timestamp)</option>
              <option value="amount">Monto / Total</option>
            </select>
          </div>

          {/* Campo opcional para elegir el ID puntual a localizar en la prueba O(n) vs O(log n) */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Buscar ID
            </label>
            <input
              type="text"
              placeholder="Último ID por defecto"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="w-36 rounded-md border border-neutral-300 px-3 py-1.5 text-xs"
            />
          </div>

          {/* Botón onClick -> vuelve a disparar `GET /operational/benchmarks` bajo demanda */}
          <button
            type="button"
            disabled={loading}
            onClick={runAnalysis}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            {loading ? 'Calculando...' : 'Ejecutar Comparación'}
          </button>
        </div>
      </div>

      {/* SECCIÓN 1: RESULTADOS EN VIVO SOBRE LOS REGISTROS REALES DE LA BASE DE DATOS */}
      {live && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* Tarjeta 1: Búsqueda Lineal O(n) vs Búsqueda Binaria O(log n) por ID */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-neutral-900">
                1. Búsqueda por ID (#{live.searchById.targetId})
              </h4>
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px]">
                O(n) vs O(log n)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs mt-3">
              <div className="rounded-lg border border-neutral-200 p-3">
                <p className="text-neutral-500">Lineal O(n)</p>
                <p className="text-lg font-bold text-neutral-900">
                  {live.searchById.linear.operationsCount} ops
                </p>
                <p className="text-[11px] text-neutral-400">
                  {live.searchById.linear.timeMs} ms
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-emerald-800 font-medium">Binaria O(log n)</p>
                <p className="text-lg font-bold text-emerald-900">
                  {live.searchById.binary.operationsCount} ops
                </p>
                <p className="text-[11px] text-emerald-700">
                  {live.searchById.binary.timeMs} ms
                </p>
              </div>
            </div>
          </div>

          {/* Tarjeta 2: Ordenamiento Bubble Sort O(n²) vs Merge Sort O(n log n) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-neutral-900">
                2. Ordenamiento ({sortBy === 'date' ? 'Por Fecha' : 'Por Monto'})
              </h4>
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px]">
                O(n²) vs O(n log n)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs mt-3">
              <div className="rounded-lg border border-neutral-200 p-3">
                <p className="text-neutral-500">Bubble Sort O(n²)</p>
                <p className="text-lg font-bold text-neutral-900">
                  {live.sortingComparison.bubbleSort.operationsCount} ops
                </p>
                <p className="text-[11px] text-neutral-400">
                  {live.sortingComparison.bubbleSort.timeMs} ms
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-emerald-800 font-medium">Merge Sort O(n log n)</p>
                <p className="text-lg font-bold text-emerald-900">
                  {live.sortingComparison.mergeSort.operationsCount} ops
                </p>
                <p className="text-[11px] text-emerald-700">
                  {live.sortingComparison.mergeSort.timeMs} ms
                </p>
              </div>
            </div>
          </div>

          {/* Tarjeta 3: Conteo de Pedidos por Cliente con Doble Bucle O(n²) vs Tabla Hash O(n) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-neutral-900">
                3. Conteo de Pedidos por Cliente
              </h4>
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px]">
                O(n²) vs O(n)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs mt-3">
              <div className="rounded-lg border border-neutral-200 p-3">
                <p className="text-neutral-500">Anidado O(n²)</p>
                <p className="text-lg font-bold text-neutral-900">
                  {live.customerOrderCounts.quadratic.operationsCount} ops
                </p>
                <p className="text-[11px] text-neutral-400">
                  {live.customerOrderCounts.quadratic.timeMs} ms
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-emerald-800 font-medium">Hash Map O(n)</p>
                <p className="text-lg font-bold text-emerald-900">
                  {live.customerOrderCounts.linearOptimized.operationsCount} ops
                </p>
                <p className="text-[11px] text-emerald-700">
                  {live.customerOrderCounts.linearOptimized.timeMs} ms
                </p>
              </div>
            </div>
          </div>

          {/* Tarjeta 4: Acumulación Lineal de Ventas en una sola pasada O(n) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-neutral-900">
                4. Suma de Ventas en 1 Pasada
              </h4>
              <span className="rounded bg-emerald-100 text-emerald-900 px-2 py-0.5 font-mono text-[10px]">
                O(n)
              </span>
            </div>
            <div className="text-xs space-y-2 mt-3">
              <div className="flex justify-between border-b border-neutral-100 pb-1.5">
                <span className="text-neutral-500">Total Ventas Facturadas:</span>
                <span className="font-bold text-neutral-900">
                  ${Number(live.salesAggregation.invoices.totalSales).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-b border-neutral-100 pb-1.5">
                <span className="text-neutral-500">Total Ventas en Pedidos:</span>
                <span className="font-bold text-neutral-900">
                  ${Number(live.salesAggregation.orders.totalSales).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Operaciones O(n):</span>
                <span className="font-mono">
                  {live.salesAggregation.orders.operationsCount} ops ({live.salesAggregation.orders.timeMs} ms)
                </span>
              </div>
            </div>
          </div>

          {/* Tarjeta 5: Deduplicación y Normalización de Cadenas por Pares O(n²) vs Clave Canónica O(n) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-neutral-900">
                5. Normalización de Strings
              </h4>
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px]">
                O(n²) vs O(n)
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Evaluados: {live.stringNormalization.totalStringsEvaluated} → Unificados: {live.stringNormalization.unifiedCount} ({live.stringNormalization.duplicatesRemoved} variantes fusionadas)
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs mt-3">
              <div className="rounded-lg border border-neutral-200 p-2.5">
                <p className="text-neutral-500">Pares O(n²)</p>
                <p className="font-bold text-sm">
                  {live.stringNormalization.quadratic.operationsCount} ops
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                <p className="text-emerald-800">Canónico O(n)</p>
                <p className="font-bold text-sm text-emerald-900">
                  {live.stringNormalization.linearOptimized.operationsCount} ops
                </p>
              </div>
            </div>
          </div>

          {/* Tarjeta 6: Ranking Top-K de Ítems Más Vendidos O(n + k log k) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-neutral-900">
                6. Ranking de Ítems Más Vendidos
              </h4>
              <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px]">
                O(n + k log k)
              </span>
            </div>
            <div className="space-y-1.5 text-xs mt-2 max-h-32 overflow-y-auto">
              {live.topSellingItems.ranking.slice(0, 5).map((it) => (
                <div key={it.rank} className="flex items-center justify-between">
                  <span className="font-medium text-neutral-800">
                    #{it.rank} {it.name}
                  </span>
                  <span className="font-mono text-neutral-600">
                    {it.totalQuantity} uds (${Number(it.totalRevenue).toLocaleString()})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECCIÓN 2: TABLA EXPERIMENTAL DE ESCALABILIDAD ASINTÓTICA (n = 100, 500, 1000, 2500) */}
      {exp && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">
              Análisis Experimental de Complejidad Computacional (Escalabilidad por Volumen n)
            </h3>
            <p className="text-xs text-neutral-500">
              Evidencia empírica del crecimiento asintótico de operaciones y tiempo al escalar de 100 a 2,500 registros.
            </p>
          </div>

          {/* Tabla comparativa de operaciones y milisegundos para cada volumen `n` */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="p-2.5">Tamaño (n)</th>
                  <th className="p-2.5">Búsqueda Lineal O(n)</th>
                  <th className="p-2.5">Búsqueda Binaria O(log n)</th>
                  <th className="p-2.5">Bubble Sort O(n²)</th>
                  <th className="p-2.5">Merge Sort O(n log n)</th>
                  <th className="p-2.5">Conteo Cliente O(n²)</th>
                  <th className="p-2.5">Conteo Cliente O(n)</th>
                  <th className="p-2.5">Ranking Top Ítems O(n log n)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {exp.experiments.map((row) => (
                  <tr key={row.n}>
                    <td className="p-2.5 font-mono font-bold">n = {row.n.toLocaleString()}</td>
                    <td className="p-2.5 font-mono">
                      {row.search.linear.ops.toLocaleString()} ops ({row.search.linear.timeMs}ms)
                    </td>
                    <td className="p-2.5 font-mono text-emerald-700 font-semibold">
                      {row.search.binary.ops} ops ({row.search.binary.timeMs}ms)
                    </td>
                    <td className="p-2.5 font-mono text-amber-800">
                      {row.sortingByDate.bubbleSort.ops.toLocaleString()} ops ({row.sortingByDate.bubbleSort.timeMs}ms)
                    </td>
                    <td className="p-2.5 font-mono text-emerald-700 font-semibold">
                      {row.sortingByDate.mergeSort.ops.toLocaleString()} ops ({row.sortingByDate.mergeSort.timeMs}ms) [{row.sortingByDate.opsReductionRatio}x menos ops]
                    </td>
                    <td className="p-2.5 font-mono text-amber-800">
                      {row.customerOrderCount.quadratic.ops.toLocaleString()} ops
                    </td>
                    <td className="p-2.5 font-mono text-emerald-700 font-semibold">
                      {row.customerOrderCount.linearHash.ops.toLocaleString()} ops [{row.customerOrderCount.opsReductionRatio}x menos]
                    </td>
                    <td className="p-2.5 font-mono">
                      {row.topItemsRanking.optimized.ops.toLocaleString()} ops ({row.topItemsRanking.optimized.timeMs}ms)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas resumen del impacto Antes vs Después para sustentar las decisiones algorítmicas */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {exp.optimizationSummary.map((opt, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-neutral-200 bg-neutral-50 p-3.5 text-xs"
              >
                <p className="font-semibold text-neutral-900">{opt.area}</p>
                <p className="text-neutral-500 mt-1">
                  <span className="font-medium text-red-700">Antes:</span> {opt.before}
                </p>
                <p className="text-neutral-500">
                  <span className="font-medium text-emerald-700">Después:</span> {opt.after}
                </p>
                <p className="text-neutral-800 font-medium mt-1">{opt.impact}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
