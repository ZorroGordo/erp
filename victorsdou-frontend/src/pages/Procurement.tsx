import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Plus, ClipboardList, Pencil } from 'lucide-react';
import { StatusBadge } from './Dashboard';
import toast from 'react-hot-toast';
import { fmtNum } from '../lib/fmt';
import { RucLookupInput } from '../components/RucLookupInput';
import type { RucResult } from '../components/RucLookupInput';

interface SupForm {
  businessName: string; ruc: string; email: string; phone: string;
  contactName: string; address: string; paymentTermsDays: number;
  paymentMethod: string; currency: string; bankName: string;
  bankAccount: string; notes: string;
}

const EMPTY: SupForm = {
  businessName: '', ruc: '', email: '', phone: '', contactName: '',
  address: '', paymentTermsDays: 30, paymentMethod: 'TRANSFERENCIA',
  currency: 'PEN', bankName: '', bankAccount: '', notes: '',
};

function SupplierFormModal({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!initial;
  const [form, setForm] = useState<SupForm>(initial ? {
    businessName: initial.businessName ?? '',
    ruc: initial.ruc ?? '',
    email: initial.email ?? '',
    phone: initial.phone ?? '',
    contactName: initial.contactName ?? '',
    address: initial.address ?? '',
    paymentTermsDays: initial.paymentTermsDays ?? 30,
    paymentMethod: initial.paymentMethod ?? 'TRANSFERENCIA',
    currency: initial.currency ?? 'PEN',
    bankName: initial.bankName ?? '',
    bankAccount: initial.bankAccount ?? '',
    notes: initial.notes ?? '',
  } : { ...EMPTY });
  const qc = useQueryClient();
  const saveMut = useMutation({
    mutationFn: (b: any) => isEdit
      ? api.patch(`/v1/procurement/suppliers/${initial.id}`, b)
      : api.post('/v1/procurement/suppliers', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(isEdit ? 'Proveedor actualizado' : 'Proveedor creado');
      onSaved();
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });
  const set = (k: keyof SupForm) => (v: any) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold">{isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
      <RucLookupInput
        docType="RUC"
        value={form.ruc}
        onChange={set('ruc')}
        onFound={(data) => {
          const r = data as RucResult;
          setForm(f => ({ ...f, businessName: r.razonSocial ?? f.businessName,
            address: [r.direccion, r.distrito, r.provincia, r.departamento].filter(Boolean).join(', ') }));
        }}
        disabled={isEdit}
        label="RUC"
      />
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Razón Social *</label>
          <input className="input" value={form.businessName} onChange={e => set('businessName')(e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input className="input" type="email" value={form.email} onChange={e => set('email')(e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
          <input className="input" value={form.phone} onChange={e => set('phone')(e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Contacto</label>
          <input className="input" value={form.contactName} onChange={e => set('contactName')(e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
          <input className="input" value={form.address} onChange={e => set('address')(e.target.value)} /></div>
      </div>
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Condiciones de pago</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Días de crédito</label>
            <input className="input" type="number" min={0} value={form.paymentTermsDays} onChange={e => set('paymentTermsDays')(parseInt(e.target.value)||0)} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
            <select className="input" value={form.paymentMethod} onChange={e => set('paymentMethod')(e.target.value)}>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CHEQUE">Cheque</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="OTRO">Otro</option>
            </select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
            <select className="input" value={form.currency} onChange={e => set('currency')(e.target.value)}>
              <option value="PEN">Soles (PEN)</option>
              <option value="USD">Dólares (USD)</option>
            </select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Banco</label>
            <input className="input" value={form.bankName} onChange={e => set('bankName')(e.target.value)} /></div>
          <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Cuenta / CCI</label>
            <input className="input font-mono" value={form.bankAccount} onChange={e => set('bankAccount')(e.target.value)} /></div>
          <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes')(e.target.value)} /></div>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!form.businessName || !form.ruc} onClick={() => saveMut.mutate(form)}>
          {saveMut.isPending ? 'Guardando...' : 'Guardar'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

export default function Procurement() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'po'|'suppliers'>('po');
  const [showSupForm, setShowSupForm] = useState(false);
  const [editingSup, setEditingSup] = useState<any>(null);
  const [showPOForm, setShowPOForm] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: '', expectedDeliveryDate: '', notes: '', lines: [{ ingredientId: '', quantity: 1, unitPricePen: 0 }] });
  const { data: pos, isLoading: loadPO } = useQuery({ queryKey: ['pos'], queryFn: () => api.get('/v1/procurement/purchase-orders').then(r => r.data) });
  const { data: suppliers, isLoading: loadSup } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/v1/procurement/suppliers').then(r => r.data) });
  const { data: ingredients } = useQuery({ queryKey: ['ingredients'], queryFn: () => api.get('/v1/inventory/ingredients').then(r => r.data) });
  const approvePO = useMutation({
    mutationFn: (id: string) => api.patch(`/v1/procurement/purchase-orders/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); toast.success('OC aprobada'); }
  });
  const createPO = useMutation({
    mutationFn: (b: any) => api.post('/v1/procurement/purchase-orders', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); toast.success('OC creada'); setShowPOForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error')
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Compras</h1><p className="text-gray-500 text-sm">Compras y proveedores</p></div>
        {tab === 'po' && <button className="btn-primary flex items-center gap-2" onClick={() => setShowPOForm(v => !v)}><Plus size={16} /> Nueva OC</button>}
        {tab === 'suppliers' && <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingSup(null); setShowSupForm(true); }}><Plus size={16} /> Nuevo proveedor</button>}
      </div>
      <div className="flex gap-2 border-b border-gray-200">
        {(['po', 'suppliers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab===t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'po' ? 'îrdenes de compra' : 'Proveedores'}
          </button>
        ))}
      </div>
      {tab === 'po' && (
        <>
          {showPOForm && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold">Nueva OC</h3>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                  <select className="input" value={poForm.supplierId} onChange={e => setPoForm(f => ({ ...f, supplierId: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {suppliers?.data?.map((s: any) => <option key={s.id} value={s.id}>{s.businessName}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha entrega</label>
                  <input type="date" className="input" value={poForm.expectedDeliveryDate} onChange={e => setPoForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                  <input className="input" value={poForm.notes} onChange={e => setPoForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              {poForm.lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select className="input" value={l.ingredientId} onChange={e => setPoForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, ingredientId: e.target.value} : x) }))}>
                    <option value="">Ingrediente...</option>
                    {ingredients?.data?.map((ing: any) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                  </select>
                  <input type="number" className="input w-28" placeholder="Cantidad" min={0} value={l.quantity} onChange={e => setPoForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, quantity: parseFloat(e.target.value)||0} : x) }))} />
                  <input type="number" className="input w-32" placeholder="Precio S/" min={0} step="0.01" value={l.unitPricePen} onChange={e => setPoForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, unitPricePen: parseFloat(e.target.value)||0} : x) }))} />
                </div>
              ))}
              <button className="text-sm text-brand-600 hover:underline" onClick={() => setPoForm(f => ({ ...f, lines: [...f.lines, { ingredientId: '', quantity: 1, unitPricePen: 0 }] }))}>+ Línea</button>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={!poForm.supplierId} onClick={() => createPO.mutate(poForm)}>Crear OC</button>
                <button className="btn-secondary" onClick={() => setShowPOForm(false)}>Cancelar</button>
              </div>
            </div>
          )}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2"><ClipboardList size={18} className="text-gray-400" /><h2 className="font-semibold">îrdenes de compra</h2></div>
            {loadPO ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
              <div className="table-container">
                <table className="w-full text-sm"><thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide"><tr>
                  <th className="px-5 py-3 text-left">Nro. OC</th>
                  <th className="px-5 py-3 text-left">Proveedor</th>
                  <th className="px-5 py-3 text-right">Total S/</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3 text-center">Aprobar</th>
                </tr></thead><tbody className="divide-y divide-gray-100">
                  {pos?.data?.map((po: any) => (
                    <tr key={po.id} className="table-row-hover">
                      <td className="px-5 py-3 font-mono">{po.poNumber}</td>
                      <td className="px-5 py-3 font-medium">{po.supplier?.businessName}</td>
                      <td className="px-5 py-3 text-right font-mono">S/ {fmtNum(po.totalPen ?? 0)}</td>
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
          {showSupForm && <SupplierFormModal initial={editingSup} onClose={() => { setShowSupForm(false); setEditingSup(null); }} onSaved={() => { setShowSupForm(false); setEditingSup(null); }} />}
          <div className="card overflow-hidden">
            <div className="table-container">
              <table className="w-full text-sm"><thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide"><tr>
                <th className="px-5 py-3 text-left">Razón Social</th>
                <th className="px-5 py-3 text-left">RUC</th>
                <th className="px-5 py-3 text-left">Contacto</th>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-center">Crédito</th>
                <th className="px-5 py-3 text-left">Método pago</th>
                <th className="px-5 py-3 text-left">Banco</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr></thead><tbody className="divide-y divide-gray-100">
                {suppliers?.data?.map((s: any) => (
                  <tr key={s.id} className="table-row-hover">
                    <td className="px-5 py-3 font-medium">{s.businessName}</td>
                    <td className="px-5 py-3 font-mono text-gray-500">{s.ruc}</td>
                    <td className="px-5 py-3 text-gray-500">{s.contactName ?? 'Ñ'}</td>
                    <td className="px-5 py-3 text-gray-500">{s.email ?? 'Ñ'}</td>
                    <td className="px-5 py-3 text-center text-gray-500">{s.paymentTermsDays ?? 30}d</td>
                    <td className="px-5 py-3 text-gray-500">{s.paymentMethod ?? 'Ñ'}</td>
                    <td className="px-5 py-3 text-gray-500">{s.bankName ?? 'Ñ'}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => { setEditingSup(s); setShowSupForm(true); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-brand-600 transition-colors"><Pencil size={14} /></button>
                    </td>
                  </tr>
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
