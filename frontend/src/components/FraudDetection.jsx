import { useEffect, useState } from 'react';
import { TextField, Label, Input, Button, Chip } from '@heroui/react';
import {
  fetchFraudStats, fetchAnomalies, sendTestTransaction,
  fetchTransactions, fetchThresholds, updateThreshold, fetchFraudDashboard,
} from '../api';

function FraudDetection() {
  const [stats, setStats] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [thresholds, setThresholds] = useState([]);
  const [editedThresholds, setEditedThresholds] = useState({});

  const [user, setUser] = useState('test@test.com');
  const [value, setValue] = useState('50000');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Tarjeta');

  async function loadData() {
    try {
      const [statsData, anomaliesData, transactionsData, thresholdsData, dashboardData] = await Promise.all([
        fetchFraudStats(),
        fetchAnomalies(),
        fetchTransactions(),
        fetchThresholds(),
        fetchFraudDashboard(),
      ]);
      setStats(statsData);
      setAnomalies(anomaliesData);
      setTransactions(transactionsData);
      setThresholds(thresholdsData);
      setDashboard(dashboardData);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSend() {
    if (!user || !value) return;
    setLoading(true);
    try {
      const result = await sendTestTransaction(user, parseFloat(value), paymentMethod);
      setLastResult(result);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getEditedValue(franja, field, original) {
    return editedThresholds[franja]?.[field] ?? original;
  }

  function updateEditedValue(franja, field, value) {
    setEditedThresholds(prev => ({
      ...prev,
      [franja]: { ...prev[franja], [field]: value },
    }));
  }

  async function handleSaveThreshold(row) {
    const umbral = parseInt(getEditedValue(row.franja, 'umbral_transacciones', row.umbral_transacciones));
    const ventana = parseInt(getEditedValue(row.franja, 'ventana_segundos', row.ventana_segundos));
    try {
      await updateThreshold(row.franja, umbral, ventana);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-1">Detección de fraude</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Ventana deslizante por usuario + validación de hash (HMAC-SHA256)
      </p>

      {dashboard && (
        <div className="mb-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {Object.values(dashboard.periods).map((period) => (
              <div key={period.label} className="border border-neutral-200 rounded-md p-3">
                <p className="text-xs text-neutral-500">{period.label}</p>
                <p className="text-xl font-semibold">{period.transacciones}</p>
                <p className="text-xs text-neutral-500">
                  {period.anomalias} anomalías · {period.porcentajeAnomalias}%
                </p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Usuarios afectados', dashboard.totals.usuariosAfectados],
              ['Valor sospechoso', `$${Number(dashboard.totals.valorSospechoso).toLocaleString('es-CO')}`],
              ['Promedio por usuario', dashboard.totals.promedioPorUsuario],
              ['Anomalías nuevas', dashboard.totals.anomaliasNuevas],
            ].map(([label, value]) => (
              <div key={label} className="bg-neutral-50 rounded-md p-3">
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium mb-2">Estado de anomalías</p>
              {Object.entries(dashboard.statuses).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm border-b border-neutral-100 py-1">
                  <span className="capitalize">{status}</span><span>{count}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Métodos de pago</p>
              {Object.entries(dashboard.paymentMethods).map(([method, count]) => (
                <div key={method} className="flex justify-between text-sm border-b border-neutral-100 py-1">
                  <span>{method}</span><span>{count}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Anomalías por nivel</p>
              {Object.entries(dashboard.levels).map(([level, count]) => (
                <div key={level} className="flex justify-between text-sm border-b border-neutral-100 py-1">
                  <span>{level}</span><span>{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Actividad por hora</p>
            <div className="flex items-end gap-1 h-20 border-b border-neutral-200">
              {dashboard.hourlyAnomalies.map((item) => {
                const max = Math.max(...dashboard.hourlyAnomalies.map(hour => hour.cantidad), 1);
                return (
                  <div key={item.hora} className="flex-1 h-full flex flex-col justify-end" title={`${item.hora}: ${item.cantidad}`}>
                    <div className="bg-red-400 rounded-t min-h-0.5" style={{ height: `${(item.cantidad / max) * 100}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-neutral-400 mt-1"><span>00:00</span><span>12:00</span><span>23:00</span></div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Línea de tiempo de anomalías</p>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {dashboard.timeline.length === 0 && <p className="text-sm text-neutral-500">Sin eventos</p>}
              {dashboard.timeline.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm border border-neutral-100 rounded px-2 py-1">
                  <span className="truncate">{item.email} · {item.tipo}</span>
                  <span className="text-xs text-neutral-400 shrink-0">{new Date(item.fecha_txn).toLocaleTimeString('es-CO')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="border border-neutral-200 rounded-md p-3">
            <p className="text-xs text-neutral-500">Transacciones</p>
            <p className="text-2xl font-semibold">{stats.totalTransacciones}</p>
          </div>
          <div className="border border-neutral-200 rounded-md p-3">
            <p className="text-xs text-neutral-500">Anomalías</p>
            <p className="text-2xl font-semibold text-red-600">{stats.totalAnomalias}</p>
          </div>
          <div className="border border-neutral-200 rounded-md p-3">
            <p className="text-xs text-neutral-500">% Anomalías</p>
            <p className="text-2xl font-semibold">{stats.porcentajeAnomalias}%</p>
          </div>
        </div>
      )}

      {/* Simular transacción */}
      <div className="border border-neutral-200 rounded-md p-3 mb-4">
        <p className="text-sm font-medium mb-2">Simular transacción (envía 3 veces seguidas para forzar anomalía)</p>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <TextField value={user} onChange={setUser}>
            <Label>Usuario</Label>
            <Input className="w-full min-w-0" />
          </TextField>
          <TextField value={value} onChange={setValue}>
            <Label>Valor</Label>
            <Input type="number" className="w-full min-w-0" />
          </TextField>
          <label className="flex flex-col gap-1 text-sm">
            <span>Método de pago</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              className="border border-neutral-300 rounded-md px-2 py-2 bg-white"
            >
              <option>Tarjeta</option>
              <option>Efectivo</option>
              <option>Transferencia</option>
            </select>
          </label>
        </div>
        <Button onPress={handleSend} isDisabled={loading}>
          {loading ? 'Enviando…' : 'Enviar transacción'}
        </Button>

        {lastResult && (
          <div className="mt-3 text-sm">
            <Chip color={lastResult.analysis.isAnomaly ? 'danger' : 'success'} variant="soft">
              {lastResult.analysis.tipo}
            </Chip>
            <span className="ml-2 text-neutral-500">
              {lastResult.analysis.transactionCount} transacción(es) en {lastResult.analysis.ventanaSegundos}s — franja: {lastResult.analysis.franja}
            </span>
          </div>
        )}
      </div>

      {/* Configuración de umbrales por franja horaria */}
      <div className="border border-neutral-200 rounded-md p-3 mb-4">
        <p className="text-sm font-medium mb-2">Configuración de umbrales por franja horaria</p>
        <div className="flex flex-col gap-2">
          {thresholds.map((row) => (
            <div key={row.franja} className="grid grid-cols-4 gap-2 items-end border border-neutral-100 rounded p-2">
              <div className="text-sm font-medium capitalize">{row.franja}</div>
              <TextField
                value={String(getEditedValue(row.franja, 'umbral_transacciones', row.umbral_transacciones))}
                onChange={(v) => updateEditedValue(row.franja, 'umbral_transacciones', v)}
              >
                <Label>Umbral</Label>
                <Input type="number" className="w-full min-w-0" />
              </TextField>
              <TextField
                value={String(getEditedValue(row.franja, 'ventana_segundos', row.ventana_segundos))}
                onChange={(v) => updateEditedValue(row.franja, 'ventana_segundos', v)}
              >
                <Label>Ventana (seg)</Label>
                <Input type="number" className="w-full min-w-0" />
              </TextField>
              <Button variant="secondary" onPress={() => handleSaveThreshold(row)}>
                Guardar
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Historial completo de transacciones */}
      <p className="text-sm font-medium mb-2">Historial de transacciones</p>
      <div className="flex flex-col gap-1 max-h-56 overflow-y-auto mb-4">
        {transactions.length === 0 && <p className="text-sm text-neutral-500">Sin transacciones todavía</p>}
        {[...transactions].reverse().map((t) => (
          <div key={t.id} className="flex items-center justify-between text-sm border border-neutral-100 rounded px-2 py-1 min-w-0">
            <span className="truncate">{t.email} — ${Number(t.valor).toLocaleString('es-CO')}</span>
            <Chip color={t.es_anomalia ? 'danger' : 'success'} variant="soft" className="shrink-0">
              {t.es_anomalia ? 'Anómala' : 'Exitosa'}
            </Chip>
          </div>
        ))}
      </div>

      {/* Solo anomalías */}
      <p className="text-sm font-medium mb-2">Anomalías recientes</p>
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {anomalies.length === 0 && <p className="text-sm text-neutral-500">Sin anomalías registradas</p>}
        {anomalies.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-sm border border-neutral-100 rounded px-2 py-1 min-w-0">
            <span className="truncate">{a.email} — ${Number(a.valor).toLocaleString('es-CO')}</span>
            <span className="text-xs text-neutral-400 shrink-0">{a.cantidad_transacciones} en {a.ventana_segundos}s</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FraudDetection;