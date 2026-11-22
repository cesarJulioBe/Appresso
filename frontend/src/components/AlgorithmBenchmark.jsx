import { useState, useEffect, useCallback } from 'react';
import { fetchAlgorithmBenchmarks } from '../api';

export default function AlgorithmBenchmark() {
  const [entity, setEntity] = useState('orders');
  const [sortBy, setSortBy] = useState('date');
  const [searchId, setSearchId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const live = data?.liveSystemMetrics;
  const exp = data?.experimentalBenchmark;

  return (
    <div className="flex flex-col gap-8">
      {/* Barra de control interactiva */}
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

      {/* SECCIÓN 1: RESULTADOS SOBRE DATOS REALES DEL SISTEMA */}
      {live && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* 1. Búsqueda por ID */}
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

          {/* 2. Ordenamiento por Fecha o Monto */}
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

          {/* 3. Conteo de Pedidos por Cliente */}
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

          {/* 4. Suma de Ventas O(n) */}
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

          {/* 5. Normalización y Unificación de Strings */}
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

          {/* 6. Ranking de Ítems Más Vendidos */}
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

      {/* SECCIÓN 2: TABLA EXPERIMENTAL DE ESCALABILIDAD (n = 100, 500, 1000, 2500) */}
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

          {/* Documentación de optimizaciones logradas */}
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
