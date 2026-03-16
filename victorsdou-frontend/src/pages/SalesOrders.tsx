import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Plus, ShoppingCart, Check, X, Globe, ChevronRight, Package, Truck, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtMoney, fmtNum } from '../lib/fmt';
import { ExcelDownloadButton } from '../components/ExcelDownloadButton';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  CART:             'Carrito',
  PENDING_PAYMENT:  'Pendiente',
  PAID:             'Pagado',
  CONFIRMED:        'Confirmado',
  ACCEPTED:         'Aceptado',
  READY:            'Listo',
  IN_DELIVERY:      'En camino',
  DELIVERED:        'Entregado',
  CANCELLED:        'Cancelado',
  RETURNED:         'Devuelto',
  COMPLETED:        'Completado',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT:  'bg-yellow-100 text-yellow-800',
  CONFIRMED:        'bg-blue-100 text-blue-800',
  ACCEPTED:         'bg-indigo-100 text-indigo-800',
  READY:            'bg-purple-100 text-purple-800',
  IN_DELIVERY:      'bg-orange-100 text-orange-800',
  DELIVERED:        'bg-green-100 text-green-800',
  CANCELLED:        'bg-red-100 text-red-800',
  RETURNED:         'bg-gray-100 text-gray-600',
  PAID:             'bg-teal-100 text-teal-800',
  CART:             'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const color = STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{label}</span>;
}

// Ecommerce flow: which action buttons to show per status
const ECOMMERCE_ACTIONS: Record<string, { label: string; endpoint: string; icon: any; color: string }[]> = {
  PENDING_PAYMENT: [
    { label: 'Aceptar',   endpoint: 'accept',   icon: Check,        color: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
    { label: 'Cancelar',  endpoint: 'cancel',   icon: X,            color: 'bg-red-100 text-red-700 hover:bg-red-200' },
  ],
  ACCEPTED: [
    { label: 'Listo',     endpoint: 'ready',    icon: Package,      color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
    { label: 'Cancelar',  endpoint: 'cancel',   icon: X,            color: 'bg-red-100 text-red-700 hover:bg-red-200' },
  ],
  READY: [
    { label: 'En camino', endpoint: 'dispatch', icon: Truck,        color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  ],
  IN_DELIVERY: [
    { label: 'Entregado', endpoint: 'deliver',  icon: Check,        color: 'bg-green-100 text-green-700 hover:bg-green-200' },
    { label: 'Devolver',  endpoint: 'return',   icon: RotateCcw,    color: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesOrders() {
  const qc = useQueryClient();

  // Filters
  const [filterEcommerce, setFilterEcommerce] = useState(false);
  const [filterStatus, setFilterStatus]       = useState('');

  // New order form
  const [showForm,    setShowForm]    = useState(false);
  const [customerId,  setCustomerId]  = useState('');
  const [channel,     setChannel]     = useState('COUNTER');
  const [lines,       setLines]       = useState([{ productId: '', qty: 1 }]);

  // Build query params
  const queryParams = new URLSearchParams();
  if (filterEcommerce)          queryParams.set('channel', 'ECOMMERCE');
  if (filterStatus)             queryParams.set('status', filterStatus);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['sales-orders', filterEcommerce, filterStatus],
    queryFn: () => api.get(`/v1/sales-orders/?${queryParams}`).then(r => r.data),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn:  () => api.get('/v1/customers/').then(r => r.data),
  });
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn:  () => api.get('/v1/products/').then(r => r.data),
  });

  // Mutations
  const createOrder = useMutation({
    mutationFn: (body: any) => api.post('/v1/sales-orders/', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-orders'] }); toast.success('Pedido creado'); setShowForm(false); },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const statusAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.patch(`/v1/sales-orders/${id}/${action}`),
    onSuccess: (_d, { action }) => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      const labels: Record<string, string> = {
        accept: 'Pedido aceptado', ready: 'Pedido listo', dispatch: 'En camino',
        deliver: 'Entregado ✓', return: 'Marcado como devuelto', cancel: 'Cancelado',
      };
      toast.success(labels[action] ?? 'Actualizado');
    },
    onError: () => toast.error('Error al actualizar estado'),
  });

  const ecommerceOrderCount = (orders?.data ?? []).filter((o: any) => o.channel === 'ECOMMERCE').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ventas</h1>
          <p className="text-gray-500 text-sm">Pedidos B2B, B2C y ecommerce</p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelDownloadButton
            filename="pedidos-venta"
            sheetName="Pedidos"
            data={orders?.data ?? []}
            dateField="createdAt"
            dateLabel="Fecha del pedido"
            columns={[
              { header: 'N Pedido',   key: 'orderNumber',             width: 14 },
              { header: 'Cliente',    key: 'ecommerceCustomerName',   width: 24,
                format: (v: any, row: any) => v ?? row?.customer?.displayName ?? '—' },
              { header: 'Email',      key: 'ecommerceCustomerEmail',  width: 28 },
              { header: 'Teléfono',   key: 'ecommerceCustomerPhone',  width: 16 },
              { header: 'Canal',      key: 'channel',                 width: 12 },
              { header: 'Estado',     key: 'status',                  width: 14,
                format: (v: any) => STATUS_LABEL[v] ?? v },
              { header: 'Total S/',   key: 'totalPen',                width: 14,
                format: (v: any) => v != null ? Number(v) : 0 },
              { header: 'Entrega',    key: 'deliveryDate',            width: 18,
                format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
              { header: 'Notas',      key: 'notes',                   width: 28 },
            ]}
            extraFilters={[
              { key: 'status', label: 'Estado', type: 'select', options: Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })) },
              { key: 'channel', label: 'Canal', type: 'select', options: [
                { value: 'ECOMMERCE', label: 'Ecommerce' },
                { value: 'COUNTER',   label: 'Mostrador' },
              ]},
            ]}
          />
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> Nuevo pedido
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterEcommerce(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
            filterEcommerce
              ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Globe size={14} />
          Ecommerce
          {filterEcommerce && ecommerceOrderCount > 0 && (
            <span className="ml-1 bg-white/20 text-xs px-1.5 py-0.5 rounded-full font-bold">{ecommerceOrderCount}</span>
          )}
        </button>

        <div className="flex items-center gap-1">
          {[
            { value: '',                label: 'Todos' },
            { value: 'PENDING_PAYMENT', label: 'Pendiente' },
            { value: 'ACCEPTED',        label: 'Aceptado' },
            { value: 'READY',           label: 'Listo' },
            { value: 'IN_DELIVERY',     label: 'En camino' },
            { value: 'DELIVERED',       label: 'Entregado' },
            { value: 'RETURNED',        label: 'Devuelto' },
            { value: 'CANCELLED',       label: 'Cancelado' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filterStatus === opt.value
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* New order form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo pedido</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
              <select className="input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {customers?.data?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.displayName ?? c.businessName ?? c.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Canal</label>
              <select className="input" value={channel} onChange={e => setChannel(e.target.value)}>
                {['COUNTER', 'ECOMMERCE', 'WHATSAPP', 'B2B_WHOLESALE'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Líneas de pedido</label>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <select className="input" value={l.productId} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))}>
                  <option value="">Producto...</option>
                  {products?.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name} (S/ {fmtNum(p.basePricePen)})</option>)}
                </select>
                <input type="number" className="input w-24" min={1} value={l.qty}
                  onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, qty: parseInt(e.target.value) || 1 } : x))} />
                {lines.length > 1 && <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X size={16} /></button>}
              </div>
            ))}
            <button className="text-sm text-brand-600 hover:underline" onClick={() => setLines(ls => [...ls, { productId: '', qty: 1 }])}>+ Agregar línea</button>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!customerId} onClick={() => createOrder.mutate({
              customerId, channel,
              lines: lines.filter(l => l.productId).map(l => ({ productId: l.productId, quantity: l.qty })),
            })}>Crear pedido</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Orders table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShoppingCart size={18} className="text-gray-400" />
          <h2 className="font-semibold">Pedidos</h2>
          <span className="ml-auto text-sm text-gray-400">{orders?.data?.length ?? 0}</span>
        </div>
        {isLoading ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
          <div className="table-container">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Nro.</th>
                  <th className="px-5 py-3 text-left">Cliente</th>
                  <th className="px-5 py-3 text-left">Canal</th>
                  <th className="px-5 py-3 text-left">Entrega</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(orders?.data ?? []).map((o: any) => {
                  const isEcom   = o.channel === 'ECOMMERCE';
                  const name     = isEcom ? (o.ecommerceCustomerName ?? 'Cliente web') : (o.customer?.displayName ?? '—');
                  const actions  = ECOMMERCE_ACTIONS[o.status] ?? [];

                  return (
                    <tr key={o.id} className={`table-row-hover ${isEcom ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-5 py-3 font-mono text-gray-700">
                        <div className="flex items-center gap-1.5">
                          {isEcom && <Globe size={12} className="text-indigo-500 flex-shrink-0" />}
                          {o.orderNumber}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-800">{name}</div>
                        {isEcom && o.ecommerceCustomerEmail && (
                          <div className="text-xs text-gray-400">{o.ecommerceCustomerEmail}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{o.channel}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '—'}
                        {isEcom && o.addressSnap?.district && (
                          <div className="text-gray-400">{o.addressSnap.district}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">
                        S/ {fmtNum(o.totalPen ?? o.totalAmountPen)}
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {/* Ecommerce flow buttons */}
                          {isEcom && actions.map(act => (
                            <button
                              key={act.endpoint}
                              onClick={() => statusAction.mutate({ id: o.id, action: act.endpoint })}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${act.color}`}
                              title={act.label}
                            >
                              <act.icon size={12} />
                              {act.label}
                            </button>
                          ))}
                          {/* Legacy confirm for non-ecommerce */}
                          {!isEcom && o.status === 'PENDING' && (
                            <button onClick={() => statusAction.mutate({ id: o.id, action: 'confirm' })} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200" title="Confirmar">
                              <Check size={14} />
                            </button>
                          )}
                          {!isEcom && ['PENDING', 'CONFIRMED'].includes(o.status) && (
                            <button onClick={() => statusAction.mutate({ id: o.id, action: 'cancel' })} className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200" title="Cancelar">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!orders?.data?.length && !isLoading && (
          <p className="text-center text-gray-400 py-8">Sin pedidos aún</p>
        )}
      </div>
    </div>
  );
}
