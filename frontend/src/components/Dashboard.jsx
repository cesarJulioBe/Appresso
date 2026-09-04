import { Chip } from '@heroui/react';

function formatMoney(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function orderTotalAmount(order) {
  return order.products.reduce((sum, p) => sum + p.quantity * p.price, 0);
}

const statusColors = {
  Requested: 'default',
  'In Progress': 'warning',
  Delivered: 'success',
};

function Dashboard({ orders, statistics }) {
  const statusLabels = ['Requested', 'In Progress', 'Delivered'];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-4">
        {statusLabels.map((status) => {
          const data = statistics?.[status] || { orderCount: 0, totalMoney: 0 };
          return (
            <div key={status} className="bg-white border border-neutral-200 rounded-lg p-4">
              <p className="text-sm text-neutral-500">{status}</p>
              <p className="text-2xl font-semibold">{data.orderCount}</p>
              <p className="text-sm text-neutral-500">{formatMoney(data.totalMoney)}</p>
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Pedidos ({orders.length})</h2>
        <div className="flex flex-col gap-2">
          {orders.length === 0 && (
            <p className="text-neutral-500 text-sm">Aún no hay pedidos</p>
          )}
          {[...orders].reverse().map((order) => (
            <div key={order.id} className="bg-white border border-neutral-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-neutral-400 font-medium">#{order.id}</span>
                <div>
                  <p className="font-medium">{order.customer}</p>
                  <p className="text-sm text-neutral-500">
                    {order.products.map((p) => `${p.quantity}× ${p.name}`).join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{formatMoney(orderTotalAmount(order))}</span>
                <Chip color={statusColors[order.status]} variant="soft">
                  {order.status}
                </Chip>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

