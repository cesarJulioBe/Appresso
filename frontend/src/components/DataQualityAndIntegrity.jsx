/**
 * @file DataQualityAndIntegrity.jsx
 * @description Vista de Auditoría de Calidad de Datos e Integridad Criptográfica (Hash Chain).
 *
 * - Vista de la interfaz que representa: Sección "Calidad e Integridad" dividida en dos paneles:
 *   1) Diagnóstico y limpieza/normalización automática de registros sucios o duplicados.
 *   2) Verificación criptográfica HMAC-SHA256 de la cadena de bloques/hashes de facturas y pagos,
 *      con simuladores interactivos de ataques de alteración y restauración de la cadena.
 * - Desde dónde se monta: Renderizado en `frontend/src/App.jsx` cuando `activeView === 'quality_integrity'`,
 *   recibiendo la prop `onDataChanged={refresh}` para sincronizar el resto de la aplicación tras cambios.
 * - Funciones de `frontend/src/api.js` que consume y rutas HTTP que dispara:
 *   1. `fetchQualityReport()`          -> `GET /operational/quality/report` (al montar el componente)
 *   2. `verifyChainIntegrity()`        -> `GET /operational/integrity/verify` (al montar el componente)
 *   3. `seedDirtyTestData()`           -> `POST /operational/quality/seed-dirty` (botón "Inyectar Datos Sucios de Prueba")
 *   4. `runDataAutoClean()`            -> `POST /operational/quality/clean` (botón "Ejecutar Limpieza y Normalización Automática")
 *   5. `simulateChainTampering(type)`  -> `POST /operational/integrity/tamper-demo` (botones "Simular Factura Alterada" y "Simular Comprobante Falso")
 *   6. `restoreChainIntegrity()`       -> `POST /operational/integrity/restore` (botón "Restaurar y Recalcular Cadena")
 */

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
  // Estado `quality`: almacena el reporte de calidad actual (puntaje 0-100% y desglose de anomalías de datos).
  const [quality, setQuality] = useState(null);

  // Estado `cleanResult`: guarda el resumen y bitácora (`actionsLog`) tras ejecutar la limpieza automática.
  const [cleanResult, setCleanResult] = useState(null);

  // Estado `integrity`: contiene el dictamen criptográfico de todos los eslabones de facturas y pagos.
  const [integrity, setIntegrity] = useState(null);

  // Estado `loading`: bloquea los botones de acción mientras hay una petición HTTP en curso para evitar doble clic.
  const [loading, setLoading] = useState(false);

  /**
   * Callback `loadData`:
   * Consulta en paralelo (`Promise.all`) el reporte de calidad (`GET /operational/quality/report`)
   * y la verificación completa de hashes encadenados (`GET /operational/integrity/verify`).
   */
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

  // Efecto inicial: dispara `loadData()` automáticamente una vez cuando el usuario abre esta sección.
  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * Manejador `handleSeedDirty` (evento `onClick`):
   * Dispara `POST /operational/quality/seed-dirty` para insertar registros con errores intencionales
   * (espacios extra, mayúsculas mezcladas, duplicados, precios mal formateados) y demostrar la caída del puntaje.
   */
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

  /**
   * Manejador `handleRunClean` (evento `onClick`):
   * Dispara `POST /operational/quality/clean` para normalizar textos/precios, fusionar duplicados,
   * actualizar el reporte `quality`, mostrar el log de acciones en `cleanResult` y refrescar `App.jsx`.
   */
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

  /**
   * Manejador `handleSimulateTamper` (evento `onClick`):
   * Dispara `POST /operational/integrity/tamper-demo` con `type` (`'invoice_amount'` o `'fake_receipt'`)
   * para adulterar un registro en la BD sin recalcular su firma HMAC y evidenciar la ruptura de la cadena.
   */
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

  /**
   * Manejador `handleRestoreIntegrity` (evento `onClick`):
   * Dispara `POST /operational/integrity/restore` para sanear los datos adulterados y recalcular
   * secuencialmente los eslabones `prev_hash` -> `hash_actual` de toda la cadena criptográfica.
   */
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
      {/* SECCIÓN 1: LIMPIEZA, NORMALIZACIÓN Y REPORTE DE CALIDAD DE DATOS */}
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
          {/* Botones de demostración: inyectar datos contaminados o ejecutar el pipeline automático de limpieza */}
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

        {/* Tarjetas KPI con el puntaje global de calidad y el conteo detallado por categoría de inconsistencia */}
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

        {/* Resumen verde con la bitácora detallada de correcciones tras ejecutar `handleRunClean` */}
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

          {/* Botones para simular ataques a la base de datos (factura o comprobante) y restaurar la cadena */}
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

        {/* Estado general de la auditoría HMAC-SHA256 y explorador visual de eslabones */}
        {integrity && (
          <>
            {/* Banner semáforo: verde si todos los hashes cuadran, rojo si se detectó manipulación */}
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
              {/* Columna izquierda: Eslabones de la Cadena de Facturas (`prev_hash` -> `hash_actual`) */}
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

              {/* Columna derecha: Eslabones de la Cadena de Pagos y Comprobantes */}
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
