import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Plus, ShoppingCart, Check, X } from 'lucide-react';
import { StatusBadge } from './Dashboard';
import toast from 'react-hot-toast';

export default function SalesOrders() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [channel, setChannel] = useState('COUNTER');
  const [lines, setLines] = useState([{ productId: '', qty: 1 }]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: () => api.get('/v1/sales-orders/').then(r => r.data),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/v1/customers/').then(r => r.data),
  });
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/v1/products/').then(r => r.data),
  });

  const createOrder = useMutation({
    mutationFn: (body: any) => api.post('/v1/sales-orders/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success('Pedido creado');
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => api.patch(`/v1/sales-orders/${id}/confirm`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-orders'] }); toast.success('Pedido confirmado'); },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/v1/sales-orders/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-orders'] }); toast.success('Pedido cancelado'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pedidos de venta</h1>
          <p className="text-gray-500 text-sm">B2B y B2C</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
          <Plus size={16} /> Nuevo pedido
        </button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo pedido</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
              <select className="input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {customers?.data?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.businessName ?? c.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Canal</label>
              <select className="input" value={channel} onChange={e => setChannel(e.target.value)}>
                {['COUNTER','ECOMMERCE','WHATSAPP','B2B_WHOLESALE'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {/* Lines */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Líneas de pedido</label>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <select className="input" value={l.productId} onChange={e => setLines(ls => ls.map((x,j) => j===i ? {...x, productId: e.target.value} : x))}>
                  <option value="">Producto...</option>
                  {products?.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name} (S/ {Number(p.basePricePen).toFixed(2)})</option>)}
                </select>
                <input type="number" className="input w-24" min={1} value={l.qty}
                  onChange={e => setLines(ls => ls.map((x,j) => j===i ? {...x, qty: parseInt(e.target.value)||1} : x))} />
                {lines.length > 1 && <button onClick={() => setLines(ls => ls.filter((_,j) => j!==i))} className="text-red-400 hover:text-red-600"><X size={16}/></button>}
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
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-left">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders?.data?.map((o: any) => (
                <tr key={o.id} className="table-row-hover">
                  <td className="px-5 py-3 font-mono text-gray-700">{o.orderNumber}</td>
                  <td className="px-5 py-3 font-medium">{o.customer?.businessName ?? o.customer?.fullName ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{o.channel}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold">S/ {Number(o.totalAmountPen).toFixed(2)}</td>
                  <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {o.status === 'PENDING' && (
                        <button onClick={() => confirm.mutate(o.id)} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200" title="Confirmar">
                          <Check size={14} />
                        </button>
                      )}
                      {['PENDING','CONFIRMED'].includes(o.status) && (
                        <button onClick={() => cancel.mutate(o.id)} className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200" title="Cancelar">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!orders?.data?.length && !isLoading && <p className="text-center text-gray-400 py-8">Sin pedidos aún</p>}
      </div>
    </div>
  );
}
