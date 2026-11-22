import { useState, useEffect, useCallback } from 'react';
import {
  fetchOperationalUsers,
  createOperationalUser,
  deleteOperationalUser,
  fetchCategories,
  createCategory,
  deleteCategory,
  fetchCatalogItems,
  createCatalogItem,
  deleteCatalogItem,
  createMultichannelOrder,
  fetchInvoices,
  generateInvoice,
  cancelInvoice,
  fetchPayments,
  processPayment,
} from '../api';

export default function OperationalERP({ onDataChanged }) {
  const [subTab, setSubTab] = useState('pos');
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [feedback, setFeedback] = useState(null);

  // Formulario de Pedido Multicanal
  const [orderForm, setOrderForm] = useState({
    usuarioId: '',
    empleadoId: '',
    canal: 'presencial',
    porcentajeDescuento: 0,
    autoGenerateInvoice: true,
    lines: [{ itemId: '', quantity: 1 }],
  });

  // Formulario de Factura
  const [invoiceForm, setInvoiceForm] = useState({
    pedidoId: '',
    usuarioId: '',
    canal: 'presencial',
    subtotal: 25000,
    porcentajeDescuento: 5,
    porcentajeImpuesto: 19,
  });

  // Formulario de Pago con Comprobante
  const [paymentForm, setPaymentForm] = useState({
    facturaId: '',
    monto: '',
    metodoPago: 'Tarjeta',
    referenciaComprobante: `COMP-${Date.now().toString().slice(-5)}`,
    entidadComprobante: 'BANCOLOMBIA_PSE',
    archivoComprobante: 'soporte_pago_digital.pdf',
  });

  // Formulario de Ítem y Categoría
  const [catForm, setCatForm] = useState({ nombre: '', descripcion: '' });
  const [itemForm, setItemForm] = useState({
    nombre: '',
    categoriaId: '',
    precio: '8500',
    stock: 30,
    sku: '',
  });

  // Formulario de Usuario con Rol
  const [userForm, setUserForm] = useState({
    nombre: '',
    email: '',
    rol: 'cliente',
    documento: '',
    telefono: '',
  });

  const loadAll = useCallback(async () => {
    try {
      const [uRes, cRes, iRes, invRes, payRes] = await Promise.all([
        fetchOperationalUsers(),
        fetchCategories(),
        fetchCatalogItems(),
        fetchInvoices(),
        fetchPayments(),
      ]);
      setUsers(uRes.users || []);
      setCategories(cRes.categories || []);
      setItems(iRes.items || []);
      setInvoices(invRes.invoices || []);
      setPayments(payRes.payments || []);
    } catch (err) {
      console.error('Error cargando módulos operativos:', err);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const notify = (type, title, details = []) => {
    setFeedback({ type, title, details: Array.isArray(details) ? details : [details] });
    loadAll();
    if (onDataChanged) onDataChanged();
  };

  // ===== HANDLERS PEDIDOS MULTICANAL =====
  const handleAddOrderLine = () => {
    setOrderForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { itemId: items[0]?.id || '', quantity: 1 }],
    }));
  };

  const handleUpdateOrderLine = (idx, field, val) => {
    setOrderForm((prev) => {
      const lines = [...prev.lines];
      lines[idx] = { ...lines[idx], [field]: val };
      return { ...prev, lines };
    });
  };

  const handleCreateMultichannelOrder = async (e) => {
    e.preventDefault();
    try {
      const validLines = orderForm.lines
        .map((l) => ({
          itemId: Number(l.itemId || items[0]?.id),
          quantity: Math.max(1, Number(l.quantity) || 1),
        }))
        .filter((l) => l.itemId);

      const res = await createMultichannelOrder({
        usuarioId: orderForm.usuarioId || users.find((u) => u.rol === 'cliente')?.id,
        empleadoId: orderForm.empleadoId || users.find((u) => u.rol === 'empleado')?.id,
        canal: orderForm.canal,
        porcentajeDescuento: Number(orderForm.porcentajeDescuento) || 0,
        autoGenerateInvoice: orderForm.autoGenerateInvoice,
        items: validLines,
      });

      const stockMsgs = (res.stockAdjustments || []).map(
        (s) => `Inventario '${s.nombre}': ${s.previousStock} -> ${s.remainingStock} (-${s.deducted} uds)`
      );
      if (res.invoice) {
        stockMsgs.push(
          `Factura emitida: ${res.invoice.numero_consecutivo} | Total: $${Number(res.invoice.total).toLocaleString()} | Hash: ${res.invoice.hash_actual.slice(0, 16)}...`
        );
      }

      notify(
        'success',
        `Pedido #${res.order.id} creado exitosamente por canal '${res.order.canal}'`,
        stockMsgs
      );
    } catch (err) {
      notify('error', 'Error al crear pedido multicanal', [err.message]);
    }
  };

  // ===== HANDLERS FACTURACIÓN =====
  const handleGenerateInvoice = async (e) => {
    e.preventDefault();
    try {
      const res = await generateInvoice({
        pedidoId: invoiceForm.pedidoId ? Number(invoiceForm.pedidoId) : undefined,
        usuarioId: invoiceForm.usuarioId ? Number(invoiceForm.usuarioId) : undefined,
        canal: invoiceForm.canal,
        subtotal: Number(invoiceForm.subtotal),
        porcentajeDescuento: Number(invoiceForm.porcentajeDescuento),
        porcentajeImpuesto: Number(invoiceForm.porcentajeImpuesto),
      });

      const details = [
        `Consecutivo: ${res.invoice.numero_consecutivo} | Total con IVA: $${Number(res.invoice.total).toLocaleString()}`,
        `Hash Encadenado: ${res.invoice.hash_actual.slice(0, 22)}... (Prev: ${res.invoice.prev_hash.slice(0, 14)}...)`,
        ...(res.warnings || []),
      ];
      if (res.aiClassification) {
        details.push(
          `Clasificación IA (Keras): ${res.aiClassification.classification} (Riesgo: ${(res.aiClassification.fraudProbability * 100).toFixed(1)}%)`
        );
      }
      notify(res.warnings?.length ? 'warning' : 'success', 'Factura generada y encadenada', details);
    } catch (err) {
      notify('error', 'Error al generar factura', [err.message]);
    }
  };

  const handleCancelInvoice = async (inv) => {
    try {
      const res = await cancelInvoice(inv.id, 'Anulación solicitada desde panel operativo');
      notify(
        res.suspiciousAlert ? 'warning' : 'success',
        `Factura ${inv.numero_consecutivo} anulada`,
        res.suspiciousAlert ? [res.suspiciousAlert] : ['Estado actualizado a Anulada']
      );
    } catch (err) {
      notify('error', 'Error al anular factura', [err.message]);
    }
  };

  // ===== HANDLERS PAGOS =====
  const handleProcessPayment = async (e) => {
    e.preventDefault();
    try {
      const targetInvoice =
        invoices.find((i) => Number(i.id) === Number(paymentForm.facturaId)) || invoices[0];
      if (!targetInvoice) {
        throw new Error('Selecciona una factura válida para procesar el pago');
      }

      const res = await processPayment({
        facturaId: targetInvoice.id,
        monto: paymentForm.monto !== '' ? Number(paymentForm.monto) : Number(targetInvoice.total),
        metodoPago: paymentForm.metodoPago,
        referenciaComprobante: paymentForm.referenciaComprobante,
        entidadComprobante: paymentForm.entidadComprobante,
        archivoComprobante: paymentForm.archivoComprobante,
      });

      const valid = res.receiptValidation?.isValid;
      const details = [
        `Comprobante: ${res.payment.referencia_comprobante} | Estado: ${res.payment.estado}`,
        `Hash Comprobante: ${res.payment.comprobante_hash.slice(0, 20)}...`,
        `Hash Cadena Pago: ${res.payment.hash_actual.slice(0, 20)}...`,
        ...(res.receiptValidation?.issues || []),
      ];
      if (res.aiClassification) {
        details.push(
          `Clasificación IA (Keras): ${res.aiClassification.classification} (${(res.aiClassification.fraudProbability * 100).toFixed(1)}%)`
        );
      }

      setPaymentForm((prev) => ({
        ...prev,
        referenciaComprobante: `COMP-${Date.now().toString().slice(-5)}`,
      }));

      notify(
        valid ? 'success' : 'warning',
        valid
          ? 'Pago procesado y comprobante verificado criptográficamente'
          : 'Pago registrado con ALERTA DE COMPROBANTE SOSPECHOSO',
        details
      );
    } catch (err) {
      notify('error', 'Error al procesar pago', [err.message]);
    }
  };

  // ===== HANDLERS CATÁLOGO Y USUARIOS =====
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      const res = await createCategory(catForm);
      setCatForm({ nombre: '', descripcion: '' });
      notify(
        'success',
        `Categoría '${res.category.nombre}' registrada`,
        res.reason ? [res.reason] : ['Normalizada y verificada sin duplicados']
      );
    } catch (err) {
      notify('error', 'Error al crear categoría', [err.message]);
    }
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    try {
      const res = await createCatalogItem({
        ...itemForm,
        categoriaId: itemForm.categoriaId || categories[0]?.id,
      });
      setItemForm({ nombre: '', categoriaId: '', precio: '8500', stock: 30, sku: '' });
      notify(
        'success',
        `Ítem '${res.item.nombre}' ($${Number(res.item.precio).toLocaleString()}) guardado`,
        res.warnings?.length ? res.warnings : [`SKU: ${res.item.sku} | Stock: ${res.item.stock}`]
      );
    } catch (err) {
      notify('error', 'Error al crear ítem', [err.message]);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await createOperationalUser(userForm);
      setUserForm({ nombre: '', email: '', rol: 'cliente', documento: '', telefono: '' });
      notify(
        'success',
        `Usuario '${res.user.nombre}' (${res.user.rol}) registrado`,
        res.warnings?.length ? res.warnings : [`Email normalizado: ${res.user.email}`]
      );
    } catch (err) {
      notify('error', 'Error al registrar usuario', [err.message]);
    }
  };

  const subTabs = [
    { id: 'pos', label: '1. Pedidos Multicanal & Stock' },
    { id: 'billing', label: '2. Facturación & Pagos (Hash Chain)' },
    { id: 'catalog', label: '3. Categorías e Ítems (Inventario)' },
    { id: 'users', label: '4. Usuarios y Roles' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-navegación de módulos operativos */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              subTab === t.id
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Notificación de operación */}
      {feedback && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            feedback.type === 'error'
              ? 'border-red-300 bg-red-50 text-red-900'
              : feedback.type === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          <div className="flex items-center justify-between font-semibold">
            <span>{feedback.title}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs underline opacity-75 hover:opacity-100"
            >
              Cerrar
            </button>
          </div>
          {feedback.details?.length > 0 && (
            <ul className="mt-1.5 list-disc pl-5 text-xs space-y-0.5">
              {feedback.details.map((d, idx) => (
                <li key={idx}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* PESTAÑA 1: PEDIDOS MULTICANAL E INVENTARIO */}
      {subTab === 'pos' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
          <form
            onSubmit={handleCreateMultichannelOrder}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col gap-4"
          >
            <div>
              <h3 className="text-base font-semibold text-neutral-900">
                Nuevo Pedido Multicanal
              </h3>
              <p className="text-xs text-neutral-500">
                Descuenta inventario automáticamente y emite factura encadenada opcional.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Cliente
                </label>
                <select
                  value={orderForm.usuarioId}
                  onChange={(e) => setOrderForm({ ...orderForm, usuarioId: e.target.value })}
                  className="w-full rounded-md border border-neutral-300 px-2.5 py-2 text-xs"
                >
                  <option value="">Seleccionar cliente...</option>
                  {users
                    .filter((u) => u.rol === 'cliente' || !u.rol)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} ({u.email})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Empleado / Cajero
                </label>
                <select
                  value={orderForm.empleadoId}
                  onChange={(e) => setOrderForm({ ...orderForm, empleadoId: e.target.value })}
                  className="w-full rounded-md border border-neutral-300 px-2.5 py-2 text-xs"
                >
                  <option value="">Automático...</option>
                  {users
                    .filter((u) => u.rol === 'empleado' || u.rol === 'admin')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} [{u.rol}]
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Canal de Operación
                </label>
                <select
                  value={orderForm.canal}
                  onChange={(e) => setOrderForm({ ...orderForm, canal: e.target.value })}
                  className="w-full rounded-md border border-neutral-300 px-2.5 py-2 text-xs"
                >
                  <option value="presencial">Presencial (POS Tienda)</option>
                  <option value="web">Canal Web</option>
                  <option value="app">App Móvil</option>
                  <option value="domicilio">Domicilio</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Descuento (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="80"
                  value={orderForm.porcentajeDescuento}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, porcentajeDescuento: e.target.value })
                  }
                  className="w-full rounded-md border border-neutral-300 px-2.5 py-2 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-700">
                  Ítems del Pedido (Catálogo con Stock)
                </span>
                <button
                  type="button"
                  onClick={handleAddOrderLine}
                  className="text-xs font-medium text-neutral-900 underline"
                >
                  + Agregar ítem
                </button>
              </div>

              {orderForm.lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={line.itemId || items[0]?.id || ''}
                    onChange={(e) => handleUpdateOrderLine(idx, 'itemId', e.target.value)}
                    className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                  >
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.nombre} — ${Number(it.precio).toLocaleString()} (Stock: {it.stock})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={line.quantity}
                    onChange={(e) => handleUpdateOrderLine(idx, 'quantity', e.target.value)}
                    className="w-16 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                  />
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={orderForm.autoGenerateInvoice}
                onChange={(e) =>
                  setOrderForm({ ...orderForm, autoGenerateInvoice: e.target.checked })
                }
              />
              Generar factura consecutiva con IVA (19%) y hash encadenado automáticamente
            </label>

            <button
              type="submit"
              className="rounded-lg bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              Crear Pedido y Descontar Inventario
            </button>
          </form>

          {/* Estado actual del inventario en tiempo real */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-neutral-900 mb-1">
              Inventario de Productos en Tiempo Real
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Verifica cómo cada pedido descuenta unidades del stock disponible.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 text-neutral-500">
                  <tr>
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Producto</th>
                    <th className="py-2 pr-3">Categoría</th>
                    <th className="py-2 pr-3">Precio</th>
                    <th className="py-2 pr-3">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 pr-3 font-mono text-[11px] text-neutral-500">
                        {item.sku}
                      </td>
                      <td className="py-2 pr-3 font-medium text-neutral-900">{item.nombre}</td>
                      <td className="py-2 pr-3 text-neutral-600">
                        {item.categoria_nombre || 'General'}
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        ${Number(item.precio).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            Number(item.stock) <= 10
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.stock} uds
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: FACTURACIÓN Y PAGOS CON COMPROBANTE */}
      {subTab === 'billing' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Generar Factura */}
            <form
              onSubmit={handleGenerateInvoice}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col gap-3.5"
            >
              <div>
                <h3 className="text-base font-semibold text-neutral-900">
                  Emitir Factura (Consecutivo + Impuestos + Hash Encadenado)
                </h3>
                <p className="text-xs text-neutral-500">
                  Calcula IVA, alerta si el descuento supera el 30% y encadena el hash con la factura previa.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Subtotal (COP)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    value={invoiceForm.subtotal}
                    onChange={(e) =>
                      setInvoiceForm({ ...invoiceForm, subtotal: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Descuento (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="85"
                    value={invoiceForm.porcentajeDescuento}
                    onChange={(e) =>
                      setInvoiceForm({ ...invoiceForm, porcentajeDescuento: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    IVA (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={invoiceForm.porcentajeImpuesto}
                    onChange={(e) =>
                      setInvoiceForm({ ...invoiceForm, porcentajeImpuesto: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Cliente
                  </label>
                  <select
                    value={invoiceForm.usuarioId}
                    onChange={(e) =>
                      setInvoiceForm({ ...invoiceForm, usuarioId: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  >
                    <option value="">Cliente general...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Canal
                  </label>
                  <select
                    value={invoiceForm.canal}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, canal: e.target.value })}
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  >
                    <option value="presencial">Presencial</option>
                    <option value="web">Web</option>
                    <option value="app">App</option>
                    <option value="domicilio">Domicilio</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Generar Factura Consecutiva
              </button>
            </form>

            {/* Procesar Pago con Comprobante */}
            <form
              onSubmit={handleProcessPayment}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col gap-3.5"
            >
              <div>
                <h3 className="text-base font-semibold text-neutral-900">
                  Procesar Pago y Adjuntar Comprobante
                </h3>
                <p className="text-xs text-neutral-500">
                  Verifica que el comprobante no sea falso ni reutilizado y que coincida con la factura.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Factura a Pagar
                  </label>
                  <select
                    value={paymentForm.facturaId}
                    onChange={(e) => {
                      const inv = invoices.find((i) => Number(i.id) === Number(e.target.value));
                      setPaymentForm({
                        ...paymentForm,
                        facturaId: e.target.value,
                        monto: inv ? Number(inv.total) : '',
                      });
                    }}
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  >
                    <option value="">Seleccionar factura...</option>
                    {invoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.numero_consecutivo} — ${Number(inv.total).toLocaleString()} [{inv.estado}]
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={paymentForm.metodoPago}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, metodoPago: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  >
                    <option value="Tarjeta">Tarjeta Crédito/Débito</option>
                    <option value="Transferencia">Transferencia Bancaria</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Nequi">Nequi / Daviplata</option>
                    <option value="PSE">PSE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Monto Comprobante
                  </label>
                  <input
                    type="number"
                    placeholder="Igual a factura"
                    value={paymentForm.monto}
                    onChange={(e) => setPaymentForm({ ...paymentForm, monto: e.target.value })}
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Ref. Comprobante
                  </label>
                  <input
                    type="text"
                    value={paymentForm.referenciaComprobante}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, referenciaComprobante: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Archivo Soporte
                  </label>
                  <input
                    type="text"
                    value={paymentForm.archivoComprobante}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, archivoComprobante: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Registrar Pago con Comprobante
              </button>
            </form>
          </div>

          {/* Listado de Facturas y Pagos */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-neutral-900 mb-3">
                Facturas Emitidas ({invoices.length})
              </h4>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 text-neutral-500">
                    <tr>
                      <th className="py-2 pr-2">Consecutivo</th>
                      <th className="py-2 pr-2">Subtotal</th>
                      <th className="py-2 pr-2">Desc.</th>
                      <th className="py-2 pr-2">IVA</th>
                      <th className="py-2 pr-2">Total</th>
                      <th className="py-2 pr-2">Estado</th>
                      <th className="py-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2 pr-2 font-mono font-semibold">
                          {inv.numero_consecutivo}
                        </td>
                        <td className="py-2 pr-2">${Number(inv.subtotal).toLocaleString()}</td>
                        <td className="py-2 pr-2">
                          {Number(inv.porcentaje_descuento)}%
                        </td>
                        <td className="py-2 pr-2">${Number(inv.impuestos).toLocaleString()}</td>
                        <td className="py-2 pr-2 font-semibold">
                          ${Number(inv.total).toLocaleString()}
                        </td>
                        <td className="py-2 pr-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              inv.estado === 'Pagada'
                                ? 'bg-emerald-100 text-emerald-800'
                                : inv.estado === 'Anulada' || inv.estado === 'Alterada'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {inv.estado}
                          </span>
                        </td>
                        <td className="py-2">
                          {inv.estado !== 'Anulada' && (
                            <button
                              type="button"
                              onClick={() => handleCancelInvoice(inv)}
                              className="text-[11px] text-red-600 hover:underline"
                            >
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-neutral-900 mb-3">
                Pagos y Comprobantes ({payments.length})
              </h4>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 text-neutral-500">
                    <tr>
                      <th className="py-2 pr-2">Factura</th>
                      <th className="py-2 pr-2">Método</th>
                      <th className="py-2 pr-2">Monto</th>
                      <th className="py-2 pr-2">Comprobante</th>
                      <th className="py-2">Integridad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 pr-2 font-mono">
                          {p.factura_numero || `#${p.factura_id}`}
                        </td>
                        <td className="py-2 pr-2">{p.metodo_pago}</td>
                        <td className="py-2 pr-2 font-semibold">
                          ${Number(p.monto).toLocaleString()}
                        </td>
                        <td className="py-2 pr-2 font-mono text-[11px]">
                          {p.referencia_comprobante}
                        </td>
                        <td className="py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              p.comprobante_valido && p.estado === 'Aprobado'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {p.comprobante_valido ? 'Comprobante Íntegro' : 'Sospechoso'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: CATEGORÍAS E ÍTEMS */}
      {subTab === 'catalog' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col gap-4">
            <h3 className="text-base font-semibold text-neutral-900">
              Gestión de Categorías (con Unificación Automática)
            </h3>
            <form onSubmit={handleCreateCategory} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Ej: bebidas calientes cafe / Pastelería"
                value={catForm.nombre}
                onChange={(e) => setCatForm({ ...catForm, nombre: e.target.value })}
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Crear / Unificar
              </button>
            </form>
            <div className="divide-y divide-neutral-100 text-xs max-h-64 overflow-y-auto">
              {categories.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-neutral-900">{c.nombre}</span>
                    <span className="ml-2 text-neutral-400 font-mono text-[11px]">
                      [{c.nombre_normalizado}]
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-500">{c.total_items || 0} ítems</span>
                    <button
                      type="button"
                      onClick={() =>
                        deleteCategory(c.id).then(() =>
                          notify('success', `Categoría #${c.id} eliminada`)
                        )
                      }
                      className="text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col gap-4">
            <h3 className="text-base font-semibold text-neutral-900">
              Crear Ítem / Producto (con Limpieza de Precio)
            </h3>
            <form onSubmit={handleCreateItem} className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Nombre del producto"
                value={itemForm.nombre}
                onChange={(e) => setItemForm({ ...itemForm, nombre: e.target.value })}
                className="rounded-md border border-neutral-300 px-3 py-2 text-xs"
              />
              <select
                value={itemForm.categoriaId}
                onChange={(e) => setItemForm({ ...itemForm, categoriaId: e.target.value })}
                className="rounded-md border border-neutral-300 px-3 py-2 text-xs"
              >
                <option value="">Categoría...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                placeholder="Precio (ej: $ 12.500,00)"
                value={itemForm.precio}
                onChange={(e) => setItemForm({ ...itemForm, precio: e.target.value })}
                className="rounded-md border border-neutral-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                required
                placeholder="Stock inicial"
                value={itemForm.stock}
                onChange={(e) => setItemForm({ ...itemForm, stock: e.target.value })}
                className="rounded-md border border-neutral-300 px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="col-span-2 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Guardar Ítem en Catálogo
              </button>
            </form>

            <div className="divide-y divide-neutral-100 text-xs max-h-56 overflow-y-auto">
              {items.map((it) => (
                <div key={it.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-neutral-900">{it.nombre}</span>
                    <span className="ml-2 text-neutral-500">
                      ${Number(it.precio).toLocaleString()} ({it.stock} uds)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      deleteCatalogItem(it.id).then(() =>
                        notify('success', `Ítem #${it.id} eliminado`)
                      )
                    }
                    className="text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: USUARIOS Y ROLES */}
      {subTab === 'users' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          <form
            onSubmit={handleCreateUser}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col gap-3"
          >
            <h3 className="text-base font-semibold text-neutral-900">
              Registrar Usuario con Rol
            </h3>
            <p className="text-xs text-neutral-500">
              Normaliza nombre/correo y previene clientes registrados dos veces.
            </p>
            <input
              type="text"
              required
              placeholder="Nombre completo"
              value={userForm.nombre}
              onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })}
              className="rounded-md border border-neutral-300 px-3 py-2 text-xs"
            />
            <input
              type="text"
              required
              placeholder="Correo electrónico"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              className="rounded-md border border-neutral-300 px-3 py-2 text-xs"
            />
            <select
              value={userForm.rol}
              onChange={(e) => setUserForm({ ...userForm, rol: e.target.value })}
              className="rounded-md border border-neutral-300 px-3 py-2 text-xs"
            >
              <option value="cliente">Rol: Cliente</option>
              <option value="empleado">Rol: Empleado / Cajero</option>
              <option value="admin">Rol: Administrador</option>
            </select>
            <input
              type="text"
              placeholder="Documento (ej: CC10203040)"
              value={userForm.documento}
              onChange={(e) => setUserForm({ ...userForm, documento: e.target.value })}
              className="rounded-md border border-neutral-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white"
            >
              Registrar Usuario
            </button>
          </form>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-neutral-900 mb-3">
              Directorio de Usuarios ({users.length})
            </h3>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 text-neutral-500">
                  <tr>
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Rol</th>
                    <th className="py-2 pr-3">Documento</th>
                    <th className="py-2">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 pr-3 font-mono text-neutral-400">#{u.id}</td>
                      <td className="py-2 pr-3 font-medium text-neutral-900">
                        {u.nombre || 'Sin nombre'}
                      </td>
                      <td className="py-2 pr-3 text-neutral-600">{u.email}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-800">
                          {u.rol || 'cliente'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        {u.documento || '—'}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() =>
                            deleteOperationalUser(u.id).then(() =>
                              notify('success', `Usuario #${u.id} eliminado`)
                            )
                          }
                          className="text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
