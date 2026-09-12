import { useState } from 'react';
import { TextField, Label, Input, Button, Chip } from '@heroui/react';
import { searchOrder } from '../api';

function orderTotalAmount(order) {
  return order.products.reduce((sum, p) => sum + p.quantity * p.price, 0);
}

function OrderSearch() {
  const [id, setId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSearch() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchOrder(id);
      setResult(data);
    } catch (err) {
      setError('No se pudo buscar el pedido');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-1">Buscar pedido por ID</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Compara operaciones reales: búsqueda lineal vs. binaria
      </p>

      <div className="flex gap-2 items-end mb-4">
        <TextField value={id} onChange={setId} className="flex-1">
          <Label>ID del pedido</Label>
          <Input type="number" placeholder="Ej: 5" className="w-full min-w-0" />
        </TextField>
        <Button onPress={handleSearch} isDisabled={loading}>
          {loading ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 rounded p-2 mb-4">{error}</p>}

      {result && (
        <>
          {/* Pedido encontrado (o mensaje de no encontrado) */}
          {result.order ? (
  <div className="border border-neutral-200 rounded-md p-3 mb-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <span className="text-neutral-400 font-medium">#{result.order.id}</span>
      <div>
        <p className="font-medium">{result.order.customer}</p>
        <p className="text-sm text-neutral-500">
          {result.order.products.map((p) => `${p.quantity}× ${p.name}`).join(', ')}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-medium">${orderTotalAmount(result.order).toLocaleString('es-CO')}</span>
      <Chip color="success" variant="soft">{result.order.status}</Chip>
    </div>
  </div>
) : (
  <p className="text-sm text-neutral-500 mb-4">Ningún pedido tiene ese ID.</p>
)}

          {/* Comparación de operaciones */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-neutral-200 rounded-md p-4">
              <p className="text-sm font-medium mb-2">Búsqueda lineal</p>
              <p className="text-2xl font-semibold">{result.linear.operations}</p>
              <p className="text-xs text-neutral-500">operaciones</p>
            </div>

            <div className="border border-neutral-200 rounded-md p-4">
              <p className="text-sm font-medium mb-2">Búsqueda binaria</p>
              <p className="text-2xl font-semibold">{result.binary.operations}</p>
              <p className="text-xs text-neutral-500">operaciones</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default OrderSearch;