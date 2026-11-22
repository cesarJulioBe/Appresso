const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function createOrder(customer, products) {
  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer, products }),
  });
  if (!response.ok) throw new Error('Error al crear el pedido');
  return response.json();
}

export async function fetchOrders(page = 1, pageSize = 20) {
  const params = new URLSearchParams({ page, pageSize });
  const response = await fetch(`${API_BASE}/orders?${params}`);
  if (!response.ok) throw new Error('Error al obtener pedidos');
  return response.json();
}

export async function fetchStatistics() {
  const response = await fetch(`${API_BASE}/statistics`);
  if (!response.ok) throw new Error('Error al obtener estadísticas');
  return response.json();
}

export async function fetchLoyaltyProgression() {
  const response = await fetch(`${API_BASE}/loyalty/progression`);
  if (!response.ok) throw new Error('Error al obtener progresión');
  return response.json();
}

export async function predictSales(salesHistory) {
  const response = await fetch(`${API_BASE}/sales/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ salesHistory }),
  });
  if (!response.ok) throw new Error('Error al predecir ventas');
  return response.json();
}

export async function searchOrder(id) {
  const response = await fetch(`${API_BASE}/orders/search/${id}`);
  if (!response.ok) throw new Error('Error al buscar el pedido');
  return response.json();
}

export async function fetchPendingQueue() {
  const response = await fetch(`${API_BASE}/queue/pending`);
  if (!response.ok) throw new Error('Error al consultar la cola');
  return response.json();
}

export async function attendNext() {
  const response = await fetch(`${API_BASE}/queue/next`, { method: 'POST' });
  if (!response.ok) throw new Error('No hay pedidos pendientes');
  return response.json();
}

export async function undoLastAction() {
  const response = await fetch(`${API_BASE}/orders/undo`, { method: 'POST' });
  if (!response.ok) throw new Error('No hay acciones para deshacer');
  return response.json();
}

export async function fetchCities() {
  const response = await fetch(`${API_BASE}/delivery/cities`);
  if (!response.ok) throw new Error('Error al obtener ciudades');
  return response.json();
}

export async function fetchRoute(from, to, kmPerLiter, pricePerLiter) {
  const params = new URLSearchParams({ from, to, kmPerLiter, pricePerLiter });
  const response = await fetch(`${API_BASE}/delivery/route?${params}`);
  if (!response.ok) throw new Error('No existe ruta entre esas ciudades');
  return response.json();
}

export async function fetchRoutes() {
  const response = await fetch(`${API_BASE}/delivery/routes`);
  if (!response.ok) throw new Error('Error al listar rutas');
  return response.json();
}

export async function createRoute(origin, destination, distanceKm) {
  const response = await fetch(`${API_BASE}/delivery/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, distanceKm }),
  });
  if (!response.ok) throw new Error('Error al crear la ruta');
  return response.json();
}

export async function deleteRoute(id) {
  const response = await fetch(`${API_BASE}/delivery/routes/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Error al eliminar la ruta');
  return response.json();
}

export async function fetchFraudStats() {
  const response = await fetch(`${API_BASE}/fraud/stats`);
  if (!response.ok) throw new Error('Error al obtener estadísticas de fraude');
  return response.json();
}

export async function fetchFraudDashboard() {
  const response = await fetch(`${API_BASE}/fraud/dashboard`);
  if (!response.ok) throw new Error('Error al obtener el dashboard de fraude');
  return response.json();
}

export async function fetchAnomalies() {
  const response = await fetch(`${API_BASE}/fraud/anomalies`);
  if (!response.ok) throw new Error('Error al listar anomalías');
  return response.json();
}

export async function sendTestTransaction(user, value, paymentMethod) {
  const response = await fetch(`${API_BASE}/fraud/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, value, paymentMethod }),
  });
  if (!response.ok) throw new Error('Error al simular transacción');
  return response.json();
}

export async function fetchTransactions() {
  const response = await fetch(`${API_BASE}/fraud/transactions`);
  if (!response.ok) throw new Error('Error al listar transacciones');
  return response.json();
}

export async function fetchThresholds() {
  const response = await fetch(`${API_BASE}/fraud/thresholds`);
  if (!response.ok) throw new Error('Error al obtener umbrales');
  return response.json();
}

export async function updateThreshold(franja, umbralTransacciones, ventanaSegundos) {
  const response = await fetch(`${API_BASE}/fraud/thresholds/${encodeURIComponent(franja)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ umbralTransacciones, ventanaSegundos }),
  });
  if (!response.ok) throw new Error('Error al actualizar el umbral');
  return response.json();
}

// ============================================================================
// NUEVOS ENDPOINTS: MÓDULOS OPERATIVOS, CALIDAD, INTEGRIDAD, BENCHMARK E IA
// ============================================================================

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error en la petición al servidor');
  }
  return data;
}

export const fetchExecutiveSummary = () => apiRequest('/operational/summary');

// Usuarios
export const fetchOperationalUsers = () => apiRequest('/operational/users');
export const createOperationalUser = (payload) =>
  apiRequest('/operational/users', { method: 'POST', body: JSON.stringify(payload) });
export const deleteOperationalUser = (id) =>
  apiRequest(`/operational/users/${id}`, { method: 'DELETE' });

// Categorías
export const fetchCategories = () => apiRequest('/operational/categories');
export const createCategory = (payload) =>
  apiRequest('/operational/categories', { method: 'POST', body: JSON.stringify(payload) });
export const deleteCategory = (id) =>
  apiRequest(`/operational/categories/${id}`, { method: 'DELETE' });

// Ítems / Inventario
export const fetchCatalogItems = () => apiRequest('/operational/items');
export const createCatalogItem = (payload) =>
  apiRequest('/operational/items', { method: 'POST', body: JSON.stringify(payload) });
export const updateCatalogItem = (id, payload) =>
  apiRequest(`/operational/items/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteCatalogItem = (id) =>
  apiRequest(`/operational/items/${id}`, { method: 'DELETE' });

// Pedidos Multicanal
export const createMultichannelOrder = (payload) =>
  apiRequest('/operational/orders', { method: 'POST', body: JSON.stringify(payload) });
export const cancelOperationalOrder = (id) =>
  apiRequest(`/operational/orders/${id}/cancel`, { method: 'POST' });

// Facturas
export const fetchInvoices = () => apiRequest('/operational/invoices');
export const generateInvoice = (payload) =>
  apiRequest('/operational/invoices', { method: 'POST', body: JSON.stringify(payload) });
export const cancelInvoice = (id, reason) =>
  apiRequest(`/operational/invoices/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

// Pagos
export const fetchPayments = () => apiRequest('/operational/payments');
export const processPayment = (payload) =>
  apiRequest('/operational/payments', { method: 'POST', body: JSON.stringify(payload) });

// Calidad y Limpieza de Datos
export const fetchQualityReport = () => apiRequest('/operational/quality/report');
export const runDataAutoClean = () =>
  apiRequest('/operational/quality/clean', { method: 'POST' });
export const seedDirtyTestData = () =>
  apiRequest('/operational/quality/seed-dirty', { method: 'POST' });

// Integridad Criptográfica (Hash Encadenado)
export const verifyChainIntegrity = () => apiRequest('/operational/integrity/verify');
export const simulateChainTampering = (type = 'invoice_amount') =>
  apiRequest('/operational/integrity/tamper-demo', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
export const restoreChainIntegrity = () =>
  apiRequest('/operational/integrity/restore', { method: 'POST' });

// Algoritmos y Benchmark Experimental
export const fetchAlgorithmBenchmarks = ({ entity = 'orders', sortBy = 'date', searchId = '' } = {}) => {
  const params = new URLSearchParams({ entity, sortBy });
  if (searchId !== '' && searchId !== null) params.set('searchId', searchId);
  return apiRequest(`/operational/benchmarks?${params}`);
};

// Inteligencia Artificial No LLM (Keras/TensorFlow + Simple Statistics)
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
