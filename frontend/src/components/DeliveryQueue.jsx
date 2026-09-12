import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import { fetchPendingQueue, attendNext, undoLastAction } from '../api';

function DeliveryQueue({ onOrderChanged }) {
  const [queueData, setQueueData] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadQueue() {
    try {
      const data = await fetchPendingQueue();
      setQueueData(data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadQueue();
  }, []);

  async function handleAttendNext() {
    setLoading(true);
    setMessage(null);
    try {
      const order = await attendNext();
      setMessage(`Atendiendo pedido #${order.id} de ${order.customer}`);
      await loadQueue();
      onOrderChanged();
    } catch (err) {
      setMessage('No hay pedidos pendientes en la cola');
    } finally {
      setLoading(false);
    }
  }

  async function handleUndo() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await undoLastAction();
      setMessage(`Deshecho: pedido #${result.order.id} volvió a "${result.order.status}"`);
      await loadQueue();
      onOrderChanged();
    } catch (err) {
      setMessage('No hay acciones para deshacer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-1">Cola de atención</h2>
      <p className="text-sm text-neutral-500 mb-4">
        FIFO: se atiende primero al pedido que más tiempo lleva esperando
      </p>

      {queueData && (
        <div className="border border-neutral-200 rounded-md p-3 mb-4">
          <p className="text-sm text-neutral-500">Pedidos pendientes</p>
          <p className="text-2xl font-semibold">{queueData.totalPending}</p>
          {queueData.next && (
            <p className="text-sm mt-1">
              Siguiente: <span className="font-medium">#{queueData.next.id} — {queueData.next.customer}</span>
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button onPress={handleAttendNext} isDisabled={loading}>
          Atender siguiente
        </Button>
        <Button variant="secondary" onPress={handleUndo} isDisabled={loading}>
          Deshacer
        </Button>
      </div>

      {message && <p className="text-sm text-neutral-600 mt-3">{message}</p>}
    </div>
  );
}

export default DeliveryQueue;