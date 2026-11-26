/**
 * ============================================================================
 * ARCHIVO: frontend/src/components/RoutePlanner.jsx
 * CAPA: Componente Visual React — Planificador de Rutas (Grafo + Dijkstra)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA:
 *   Permitir al operador administrar las conexiones terrestres entre ciudades
 *   (`POST /delivery/routes`, `DELETE /delivery/routes/:id`) y calcular el
 *   trayecto más corto y económico de entrega usando el Algoritmo de Dijkstra
 *   junto con la estimación de litros y costo de gasolina (`GET /delivery/route`).
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { TextField, Label, Input, Button } from '@heroui/react';
import { fetchCities, fetchRoute, fetchRoutes, createRoute, deleteRoute } from '../api';

function RoutePlanner() {
  // === Estados de la calculadora de ruta óptima (Dijkstra) ===
  const [cities, setCities] = useState([]);                 // Lista de ciudades registradas en el grafo
  const [from, setFrom] = useState('');                     // Ciudad de origen escrita por el usuario
  const [to, setTo] = useState('');                         // Ciudad de destino escrita por el usuario
  const [kmPerLiter, setKmPerLiter] = useState('15');       // Rendimiento del vehículo (km por litro)
  const [pricePerLiter, setPricePerLiter] = useState('10500'); // Precio de gasolina por litro en COP
  const [result, setResult] = useState(null);               // Respuesta `{ path, distanceKm, gas }`
  const [error, setError] = useState(null);                 // Mensaje de error si no hay camino entre ciudades
  const [loading, setLoading] = useState(false);            // Indicador de carga mientras responde el backend

  // === Estados para crear y listar tramos guardados ===
  const [routes, setRoutes] = useState([]);                 // Tramos existentes en la tabla `routes`
  const [newOrigin, setNewOrigin] = useState('');           // Origen del nuevo tramo
  const [newDestination, setNewDestination] = useState(''); // Destino del nuevo tramo
  const [newDistance, setNewDistance] = useState('');       // Distancia en kilómetros del nuevo tramo
  const [savingRoute, setSavingRoute] = useState(false);    // Bloquea el botón mientras se guarda en BD

  // Carga en paralelo (`Promise.all`) el catálogo de ciudades y las conexiones actuales
  async function loadCitiesAndRoutes() {
    try {
      const [citiesData, routesData] = await Promise.all([fetchCities(), fetchRoutes()]);
      setCities(citiesData);
      setRoutes(routesData);
    } catch (err) {
      console.error(err);
    }
  }

  // Se ejecuta automáticamente una vez al abrir la sección "Rutas"
  useEffect(() => {
    loadCitiesAndRoutes();
  }, []);

  // Dispara `GET /delivery/route` para ejecutar el algoritmo de Dijkstra en el backend
  async function handleCalculate() {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoute(from, to, kmPerLiter, pricePerLiter);
      setResult(data);
    } catch {
      setError('No existe ruta entre esas ciudades');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  // Dispara `POST /delivery/routes` para guardar un nuevo tramo bidireccional en PostgreSQL
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

  // Dispara `DELETE /delivery/routes/:id` para borrar una arista del mapa de entregas
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
        {/* Tarjeta 1: Calculadora de camino mínimo con Dijkstra */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 md:p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold">Calcular ruta más corta</h3>
            <p className="text-sm text-neutral-500">
              Usa Dijkstra para encontrar el trayecto óptimo y estimar el costo de gasolina.
            </p>
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

          {/* Desglose del resultado: secuencia de ciudades, kilómetros, litros y costo */}
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

        {/* Tarjeta 2: Formulario para agregar un nuevo tramo al grafo */}
        <div className="bg-white border border-neutral-200 rounded-lg p-5 md:p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Agregar nueva ruta</h3>
            <p className="text-sm text-neutral-500">
              Añade conexiones para mantener actualizado el mapa de entregas.
            </p>
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

      {/* Columna lateral: Listado de todas las rutas guardadas en PostgreSQL */}
      <aside className="bg-white border border-neutral-200 rounded-lg p-5 md:p-6 h-fit">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Rutas guardadas</h3>
          <p className="text-sm text-neutral-500">{routes.length} conexión(es) disponible(s)</p>
        </div>
        {routes.length > 0 ? (
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
            {routes.map((route) => (
              <div
                key={route.id}
                className="flex items-center justify-between gap-3 border border-neutral-100 rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {route.origin} → {route.destination}
                  </p>
                  <p className="text-xs text-neutral-500">{route.distance_km} km</p>
                </div>
                <button
                  type="button"
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
