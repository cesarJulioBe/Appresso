/**
 * ============================================================================
 * ARCHIVO: frontend/src/api.js
 * CAPA: Cliente HTTP del Frontend React (Comunicación con el Backend Express)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA:
 *   Centralizar TODAS las peticiones `fetch` desde el navegador hacia el
 *   servidor Express (`http://localhost:3000`), agrupadas en los 5 bloques
 *   unificados del sistema:
 *     1. Módulos Operativos ERP (`/operational/*`): Usuarios, Categorías,
 *        Ítems/Stock, Pedidos Multicanal, Facturas y Pagos.
 *     2. Calidad y Limpieza de Datos (`/operational/quality/*`).
 *     3. Integridad Criptográfica Hash Chain (`/operational/integrity/*`).
 *     4. Algoritmos y Benchmark Experimental (`/operational/benchmarks`).
 *     5. Modelos de IA No LLM (`/ai/*`) y Monitoreo Transaccional (`/fraud/*`).
 * ============================================================================
 */

// Lee la URL base desde `.env` de Vite o usa `http://localhost:3000` en desarrollo local
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Función base reutilizable (`DRY`) para ejecutar peticiones HTTP JSON hacia Express.
 * - Agrega automáticamente la cabecera `Content-Type: application/json`.
 * - Convierte la respuesta a objeto JavaScript con `response.json()`.
 * - Si el servidor responde un error (400, 404, 409, 500), lanza un `Error` con el mensaje claro del backend.
 */
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  // Intentamos leer el cuerpo JSON; si viene vacío devolvemos un objeto vacío `{}`
  const data = await response.json().catch(() => ({}));
  // Si el código HTTP no está entre 200 y 299, lanzamos excepción para que el componente muestre alerta
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error en la petición al servidor');
  }
  return data;
}

// ============================================================================
// 1. MÓDULOS OPERATIVOS ERP (USUARIOS, CATEGORÍAS, ÍTEMS, PEDIDOS, FACTURAS, PAGOS)
// ============================================================================

// Resumen ejecutivo consolidado -> GET /operational/summary
export const fetchExecutiveSummary = () => apiRequest('/operational/summary');

// Usuarios con roles ('cliente' | 'empleado' | 'admin')
export const fetchOperationalUsers = () => apiRequest('/operational/users');
export const createOperationalUser = (payload) =>
  apiRequest('/operational/users', { method: 'POST', body: JSON.stringify(payload) });
export const deleteOperationalUser = (id) =>
  apiRequest(`/operational/users/${id}`, { method: 'DELETE' });

// Categorías con normalización y unificación automática
export const fetchCategories = () => apiRequest('/operational/categories');
export const createCategory = (payload) =>
  apiRequest('/operational/categories', { method: 'POST', body: JSON.stringify(payload) });
export const deleteCategory = (id) =>
  apiRequest(`/operational/categories/${id}`, { method: 'DELETE' });

// Ítems del catálogo e inventario (stock)
export const fetchCatalogItems = () => apiRequest('/operational/items');
export const createCatalogItem = (payload) =>
  apiRequest('/operational/items', { method: 'POST', body: JSON.stringify(payload) });
export const updateCatalogItem = (id, payload) =>
  apiRequest(`/operational/items/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteCatalogItem = (id) =>
  apiRequest(`/operational/items/${id}`, { method: 'DELETE' });

// Pedidos multicanal unificados (consultar paginado, crear descontando stock, cambiar estado y anular devolviendo stock)
export const fetchOperationalOrders = (page = 1, pageSize = 15) => {
  const params = new URLSearchParams({ page, pageSize });
  return apiRequest(`/operational/orders?${params}`);
};
export const createMultichannelOrder = (payload) =>
  apiRequest('/operational/orders', { method: 'POST', body: JSON.stringify(payload) });
export const updateOperationalOrderStatus = (id, status) =>
  apiRequest(`/operational/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
export const cancelOperationalOrder = (id) =>
  apiRequest(`/operational/orders/${id}/cancel`, { method: 'POST' });

// Facturación consecutiva con impuestos (IVA), descuentos y hash encadenado
export const fetchInvoices = () => apiRequest('/operational/invoices');
export const generateInvoice = (payload) =>
  apiRequest('/operational/invoices', { method: 'POST', body: JSON.stringify(payload) });
export const cancelInvoice = (id, reason) =>
  apiRequest(`/operational/invoices/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

// Pagos con comprobante verificable y hash encadenado
export const fetchPayments = () => apiRequest('/operational/payments');
export const processPayment = (payload) =>
  apiRequest('/operational/payments', { method: 'POST', body: JSON.stringify(payload) });

// ============================================================================
// 2. CALIDAD Y LIMPIEZA AUTOMÁTICA DE DATOS
// ============================================================================

export const fetchQualityReport = () => apiRequest('/operational/quality/report');
export const runDataAutoClean = () =>
  apiRequest('/operational/quality/clean', { method: 'POST' });
export const seedDirtyTestData = () =>
  apiRequest('/operational/quality/seed-dirty', { method: 'POST' });

// ============================================================================
// 3. INTEGRIDAD CRIPTOGRÁFICA (HASH ENCADENADO DE FACTURAS Y PAGOS)
// ============================================================================

export const verifyChainIntegrity = () => apiRequest('/operational/integrity/verify');
export const simulateChainTampering = (type = 'invoice_amount') =>
  apiRequest('/operational/integrity/tamper-demo', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
export const restoreChainIntegrity = () =>
  apiRequest('/operational/integrity/restore', { method: 'POST' });

// ============================================================================
// 4. ALGORITMOS O(n), O(n²), O(n log n), O(log n) Y BENCHMARK EXPERIMENTAL
// ============================================================================

export const fetchAlgorithmBenchmarks = ({
  entity = 'orders',
  sortBy = 'date',
  searchId = '',
} = {}) => {
  const params = new URLSearchParams({ entity, sortBy });
  if (searchId !== '' && searchId !== null) params.set('searchId', searchId);
  return apiRequest(`/operational/benchmarks?${params}`);
};

// ============================================================================
// 5. INTELIGENCIA ARTIFICIAL NO LLM (KERAS/TENSORFLOW + SIMPLE STATISTICS)
// ============================================================================

export const fetchAiStatus = () => apiRequest('/ai/status');
export const trainAiModels = (payload = { epochs: 35, augmentationFactor: 2 }) =>
  apiRequest('/ai/train', { method: 'POST', body: JSON.stringify(payload) });
export const classifySingleOperation = (payload) =>
  apiRequest('/ai/classify', { method: 'POST', body: JSON.stringify(payload) });
export const fetchRecentClassifiedOperations = (limit = 15) =>
  apiRequest(`/ai/classify-recent?limit=${limit}`);
export const predictDemandAndAmount = (payload) =>
  apiRequest('/ai/predict-demand', { method: 'POST', body: JSON.stringify(payload) });
export const fetchUserBehaviorProfiles = () => apiRequest('/ai/user-profiles');
export const fetchOperationalPatterns = () => apiRequest('/ai/patterns');

// ============================================================================
// 6. MONITOREO DE TRANSACCIONES HMAC-SHA256 Y VENTANA DESLIZANTE
// ============================================================================

export const fetchFraudStats = () => apiRequest('/fraud/stats');
export const fetchFraudDashboard = () => apiRequest('/fraud/dashboard');
export const fetchAnomalies = () => apiRequest('/fraud/anomalies');
export const fetchTransactions = () => apiRequest('/fraud/transactions');
export const fetchThresholds = () => apiRequest('/fraud/thresholds');
export const sendTestTransaction = (user, value, paymentMethod) =>
  apiRequest('/fraud/simulate', {
    method: 'POST',
    body: JSON.stringify({ user, value, paymentMethod }),
  });
export const updateThreshold = (franja, umbralTransacciones, ventanaSegundos) =>
  apiRequest(`/fraud/thresholds/${encodeURIComponent(franja)}`, {
    method: 'PUT',
    body: JSON.stringify({ umbralTransacciones, ventanaSegundos }),
  });

// ============================================================================
// 7. PLANIFICACIÓN DE RUTAS DE ENTREGA (GRAFO PONDERADO + ALGORITMO DE DIJKSTRA)
// ============================================================================

export const fetchCities = () => apiRequest('/delivery/cities');
export const fetchRoutes = () => apiRequest('/delivery/routes');
export const fetchRoute = (from, to, kmPerLiter, pricePerLiter) => {
  const params = new URLSearchParams({ from, to, kmPerLiter, pricePerLiter });
  return apiRequest(`/delivery/route?${params}`);
};
export const createRoute = (origin, destination, distanceKm) =>
  apiRequest('/delivery/routes', {
    method: 'POST',
    body: JSON.stringify({ origin, destination, distanceKm }),
  });
export const deleteRoute = (id) =>
  apiRequest(`/delivery/routes/${id}`, { method: 'DELETE' });
