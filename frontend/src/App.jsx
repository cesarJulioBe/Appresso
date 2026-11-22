import { useEffect, useState, useCallback } from 'react';
import OrderForm from './components/OrderForm';
import Dashboard from './components/Dashboard';
import LoyaltyProgress from './components/LoyaltyProgress';
import SalesPrediction from './components/SalesPrediction';
import { fetchOrders, fetchStatistics, fetchExecutiveSummary } from './api';
import OrderSearch from './components/OrderSearch';
import DeliveryQueue from './components/DeliveryQueue';
import RoutePlanner from './components/RoutePlanner';
import FraudDetection from './components/FraudDetection';
import OperationalERP from './components/OperationalERP';
import DataQualityAndIntegrity from './components/DataQualityAndIntegrity';
import AlgorithmBenchmark from './components/AlgorithmBenchmark';
import AiAnalyticsCenter from './components/AiAnalyticsCenter';

function App() {
  const [activeView, setActiveView] = useState('erp');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [executiveSummary, setExecutiveSummary] = useState(null);
  const [ordersPagination, setOrdersPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });

  const refresh = useCallback(async () => {
    try {
      const [ordersData, statsData, execData] = await Promise.all([
        fetchOrders(ordersPagination.page, ordersPagination.pageSize),
        fetchStatistics(),
        fetchExecutiveSummary().catch(() => null),
      ]);
      setOrders(ordersData.orders);
      setOrdersPagination({
        page: ordersData.page,
        pageSize: ordersData.pageSize,
        total: ordersData.total,
        totalPages: ordersData.totalPages,
      });
      setStatistics(statsData.statistics);
      if (execData) setExecutiveSummary(execData);
    } catch (err) {
      console.error('Error al refrescar:', err);
    }
  }, [ordersPagination.page, ordersPagination.pageSize]);

  const views = [
    {
      id: 'erp',
      label: 'Módulos Operativos (15% + DB 5%)',
      shortLabel: 'Módulos Operativos',
      description: 'Usuarios con roles, categorías, ítems, pedidos, facturas y pagos',
    },
    {
      id: 'quality_integrity',
      label: 'Calidad (10%) & Integridad (10%)',
      shortLabel: 'Calidad e Integridad',
      description: 'Limpieza automática de datos y hash encadenado de facturas/pagos',
    },
    {
      id: 'benchmarks',
      label: 'Algoritmos y Benchmark (30%)',
      shortLabel: 'Algoritmos O(n) / O(n²) / O(n log n)',
      description: 'Comparación experimental, ranking, ordenamiento y búsqueda',
    },
    {
      id: 'ai_center',
      label: 'Modelos de IA No LLM (30%)',
      shortLabel: 'IA: Keras/TF + Simple Stats',
      description: 'Clasificador de fraude, Data Augmentation, cuartiles y demanda',
    },
    {
      id: 'fraud',
      label: 'Monitoreo Transaccional',
      shortLabel: 'Transacciones HMAC',
      description: 'Ventana deslizante y umbrales horarios',
    },
    {
      id: 'orders',
      label: 'Pedidos Clásicos',
      shortLabel: 'Pedidos Clásicos',
      description: 'Vista original de creación y dashboard de pedidos',
    },
    {
      id: 'operations',
      label: 'Cola y Logística',
      shortLabel: 'Cola y Logística',
      description: 'Cola FIFO, pila de deshacer y progresión',
    },
    {
      id: 'routes',
      label: 'Rutas (Grafos)',
      shortLabel: 'Rutas Dijkstra',
      description: 'Planificación de entregas y costo de combustible',
    },
  ];

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-5 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
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
              <div>
                <h1 className="text-xl font-bold text-neutral-900">
                  Appresso — Plataforma Integral de Operaciones, Integridad, Algoritmos e IA
                </h1>
                <p className="text-neutral-500 text-xs">
                  Control operativo multicanal, limpieza de datos, hash encadenado HMAC-SHA256, análisis experimental y modelos Keras/TensorFlow + Simple Statistics
                </p>
              </div>
            </div>

            {executiveSummary && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 font-medium">
                  Ventas Facturadas:{' '}
                  <strong>${Number(executiveSummary.totalRevenue).toLocaleString()}</strong>
                </span>
                <span
                  className={`rounded-full px-3 py-1 font-semibold ${
                    executiveSummary.qualityScore >= 95
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  Calidad Datos: {executiveSummary.qualityScore}%
                </span>
                <span
                  className={`rounded-full px-3 py-1 font-semibold ${
                    executiveSummary.isIntegrityValid
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  Hash Chain: {executiveSummary.isIntegrityValid ? 'Íntegra' : 'Alterada'}
                </span>
                <span className="rounded-full bg-neutral-900 text-white px-3 py-1 font-semibold">
                  IA Keras/TF: {executiveSummary.aiModelsReady ? 'Activa' : 'Cargando'}
                </span>
              </div>
            )}
          </div>

          {/* Barra rápida de pestañas principales */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  activeView === view.id
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {view.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40" role="presentation">
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
                <p className="text-lg font-semibold">Menú de Rúbrica</p>
                <p className="text-sm text-neutral-500">Secciones de Appresso (100%)</p>
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

      <main className="max-w-7xl mx-auto p-5 md:p-8">
        {activeView === 'erp' && <OperationalERP onDataChanged={refresh} />}

        {activeView === 'quality_integrity' && (
          <DataQualityAndIntegrity onDataChanged={refresh} />
        )}

        {activeView === 'benchmarks' && <AlgorithmBenchmark />}

        {activeView === 'ai_center' && <AiAnalyticsCenter />}

        {activeView === 'orders' && (
          <section className="flex flex-col gap-6" aria-labelledby="orders-title">
            <div>
              <h2 id="orders-title" className="text-xl font-semibold">
                Gestión de pedidos (Vista clásica)
              </h2>
              <p className="text-sm text-neutral-500">
                Crea nuevos pedidos y consulta su estado.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[340px_1fr]">
              <OrderForm onOrderCreated={refresh} />
              <Dashboard
                orders={orders}
                statistics={statistics}
                pagination={ordersPagination}
                onPageChange={(page) =>
                  setOrdersPagination((current) => ({ ...current, page }))
                }
              />
            </div>
          </section>
        )}

        {activeView === 'operations' && (
          <section className="flex flex-col gap-6" aria-labelledby="operations-title">
            <div>
              <h2 id="operations-title" className="text-xl font-semibold">
                Operaciones y logística
              </h2>
              <p className="text-sm text-neutral-500">
                Herramientas de búsqueda, análisis, cola y rutas.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <OrderSearch />
              <LoyaltyProgress />
              <SalesPrediction />
              <DeliveryQueue onOrderChanged={refresh} />
            </div>
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

        {activeView === 'fraud' && (
          <section className="flex flex-col gap-6" aria-labelledby="fraud-title">
            <div>
              <h2 id="fraud-title" className="text-xl font-semibold">
                Detección de fraude transaccional
              </h2>
              <p className="text-sm text-neutral-500">
                Analiza transacciones HMAC-SHA256, anomalías por ventana deslizante y tendencias.
              </p>
            </div>
            <FraudDetection />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
