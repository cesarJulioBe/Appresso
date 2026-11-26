/**
 * ============================================================================
 * ARCHIVO: frontend/src/App.jsx
 * CAPA: Componente Raíz de la Interfaz Web (Layout + Menú Lateral Unificado)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA:
 *   Mostrar la barra superior minimalista ("Appresso — Tu café, a un tap"),
 *   desplegar el cajón lateral de navegación (botón hamburguesa) y renderizar
 *   dinámicamente una de las 5 vistas 100% conectadas de la plataforma:
 *     1. `erp`               -> `<OperationalERP />` (Usuarios, Categorías, Ítems, Pedidos, Facturas y Pagos)
 *     2. `quality_integrity` -> `<DataQualityAndIntegrity />` (Limpieza de Datos + Hash Encadenado)
 *     3. `benchmarks`        -> `<AlgorithmBenchmark />` (Algoritmos O(n), O(n²), O(n log n), O(log n))
 *     4. `ai_center`         -> `<AiAnalyticsCenter />` (Keras/TensorFlow + Simple Statistics)
 *     5. `fraud`             -> `<FraudDetection />` (Transacciones HMAC + Ventana Deslizante)
 * ============================================================================
 */

import { useState } from 'react';
import OperationalERP from './components/OperationalERP';
import DataQualityAndIntegrity from './components/DataQualityAndIntegrity';
import AlgorithmBenchmark from './components/AlgorithmBenchmark';
import AiAnalyticsCenter from './components/AiAnalyticsCenter';
import FraudDetection from './components/FraudDetection';
import RoutePlanner from './components/RoutePlanner';

function App() {
  // Estado `activeView`: guarda cuál de las 5 secciones del menú está abierta actualmente en pantalla.
  const [activeView, setActiveView] = useState('erp');

  // Estado `isMenuOpen`: guarda `true` si el menú lateral está desplegado o `false` si está cerrado.
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Lista declarativa de las 5 secciones unificadas que cubren el 100% de la rúbrica del proyecto.
  const views = [
    {
      id: 'erp',
      label: 'Módulos Operativos',
      description: 'Usuarios con roles, categorías, ítems, pedidos multicanal, facturas y pagos',
    },
    {
      id: 'quality_integrity',
      label: 'Calidad e Integridad',
      description: 'Limpieza automática de datos y hash encadenado de facturas/pagos',
    },
    {
      id: 'benchmarks',
      label: 'Algoritmos y Benchmark',
      description: 'Comparación experimental O(n), O(n²), O(n log n) y O(log n)',
    },
    {
      id: 'ai_center',
      label: 'Modelos de IA (Keras/TF + Simple Stats)',
      description: 'Clasificador de fraude, Data Augmentation, cuartiles y demanda',
    },
    {
      id: 'fraud',
      label: 'Monitoreo de Transacciones',
      description: 'Firmas HMAC-SHA256, umbrales horarios y ventana deslizante',
    },
    {
      id: 'routes',
      label: 'Rutas',
      description: 'Planificación de entregas (Grafo y Dijkstra)',
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Encabezado limpio: solo contiene el botón hamburguesa, el título Appresso y su eslogan */}
      <header className="border-b border-neutral-200 bg-white px-5 py-5 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
            aria-label="Abrir menú"
            aria-expanded={isMenuOpen}
          >
            <span className="flex flex-col gap-1.5" aria-hidden="true">
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
            </span>
          </button>
          <h1 className="text-2xl font-bold">Appresso</h1>
          <p className="text-neutral-500 text-sm">Tu café, a un tap</p>
        </div>
      </header>

      {/* Cajón de menú lateral: solo existe en el DOM cuando `isMenuOpen` es `true` */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-40" role="presentation">
          {/* Fondo oscuro: si el usuario hace clic afuera del menú, se cierra */}
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Cerrar menú"
          />
          <nav
            className="relative h-full w-80 max-w-[85vw] bg-white p-5 shadow-xl overflow-y-auto"
            aria-label="Navegación principal"
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">Menú</p>
                <p className="text-sm text-neutral-500">Secciones de Appresso</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-md px-3 py-2 text-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                aria-label="Cerrar menú"
              >
                ×
              </button>
            </div>

            {/* Recorremos el arreglo `views` con `.map()` para pintar un botón por cada sección */}
            <div className="flex flex-col gap-2">
              {views.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => {
                    setActiveView(view.id);
                    setIsMenuOpen(false);
                  }}
                  className={`rounded-md px-4 py-3 text-left transition ${
                    activeView === view.id
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                  aria-current={activeView === view.id ? 'page' : undefined}
                >
                  <span className="block text-sm font-medium">{view.label}</span>
                  <span
                    className={`block text-xs ${
                      activeView === view.id ? 'text-neutral-300' : 'text-neutral-400'
                    }`}
                  >
                    {view.description}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}

      {/* Área principal donde se dibuja el componente correspondiente a `activeView` */}
      <main className="max-w-7xl mx-auto p-5 md:p-8">
        {activeView === 'erp' && <OperationalERP />}

        {activeView === 'quality_integrity' && <DataQualityAndIntegrity />}

        {activeView === 'benchmarks' && <AlgorithmBenchmark />}

        {activeView === 'ai_center' && <AiAnalyticsCenter />}

        {activeView === 'fraud' && (
          <section className="flex flex-col gap-6" aria-labelledby="fraud-title">
            <div>
              <h2 id="fraud-title" className="text-xl font-semibold">
                Monitoreo de transacciones y detección de fraude
              </h2>
              <p className="text-sm text-neutral-500">
                Analiza transacciones firmadas con HMAC-SHA256, umbrales horarios y ventana deslizante.
              </p>
            </div>
            <FraudDetection />
          </section>
        )}

        {activeView === 'routes' && (
          <section className="flex flex-col gap-6" aria-labelledby="routes-title">
            <div>
              <h2 id="routes-title" className="text-xl font-semibold">
                Planificador de rutas
              </h2>
              <p className="text-sm text-neutral-500">
                Administra rutas y calcula el trayecto más corto para tus entregas.
              </p>
            </div>
            <RoutePlanner />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
