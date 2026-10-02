import { useEffect, useState, useCallback } from 'react';
import OrderForm from './components/OrderForm';
import Dashboard from './components/Dashboard';
import LoyaltyProgress from './components/LoyaltyProgress';
import SalesPrediction from './components/SalesPrediction';
import { fetchOrders, fetchStatistics } from './api';
import OrderSearch from './components/OrderSearch';
import DeliveryQueue from './components/DeliveryQueue';
import RoutePlanner from './components/RoutePlanner';
import FraudDetection from './components/FraudDetection';

function App() {
  const [activeView, setActiveView] = useState('orders');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [ordersPagination, setOrdersPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });

  const refresh = useCallback(async () => {
    try {
      const [ordersData, statsData] = await Promise.all([
        fetchOrders(ordersPagination.page, ordersPagination.pageSize),
        fetchStatistics(),
      ]);
      setOrders(ordersData.orders);
      setOrdersPagination({
        page: ordersData.page,
        pageSize: ordersData.pageSize,
        total: ordersData.total,
        totalPages: ordersData.totalPages,
      });
      setStatistics(statsData.statistics);
    } catch (err) {
      console.error('Error al refrescar:', err);
    }
  }, [ordersPagination.page, ordersPagination.pageSize]);

  const views = [
    {
      id: 'orders',
      label: 'Pedidos',
      description: 'Crear y consultar pedidos',
    },
    {
      id: 'operations',
      label: 'Operaciones',
      description: 'Algoritmos y logística',
    },
    {
      id: 'routes',
      label: 'Rutas',
      description: 'Planificación de entregas',
    },
    {
      id: 'fraud',
      label: 'Detección de fraude',
      description: 'Monitoreo de transacciones',
    },
  ];

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-5 py-5 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
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

      {isMenuOpen && (
        <div className="fixed inset-0 z-40" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Cerrar menú"
          />
          <nav
            className="relative h-full w-80 max-w-[85vw] bg-white p-5 shadow-xl"
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
                  <span className={`block text-xs ${activeView === view.id ? 'text-neutral-300' : 'text-neutral-400'}`}>
                    {view.description}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}

      <main className="max-w-6xl mx-auto p-5 md:p-8">
        {activeView === 'orders' && (
          <section className="flex flex-col gap-6" aria-labelledby="orders-title">
            <div>
              <h2 id="orders-title" className="text-xl font-semibold">Gestión de pedidos</h2>
              <p className="text-sm text-neutral-500">Crea nuevos pedidos y consulta su estado.</p>
            </div>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[340px_1fr]">
              <OrderForm onOrderCreated={refresh} />
              <Dashboard
                orders={orders}
                statistics={statistics}
                pagination={ordersPagination}
                onPageChange={(page) => setOrdersPagination((current) => ({ ...current, page }))}
              />
            </div>
          </section>
        )}

        {activeView === 'operations' && (
          <section className="flex flex-col gap-6" aria-labelledby="operations-title">
            <div>
              <h2 id="operations-title" className="text-xl font-semibold">Operaciones y logística</h2>
              <p className="text-sm text-neutral-500">Herramientas de búsqueda, análisis, cola y rutas.</p>
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
              <h2 id="routes-title" className="text-xl font-semibold">Planificador de rutas</h2>
              <p className="text-sm text-neutral-500">Administra rutas y calcula el trayecto más corto para tus entregas.</p>
            </div>
            <RoutePlanner />
          </section>
        )}

        {activeView === 'fraud' && (
          <section className="flex flex-col gap-6" aria-labelledby="fraud-title">
            <div>
              <h2 id="fraud-title" className="text-xl font-semibold">Detección de fraude</h2>
              <p className="text-sm text-neutral-500">Analiza transacciones, anomalías y tendencias.</p>
            </div>
            <FraudDetection />
          </section>
        )}
      </main>
    </div>


  );
}

export default App;