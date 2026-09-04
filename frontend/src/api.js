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