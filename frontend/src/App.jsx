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
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold">Appresso</h1>
          <p className="text-neutral-500 text-sm">Tu café, a un tap</p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 md:px-8">
        <nav className="flex gap-2 overflow-x-auto border-b border-neutral-200 py-3" aria-label="Navegación principal">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveView(view.id)}
              className={`min-w-fit rounded-md px-4 py-2 text-left transition ${
                activeView === view.id
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
              aria-current={activeView === view.id ? 'page' : undefined}
            >
              <span className="block text-sm font-medium">{view.label}</span>
              <span className={`hidden text-xs md:block ${activeView === view.id ? 'text-neutral-300' : 'text-neutral-400'}`}>
                {view.description}
              </span>
            </button>
          ))}
        </nav>
      </div>

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
              <RoutePlanner />
            </div>
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