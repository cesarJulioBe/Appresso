import { useState } from 'react';
import { TextField, Label, Input, Button } from '@heroui/react';
import { createOrder } from '../api';

function OrderForm({ onOrderCreated }) {
  const [customer, setCustomer] = useState('');
  const [products, setProducts] = useState([
    { name: '', quantity: 1, price: 0 },
  ]);
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateProduct(index, field, value) {
    const updated = [...products];
    updated[index][field] = value;
    setProducts(updated);
  }

  function addProductRow() {
    setProducts([...products, { name: '', quantity: 1, price: 0 }]);
  }

  function removeProductRow(index) {
    if (products.length > 1) {
      setProducts(products.filter((_, i) => i !== index));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      await createOrder(customer, products);
      setStatus('success');
      setCustomer('');
      setProducts([{ name: '', quantity: 1, price: 0 }]);
      onOrderCreated();
    } catch (err) {
      setStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-lg p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Nuevo pedido</h2>

      <TextField name="customer" isRequired value={customer} onChange={setCustomer}>
        <Label>Cliente</Label>
        <Input placeholder="Nombre del cliente" />
      </TextField>

      <div className="flex flex-col gap-3">
        {products.map((product, index) => (
  <div key={index} className="border border-neutral-200 rounded-md p-3 flex flex-col gap-2">
    <div className="flex justify-between items-center">
      <span className="text-xs text-neutral-500">Producto {index + 1}</span>
      <Button
        type="button"
        variant="tertiary"
        onPress={() => removeProductRow(index)}
        isDisabled={products.length === 1}
        className="min-w-0 px-2"
      >
        ×
      </Button>
    </div>

    <TextField name={`product-name-${index}`} isRequired value={product.name} onChange={(v) => updateProduct(index, 'name', v)}>
      <Label>Nombre</Label>
      <Input placeholder="Café" />
    </TextField>

    <div className="grid grid-cols-2 gap-2">
      <TextField name={`product-qty-${index}`} value={String(product.quantity)} onChange={(v) => updateProduct(index, 'quantity', parseInt(v) || 0)}>
        <Label>Cantidad</Label>
        <Input type="number" min={1} className="w-full min-w-0" />
      </TextField>

      <TextField name={`product-price-${index}`} value={String(product.price)} onChange={(v) => updateProduct(index, 'price', parseFloat(v) || 0)}>
        <Label>Precio</Label>
        <Input type="number" min={0} placeholder="5000" className="w-full min-w-0" />
      </TextField>
    </div>
  </div>
))}
</div>

      <Button type="button" variant="secondary" onPress={addProductRow}>
        + Agregar producto
      </Button>

      <Button type="submit" isDisabled={isSubmitting}>
        {isSubmitting ? 'Enviando…' : 'Crear pedido'}
      </Button>

      {status === 'success' && (
        <p className="text-sm text-green-700 bg-green-50 rounded p-2">Pedido creado correctamente</p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-700 bg-red-50 rounded p-2">No se pudo crear el pedido</p>
      )}
      
    </form>
  );
}

export default OrderForm;