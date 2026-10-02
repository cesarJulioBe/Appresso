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

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 px-8 py-6">
        <h1 className="text-2xl font-bold">Appresso</h1>
        <p className="text-neutral-500 text-sm">Tu café, a un tap</p>
      </header>

      <main className="max-w-5xl mx-auto p-8 flex flex-col gap-8">

<div className="grid grid-cols-3 gap-6">
  <OrderSearch />
  <LoyaltyProgress />
  <SalesPrediction />
  <DeliveryQueue onOrderChanged={refresh} />
  <RoutePlanner />
</div>

        <div className="grid grid-cols-[340px_1fr] gap-8">
          <OrderForm onOrderCreated={refresh} />
          <Dashboard
            orders={orders}
            statistics={statistics}
            pagination={ordersPagination}
            onPageChange={(page) => setOrdersPagination((current) => ({ ...current, page }))}
          />
        </div>
        <div className="min-w-0"><FraudDetection /></div>
      </main>
    </div>


  );
}

export default App;