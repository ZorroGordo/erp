import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Plus, ClipboardList } from 'lucide-react';
import { StatusBadge } from './Dashboard';
import toast from 'react-hot-toast';

export default function Procurement() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'po'|'suppliers'>('po');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplierId: '', expectedDeliveryDate: '', notes: '', lines: [{ ingredientId: '', quantity: 1, unitPricePen: 0 }] });
  const [supForm, setSupForm] = useState({ name: '', taxId: '', email: '', phone: '', contactName: '' });

  const { data: pos, isLoading: loadPO } = useQuery({ queryKey: ['pos'], queryFn: () => api.get('/v1/procurement/purchase-orders').then(r => r.data) });
  const { data: suppliers, isLoading: loadSup } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/v1/procurement/suppliers').then(r => r.data) });
  const { data: ingredients } = useQuery({ queryKey: ['ingredients'], queryFn: () => api.get('/v1/inventory/ingredients').then(r => r.data) });

  const createPO = useMutation({ mutationFn: (b: any) => api.post('/v1/procurement/purchase-orders', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); toast.success('OC creada'); setShowForm(false); }, onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error') });
  const approvePO = useMutation({ mutationFn: (id: string) => api.patch(`/v1/procurement/purchase-orders/${id}/approve`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); toast.success('OC aprobada'); } });
  const createSup = useMutation({ mutationFn: (b: any) => api.post('/v1/procurement/suppliers', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Proveedor creado'); setShowForm(false); }, onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error') });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Compras</h1><p className="text-gray-500 text-sm">Órdenes de compra y proveedores</p></div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}><Plus size={16} /> {tab === 'po' ? 'Nueva OC' : 'Nuevo proveedor'}</button>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {(['po','suppliers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab===t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'po' ? 'Órdenes de compra' : 'Proveedores'}
          </button>
        ))}
      </div>

      {tab === 'po' && (
        <>
          {showForm && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold">Nueva OC</h3>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                  <select className="input" value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {suppliers?.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha entrega</label><input type="date" className="input" value={form.expectedDeliveryDate} onChange={e => setForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Notas</label><input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              {form.lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select className="input" value={l.ingredientId} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, ingredientId: e.target.value} : x) }))}>
                    <option value="">Ingrediente...</option>
                    {ingredients?.data?.map((ing: any) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                  </select>
                  <input type="number" className="input w-28" placeholder="Cantidad" min={0} value={l.quantity} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, quantity: parseFloat(e.target.value)||0} : x) }))} />
                  <input type="number" className="input w-32" placeholder="Precio unit. S/" min={0} step="0.01" value={l.unitPricePen} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, unitPricePen: parseFloat(e.target.value)||0} : x) }))} />
                </div>
              ))}
              <button className="text-sm text-brand-600 hover:underline" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, { ingredientId: '', quantity: 1, unitPricePen: 0 }] }))}>+ Línea</button>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={!form.supplierId} onClick={() => createPO.mutate(form)}>Crear OC</button>
                <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </div>
          )}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2"><ClipboardList size={18} className="text-gray-400" /><h2 className="font-semibold">Órdenes de compra</h2></div>
            {loadPO ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
              <div className="table-container">
              <table className="w-full text-sm"><thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide"><tr>
                <th className="px-5 py-3 text-left">Nro. OC</th><th className="px-5 py-3 text-left">Proveedor</th><th className="px-5 py-3 text-right">Total S/</th><th className="px-5 py-3 text-left">Estado</th><th className="px-5 py-3 text-center">Aprobar</th>
              </tr></thead><tbody className="divide-y divide-gray-100">
                {pos?.data?.map((po: any) => (
                  <tr key={po.id} className="table-row-hover">
                    <td className="px-5 py-3 font-mono">{po.poNumber}</td>
                    <td className="px-5 py-3 font-medium">{po.supplier?.name}</td>
                    <td className="px-5 py-3 text-right font-mono">S/ {Number(po.totalAmountPen ?? 0).toFixed(2)}</td>
                    <td className="px-5 py-3"><StatusBadge status={po.status} /></td>
                    <td className="px-5 py-3 text-center">{po.status === 'DRAFT' && <button onClick={() => approvePO.mutate(po.id)} className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2 py-1 rounded">Aprobar</button>}</td>
                  </tr>
                ))}
              </tbody></table>
              </div>
            )}
            {!pos?.data?.length && !loadPO && <p className="text-center text-gray-400 py-8">Sin OC aún</p>}
          </div>
        </>
      )}

      {tab === 'suppliers' && (
        <>
          {showForm && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold">Nuevo proveedor</h3>
              <div className="grid grid-cols-2 gap-4">
                {[['name','Nombre'],['taxId','RUC'],['email','Email'],['phone','Teléfono'],['contactName','Contacto']].map(([k,l]) => (
                  <div key={k}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                    <input className="input" value={(supForm as any)[k]} onChange={e => setSupForm(f => ({ ...f, [k]: e.target.value }))} /></div>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => createSup.mutate(supForm)}>Guardar</button>
                <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </div>
          )}
          <div className="card overflow-hidden">
            <div className="table-container">
            <table className="w-full text-sm"><thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide"><tr>
              <th className="px-5 py-3 text-left">Proveedor</th><th className="px-5 py-3 text-left">RUC</th><th className="px-5 py-3 text-left">Email</th><th className="px-5 py-3 text-left">Contacto</th>
            </tr></thead><tbody className="divide-y divide-gray-100">
              {suppliers?.data?.map((s: any) => (
                <tr key={s.id} className="table-row-hover"><td className="px-5 py-3 font-medium">{s.name}</td><td className="px-5 py-3 font-mono text-gray-500">{s.taxId}</td><td className="px-5 py-3 text-gray-500">{s.email ?? '—'}</td><td className="px-5 py-3 text-gray-500">{s.contactName ?? '—'}</td></tr>
              ))}
            </tbody></table>
            </div>
            {!suppliers?.data?.length && !loadSup && <p className="text-center text-gray-400 py-8">Sin proveedores aún</p>}
          </div>
        </>
      )}
    </div>
  );
}
