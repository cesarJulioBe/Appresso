const API_BASE = 'http://localhost:3000';

export async function createOrder(customer, products) {
  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer, products }),
  });
  if (!response.ok) throw new Error('Error al crear el pedido');
  return response.json();
}

export async function fetchOrders() {
  const response = await fetch(`${API_BASE}/orders`);
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
  if (!response.ok) throw new Error('No exist ruta entre esas ciudades');
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