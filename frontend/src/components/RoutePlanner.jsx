import { useEffect, useState } from 'react';
import { TextField, Label, Input, Button } from '@heroui/react';
import { fetchCities, fetchRoute, fetchRoutes, createRoute, deleteRoute } from '../api';

function RoutePlanner() {
  // Sección: calcular ruta
  const [cities, setCities] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kmPerLiter, setKmPerLiter] = useState('15');
  const [pricePerLiter, setPricePerLiter] = useState('10500');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Sección: administrar rutas guardadas
  const [routes, setRoutes] = useState([]);
  const [newOrigin, setNewOrigin] = useState('');
  const [newDestination, setNewDestination] = useState('');
  const [newDistance, setNewDistance] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);

  async function loadCitiesAndRoutes() {
    try {
      const [citiesData, routesData] = await Promise.all([fetchCities(), fetchRoutes()]);
      setCities(citiesData);
      setRoutes(routesData);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadCitiesAndRoutes();
  }, []);

  async function handleCalculate() {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoute(from, to, kmPerLiter, pricePerLiter);
      setResult(data);
    } catch (err) {
      setError('No existe ruta entre esas ciudades');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRoute() {
    if (!newOrigin || !newDestination || !newDistance) return;
    setSavingRoute(true);
    try {
      await createRoute(newOrigin, newDestination, newDistance);
      setNewOrigin('');
      setNewDestination('');
      setNewDistance('');
      await loadCitiesAndRoutes();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRoute(false);
    }
  }

  async function handleDeleteRoute(id) {
    try {
      await deleteRoute(id);
      await loadCitiesAndRoutes();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-1">Planificador de rutas</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Ruta más corta (Dijkstra) y costo estimado de gasolina
      </p>

      {/* Crear nueva ruta */}
      <div className="border border-neutral-200 rounded-md p-3 mb-4">
        <p className="text-sm font-medium mb-2">Agregar nueva ruta</p>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <TextField value={newOrigin} onChange={setNewOrigin}>
            <Label>Origen</Label>
            <Input placeholder="Medellín" className="w-full min-w-0" />
          </TextField>
          <TextField value={newDestination} onChange={setNewDestination}>
            <Label>Destino</Label>
            <Input placeholder="Bogotá" className="w-full min-w-0" />
          </TextField>
          <TextField value={newDistance} onChange={setNewDistance}>
            <Label>Km</Label>
            <Input type="number" placeholder="415" className="w-full min-w-0" />
          </TextField>
        </div>
        <Button variant="secondary" onPress={handleCreateRoute} isDisabled={savingRoute}>
          {savingRoute ? 'Guardando…' : '+ Guardar ruta'}
        </Button>
      </div>

      {/* Rutas existentes */}
      {routes.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Rutas guardadas</p>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {routes.map((route) => (
              <div key={route.id} className="flex items-center justify-between text-sm border border-neutral-100 rounded px-2 py-1">
                <span>{route.origin} → {route.destination} ({route.distance_km} km)</span>
                <button
                  onClick={() => handleDeleteRoute(route.id)}
                  className="text-red-500 hover:text-red-700 text-xs px-2"
                >
                  eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calcular ruta más corta */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <TextField value={from} onChange={setFrom}>
          <Label>Desde</Label>
          <Input placeholder="Medellín" className="w-full min-w-0" />
        </TextField>
        <TextField value={to} onChange={setTo}>
          <Label>Hasta</Label>
          <Input placeholder="Cali" className="w-full min-w-0" />
        </TextField>
      </div>

      <p className="text-xs text-neutral-400 mb-3">
        Ciudades disponibles: {cities.join(', ') || 'ninguna todavía'}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <TextField value={kmPerLiter} onChange={setKmPerLiter}>
          <Label>Km por litro</Label>
          <Input type="number" className="w-full min-w-0" />
        </TextField>
        <TextField value={pricePerLiter} onChange={setPricePerLiter}>
          <Label>Precio/litro</Label>
          <Input type="number" className="w-full min-w-0" />
        </TextField>
      </div>

      <Button onPress={handleCalculate} isDisabled={loading}>
        {loading ? 'Calculando…' : 'Calcular ruta'}
      </Button>

      {error && <p className="text-sm text-red-700 bg-red-50 rounded p-2 mt-3">{error}</p>}

      {result && (
        <div className="mt-4 border border-neutral-200 rounded-md p-4">
          <p className="text-sm text-neutral-500 mb-1">Ruta</p>
          <p className="font-medium mb-3">{result.path.join(' → ')}</p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-neutral-500">Distancia</p>
              <p className="text-lg font-semibold">{result.distanceKm} km</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Litros</p>
              <p className="text-lg font-semibold">{result.gas.liters.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Costo</p>
              <p className="text-lg font-semibold">${result.gas.cost.toLocaleString('es-CO')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoutePlanner;