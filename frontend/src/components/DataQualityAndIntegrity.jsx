import { useState, useEffect, useCallback } from 'react';
import {
  fetchQualityReport,
  runDataAutoClean,
  seedDirtyTestData,
  verifyChainIntegrity,
  simulateChainTampering,
  restoreChainIntegrity,
} from '../api';

export default function DataQualityAndIntegrity({ onDataChanged }) {
  const [quality, setQuality] = useState(null);
  const [cleanResult, setCleanResult] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [qRes, iRes] = await Promise.all([
        fetchQualityReport(),
        verifyChainIntegrity(),
      ]);
      setQuality(qRes);
      setIntegrity(iRes);
    } catch (err) {
      console.error('Error cargando calidad e integridad:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSeedDirty = async () => {
    setLoading(true);
    try {
      const res = await seedDirtyTestData();
      setQuality(res.report);
      setCleanResult(null);
      if (onDataChanged) onDataChanged();
    } finally {
      setLoading(false);
    }
  };

  const handleRunClean = async () => {
    setLoading(true);
    try {
      const res = await runDataAutoClean();
      setCleanResult(res);
      setQuality(res.report);
      if (onDataChanged) onDataChanged();
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateTamper = async (type) => {
    setLoading(true);
    try {
      const res = await simulateChainTampering(type);
      setIntegrity(res);
      if (onDataChanged) onDataChanged();
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreIntegrity = async () => {
    setLoading(true);
    try {
      const res = await restoreChainIntegrity();
      setIntegrity(res);
      if (onDataChanged) onDataChanged();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* SECCIÓN 1: LIMPIEZA Y CALIDAD DE DATOS */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              1. Limpieza, Normalización y Reporte de Calidad de Datos
            </h3>
            <p className="text-xs text-neutral-500">
              Detecta y corrige ítems duplicados, precios mal escritos, categorías inconsistentes y clientes registrados dos veces.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={handleSeedDirty}
              className="rounded-lg border border-amber-400 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Inyectar Datos Sucios de Prueba
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleRunClean}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              Ejecutar Limpieza y Normalización Automática
            </button>
          </div>
        </div>

        {quality && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
            <div className="rounded-lg border border-neutral-200 p-3.5 bg-neutral-50">
              <p className="text-xs text-neutral-500">Puntaje Calidad</p>
              <p
                className={`text-2xl font-bold ${
                  quality.qualityScore >= 95
                    ? 'text-emerald-700'
                    : quality.qualityScore >= 80
                      ? 'text-amber-700'
                      : 'text-red-700'
                }`}
              >
                {quality.qualityScore}%
              </p>
              <p className="text-[11px] text-neutral-500">{quality.status}</p>
            </div>

            <div className="rounded-lg border border-neutral-200 p-3.5">
              <p className="text-xs text-neutral-500">Ítems Duplicados</p>
              <p className="text-xl font-bold text-neutral-900">
                {quality.breakdown.duplicateItems.count}
              </p>
              <p className="text-[11px] text-neutral-400">Por clave canónica / SKU</p>
            </div>

            <div className="rounded-lg border border-neutral-200 p-3.5">
              <p className="text-xs text-neutral-500">Precios Mal Escritos</p>
              <p className="text-xl font-bold text-neutral-900">
                {quality.breakdown.malformedPrices.count}
              </p>
              <p className="text-[11px] text-neutral-400">Fuera de rango o nulos</p>
            </div>

            <div className="rounded-lg border border-neutral-200 p-3.5">
              <p className="text-xs text-neutral-500">Categorías Inconsistentes</p>
              <p className="text-xl font-bold text-neutral-900">
                {quality.breakdown.inconsistentCategories.count}
              </p>
              <p className="text-[11px] text-neutral-400">Variantes / sinónimos</p>
            </div>

            <div className="rounded-lg border border-neutral-200 p-3.5">
              <p className="text-xs text-neutral-500">Clientes Duplicados</p>
              <p className="text-xl font-bold text-neutral-900">
                {quality.breakdown.duplicateUsers.count}
              </p>
              <p className="text-[11px] text-neutral-400">Doble registro detectado</p>
            </div>

            <div className="rounded-lg border border-neutral-200 p-3.5">
              <p className="text-xs text-neutral-500">Strings sin Normalizar</p>
              <p className="text-xl font-bold text-neutral-900">
                {quality.breakdown.unformattedStrings.itemsCount +
                  quality.breakdown.unformattedStrings.usersCount}
              </p>
              <p className="text-[11px] text-neutral-400">Espacios / mayúsculas</p>
            </div>
          </div>
        )}

        {cleanResult && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950">
            <p className="font-semibold text-sm mb-1">
              Limpieza completada: {cleanResult.recordsCorrected} registros corregidos y unificados (Puntaje: {cleanResult.previousScore}% → {cleanResult.newScore}%)
            </p>
            {cleanResult.actionsLog?.length > 0 ? (
              <ul className="list-disc pl-5 space-y-0.5 max-h-40 overflow-y-auto">
                {cleanResult.actionsLog.map((log, i) => (
                  <li key={i}>{log}</li>
                ))}
              </ul>
            ) : (
              <p>Todos los registros ya se encontraban normalizados y sin duplicados.</p>
            )}
          </div>
        )}
      </div>

      {/* SECCIÓN 2: INTEGRIDAD CRIPTOGRÁFICA (HASH ENCADENADO DE FACTURAS Y PAGOS) */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              2. Integridad Criptográfica: Hash Encadenado (Facturas, Pagos y Comprobantes)
            </h3>
            <p className="text-xs text-neutral-500">
              Cada factura y pago firma su payload canónico junto con el <code className="font-mono">prev_hash</code> anterior mediante HMAC-SHA256.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSimulateTamper('invoice_amount')}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
            >
              Simular Factura Alterada
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSimulateTamper('fake_receipt')}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
            >
              Simular Comprobante Falso
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleRestoreIntegrity}
              className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Restaurar y Recalcular Cadena
            </button>
          </div>
        </div>

        {integrity && (
          <>
            <div
              className={`rounded-lg border p-4 flex items-center justify-between ${
                integrity.isSystemIntegrityValid
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-red-300 bg-red-50 text-red-900'
              }`}
            >
              <div>
                <p className="font-bold text-sm">
                  {integrity.isSystemIntegrityValid
                    ? 'CADENA CRIPTOGRÁFICA 100% ÍNTEGRA Y VERIFICADA'
                    : 'ALERTA DE SEGURIDAD: SE DETECTÓ ALTERACIÓN EN LA CADENA DE HASHES O COMPROBANTES'}
                </p>
                <p className="text-xs mt-0.5">
                  Facturas íntegras: {integrity.invoices.intactCount}/{integrity.invoices.totalRecords} | Pagos y comprobantes íntegros: {integrity.payments.intactCount}/{integrity.payments.totalRecords}
                </p>
              </div>
              <span className="font-mono text-xs px-2.5 py-1 rounded bg-white/80 border">
                HMAC-SHA256
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Cadena de Facturas */}
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 mb-2">
                  Cadena de Facturas ({integrity.invoices.totalRecords} eslabones)
                </h4>
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {integrity.invoices.links.map((link) => (
                    <div
                      key={link.id}
                      className={`rounded-lg border p-3 text-xs ${
                        link.isIntact
                          ? 'border-neutral-200 bg-neutral-50'
                          : 'border-red-400 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>
                          Eslabón #{link.index} — {link.numeroConsecutivo} ($
                          {Number(link.total).toLocaleString()})
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            link.isIntact
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-200 text-red-900'
                          }`}
                        >
                          {link.isIntact ? 'HASH VÁLIDO' : 'ALTERADA'}
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono text-[10px] text-neutral-600 space-y-0.5">
                        <p>prev_hash : {link.prevHash.slice(0, 32)}...</p>
                        <p>hash_actual: {link.storedHash.slice(0, 32)}...</p>
                        {!link.payloadHashValid && (
                          <p className="text-red-700 font-semibold">
                            esperado   : {link.recomputedHash.slice(0, 32)}...
                          </p>
                        )}
                      </div>
                      {link.warnings?.length > 0 && (
                        <ul className="mt-1.5 list-disc pl-4 text-[11px] text-red-700 font-medium">
                          {link.warnings.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cadena de Pagos y Comprobantes */}
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 mb-2">
                  Cadena de Pagos y Comprobantes ({integrity.payments.totalRecords} eslabones)
                </h4>
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {integrity.payments.links.map((link) => (
                    <div
                      key={link.id}
                      className={`rounded-lg border p-3 text-xs ${
                        link.isIntact
                          ? 'border-neutral-200 bg-neutral-50'
                          : 'border-red-400 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>
                          Pago #{link.index} — Comprobante {link.referenciaComprobante} ($
                          {Number(link.monto).toLocaleString()})
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            link.isIntact
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-200 text-red-900'
                          }`}
                        >
                          {link.isIntact ? 'COMPROBANTE VÁLIDO' : 'FRAUDE / FALSO'}
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono text-[10px] text-neutral-600 space-y-0.5">
                        <p>prev_hash : {link.prevHash.slice(0, 32)}...</p>
                        <p>hash_actual: {link.storedHash.slice(0, 32)}...</p>
                      </div>
                      {link.warnings?.length > 0 && (
                        <ul className="mt-1.5 list-disc pl-4 text-[11px] text-red-700 font-medium">
                          {link.warnings.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
