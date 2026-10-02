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
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="flex flex-col gap-6">
        <div className="bg-white border border-neutral-200 rounded-lg p-5 md:p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold">Calcular ruta más corta</h3>
            <p className="text-sm text-neutral-500">Usa Dijkstra para encontrar el trayecto y estimar el costo de gasolina.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TextField value={from} onChange={setFrom}>
              <Label>Desde</Label>
              <Input placeholder="Medellín" className="w-full min-w-0" />
            </TextField>
            <TextField value={to} onChange={setTo}>
              <Label>Hasta</Label>
              <Input placeholder="Cali" className="w-full min-w-0" />
            </TextField>
          </div>

          <p className="text-xs text-neutral-400 my-3">
            Ciudades disponibles: {cities.join(', ') || 'ninguna todavía'}
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mb-4">
            <TextField value={kmPerLiter} onChange={setKmPerLiter}>
              <Label>Km por litro</Label>
              <Input type="number" className="w-full min-w-0" />
            </TextField>
            <TextField value={pricePerLiter} onChange={setPricePerLiter}>
              <Label>Precio por litro</Label>
              <Input type="number" className="w-full min-w-0" />
            </TextField>
          </div>

          <Button onPress={handleCalculate} isDisabled={loading}>
            {loading ? 'Calculando…' : 'Calcular ruta'}
          </Button>

          {error && <p className="text-sm text-red-700 bg-red-50 rounded p-3 mt-3">{error}</p>}

          {result && (
            <div className="mt-5 border border-neutral-200 rounded-md p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Ruta encontrada</p>
              <p className="font-medium mb-4 break-words">{result.path.join(' → ')}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="bg-neutral-50 rounded-md p-3">
                  <p className="text-xs text-neutral-500">Distancia</p>
                  <p className="text-lg font-semibold">{result.distanceKm} km</p>
                </div>
                <div className="bg-neutral-50 rounded-md p-3">
                  <p className="text-xs text-neutral-500">Combustible</p>
                  <p className="text-lg font-semibold">{result.gas.liters.toFixed(2)} L</p>
                </div>
                <div className="bg-neutral-50 rounded-md p-3">
                  <p className="text-xs text-neutral-500">Costo estimado</p>
                  <p className="text-lg font-semibold">${result.gas.cost.toLocaleString('es-CO')}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-lg p-5 md:p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Agregar nueva ruta</h3>
            <p className="text-sm text-neutral-500">Añade conexiones para mantener actualizado el mapa de entregas.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
            <TextField value={newOrigin} onChange={setNewOrigin}>
              <Label>Origen</Label>
              <Input placeholder="Medellín" className="w-full min-w-0" />
            </TextField>
            <TextField value={newDestination} onChange={setNewDestination}>
              <Label>Destino</Label>
              <Input placeholder="Bogotá" className="w-full min-w-0" />
            </TextField>
            <TextField value={newDistance} onChange={setNewDistance}>
              <Label>Distancia (km)</Label>
              <Input type="number" placeholder="415" className="w-full min-w-0" />
            </TextField>
          </div>
          <Button variant="secondary" onPress={handleCreateRoute} isDisabled={savingRoute}>
            {savingRoute ? 'Guardando…' : '+ Guardar ruta'}
          </Button>
        </div>
      </div>

      <aside className="bg-white border border-neutral-200 rounded-lg p-5 md:p-6 h-fit">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Rutas guardadas</h3>
          <p className="text-sm text-neutral-500">{routes.length} conexión(es) disponible(s)</p>
        </div>
        {routes.length > 0 ? (
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
            {routes.map((route) => (
              <div key={route.id} className="flex items-center justify-between gap-3 border border-neutral-100 rounded-md px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{route.origin} → {route.destination}</p>
                  <p className="text-xs text-neutral-500">{route.distance_km} km</p>
                </div>
                <button
                  onClick={() => handleDeleteRoute(route.id)}
                  className="text-red-500 hover:text-red-700 text-xs px-2 shrink-0"
                >
                  eliminar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500 border border-dashed border-neutral-200 rounded-md p-4">
            Todavía no hay rutas guardadas.
          </p>
        )}
      </aside>
    </div>
  );
}

export default RoutePlanner;