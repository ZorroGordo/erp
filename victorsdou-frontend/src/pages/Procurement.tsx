import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Plus, ClipboardList, Pencil, Eye, FileDown, X, PackageCheck, Loader2 } from 'lucide-react';
import { StatusBadge } from './Dashboard';
import toast from 'react-hot-toast';
import { fmtNum } from '../lib/fmt';
import { RucLookupInput } from '../components/RucLookupInput';
import type { RucResult } from '../components/RucLookupInput';

interface SupForm {
  businessName: string; ruc: string; email: string; phone: string;
  contactName: string; address: string; paymentTermsDays: number;
  paymentMethod: string; currency: string; bankName: string;
  bankAccount: string; cci: string; creditLimit: string;
  paymentDayOfMonth: string; requiresDetraccion: boolean;
  detraccionRate: string; notes: string;
}

const EMPTY: SupForm = {
  businessName: '', ruc: '', email: '', phone: '', contactName: '',
  address: '', paymentTermsDays: 30, paymentMethod: 'TRANSFERENCIA',
  currency: 'PEN', bankName: '', bankAccount: '', cci: '',
  creditLimit: '', paymentDayOfMonth: '', requiresDetraccion: false,
  detraccionRate: '', notes: '',
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
    cci: initial.cci ?? '',
    creditLimit: initial.creditLimit != null ? String(initial.creditLimit) : '',
    paymentDayOfMonth: initial.paymentDayOfMonth ?? '',
    requiresDetraccion: initial.requiresDetraccion ?? false,
    detraccionRate: initial.detraccionRate != null ? String(initial.detraccionRate) : '',
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
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Día fijo de pago</label>
            <input className="input" placeholder="ej. 15, fin de mes" value={form.paymentDayOfMonth} onChange={e => set('paymentDayOfMonth')(e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
            <select className="input" value={form.paymentMethod} onChange={e => set('paymentMethod')(e.target.value)}>
              <option value="TRANSFERENCIA">Transferencia bancaria</option>
              <option value="CHEQUE">Cheque</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="OTRO">Otro</option>
            </select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Límite de crédito (S/)</label>
            <input className="input" type="number" min={0} step={0.01} placeholder="Sin límite" value={form.creditLimit} onChange={e => set('creditLimit')(e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
            <select className="input" value={form.currency} onChange={e => set('currency')(e.target.value)}>
              <option value="PEN">Soles (PEN)</option>
              <option value="USD">Dólares (USD)</option>
            </select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Banco</label>
            <input className="input" placeholder="BCP, Interbank, BBVA…" value={form.bankName} onChange={e => set('bankName')(e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">N° de cuenta</label>
            <input className="input font-mono" placeholder="Número de cuenta" value={form.bankAccount} onChange={e => set('bankAccount')(e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">CCI (20 dígitos)</label>
            <input className="input font-mono" placeholder="00200000000000000000" maxLength={20} value={form.cci} onChange={e => set('cci')(e.target.value.replace(/\D/g, ''))} /></div>
        </div>
      </div>
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Retenciones (Perú)</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => set('requiresDetraccion')(!form.requiresDetraccion)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${form.requiresDetraccion ? 'bg-brand-600' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.requiresDetraccion ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <label className="text-sm text-gray-700 cursor-pointer" onClick={() => set('requiresDetraccion')(!form.requiresDetraccion)}>
              Sujeto a detracción (SPOT)
            </label>
          </div>
          {form.requiresDetraccion && (
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Tasa de detracción (%)</label>
              <input className="input" type="number" min={0} max={100} step={0.1} placeholder="ej. 12" value={form.detraccionRate} onChange={e => set('detraccionRate')(e.target.value)} /></div>
          )}
        </div>
      </div>
      <div className="border-t border-gray-100 pt-4">
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
          <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes')(e.target.value)} /></div>
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

import { ExcelDownloadButton } from '../components/ExcelDownloadButton';

interface POLineForm { ingredientId: string; quantity: number; uom: string; unitPricePen: number }
interface POForm {
  supplierId: string; currency: string; exchangeRate: string;
  expectedDeliveryDate: string; notes: string; lines: POLineForm[];
}

// ── ReceivePOModal ────────────────────────────────────────────────────────────
// Ingest an approved OC into inventory in one step: pick the almacén, confirm the
// quantities (defaulting to what's still pending), and optionally record lote +
// vencimiento per line. Posts to /purchase-orders/:id/receive which registers the
// stock movements (WAC) and moves the OC to Recibida.
function ReceivePOModal({ po, onClose, onSuccess }: { po: any; onClose: () => void; onSuccess: () => void }) {
  const { data: warehousesResp } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/v1/inventory/warehouses').then(r => r.data),
  });
  const warehouses: any[] = warehousesResp?.data ?? [];
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  // Per-line editable state keyed by line id: qty pending, lote, vencimiento.
  const [rows, setRows] = useState<Record<string, { qty: string; lot: string; expiry: string }>>(() => {
    const init: Record<string, { qty: string; lot: string; expiry: string }> = {};
    for (const l of (po.lines ?? [])) {
      const remaining = Number(l.qtyOrdered ?? l.quantity ?? 0) - Number(l.qtyReceived ?? 0);
      init[l.id] = { qty: String(remaining > 0 ? remaining : 0), lot: '', expiry: '' };
    }
    return init;
  });
  // Default the almacén to the first one once the list loads.
  if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].id);

  const setRow = (id: string, k: 'qty' | 'lot' | 'expiry') => (v: string) =>
    setRows(r => ({ ...r, [id]: { ...r[id], [k]: v } }));

  const receive = useMutation({
    mutationFn: (b: any) => api.post(`/v1/procurement/purchase-orders/${po.id}/receive`, b),
    onSuccess: () => { toast.success('Stock ingresado a inventario'); onSuccess(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? e.response?.data?.message ?? 'Error al ingresar stock'),
  });

  // A perishable line must carry a vencimiento (mirrors the manual entry rule).
  const missingExpiry = (po.lines ?? []).some((l: any) =>
    l.ingredient?.isPerishable && Number(rows[l.id]?.qty) > 0 && !rows[l.id]?.expiry);
  const anyQty = (po.lines ?? []).some((l: any) => Number(rows[l.id]?.qty) > 0);
  const canSave = !!warehouseId && anyQty && !missingExpiry;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-brand-600" />
            <div>
              <h2 className="font-bold text-gray-900">Dar ingreso al stock</h2>
              <p className="text-xs text-gray-400 font-mono">{po.poNumber} · {po.supplier?.businessName ?? ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Almacén <span className="text-red-500">*</span></label>
              <select className="input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <input className="input" value={notes} placeholder="Opcional" onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Ítem</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-left">Lote</th>
                  <th className="px-3 py-2 text-left">Vencimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(po.lines ?? []).map((l: any) => {
                  const remaining = Number(l.qtyOrdered ?? l.quantity ?? 0) - Number(l.qtyReceived ?? 0);
                  const perishable = !!l.ingredient?.isPerishable;
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        {l.ingredient?.name ?? l.ingredientId}
                        {remaining < Number(l.qtyOrdered ?? 0) && <span className="block text-[10px] text-gray-400">Pendiente: {fmtNum(remaining)} {l.uom}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={0} step="0.01" className="input w-24 text-right font-mono"
                          value={rows[l.id]?.qty ?? ''} onChange={e => setRow(l.id, 'qty')(e.target.value)} />
                        <span className="text-[10px] text-gray-400 ml-1">{l.uom}</span>
                      </td>
                      <td className="px-3 py-2">
                        <input className="input w-28 font-mono" placeholder="Opcional"
                          value={rows[l.id]?.lot ?? ''} onChange={e => setRow(l.id, 'lot')(e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="date" className="input w-36"
                          value={rows[l.id]?.expiry ?? ''} onChange={e => setRow(l.id, 'expiry')(e.target.value)} />
                        {perishable && Number(rows[l.id]?.qty) > 0 && !rows[l.id]?.expiry && <span className="block text-[10px] text-red-500">Requerido</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">El costo de cada línea se toma de la OC (convertido a soles) y actualiza el costo promedio (WAC) del inventario.</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 rounded-xl">Cancelar</button>
          <button
            disabled={!canSave || receive.isPending}
            onClick={() => receive.mutate({
              warehouseId,
              notes: notes.trim() || undefined,
              lines: (po.lines ?? []).map((l: any) => ({
                lineId: l.id,
                qtyReceived: Number(rows[l.id]?.qty) || 0,
                lotNumber: rows[l.id]?.lot?.trim() || undefined,
                expiryDate: rows[l.id]?.expiry || undefined,
              })).filter((x: any) => x.qtyReceived > 0),
            })}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {receive.isPending && <Loader2 size={14} className="animate-spin" />}
            <PackageCheck size={14} /> Confirmar ingreso
          </button>
        </div>
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
  const [editingPOId, setEditingPOId] = useState<string | null>(null);
  const [viewingPO, setViewingPO] = useState<any>(null);
  const [receivingPO, setReceivingPO] = useState<any>(null);
  const RECEIVABLE_STATUSES = ['APPROVED', 'SENT', 'PARTIAL_RECEIVED'];
  const EMPTY_PO: POForm = { supplierId: '', currency: 'PEN', exchangeRate: '', expectedDeliveryDate: '', notes: '', lines: [{ ingredientId: '', quantity: 1, uom: '', unitPricePen: 0 }] };
  const [poForm, setPoForm] = useState<POForm>(EMPTY_PO);
  const UOM_OPTIONS = ['kg', 'g', 'l', 'ml', 'unidad', 'caja', 'saco', 'bolsa', 'paquete'];
  const openNewPO = () => { setEditingPOId(null); setPoForm(EMPTY_PO); setShowPOForm(true); };
  const openEditPO = (po: any) => {
    setEditingPOId(po.id);
    setPoForm({
      supplierId: po.supplierId ?? po.supplier?.id ?? '',
      currency: po.currency ?? 'PEN',
      exchangeRate: po.exchangeRate != null && Number(po.exchangeRate) !== 1 ? String(po.exchangeRate) : '',
      expectedDeliveryDate: po.expectedDeliveryDate ? String(po.expectedDeliveryDate).slice(0, 10) : '',
      notes: po.notes ?? '',
      lines: (po.lines ?? []).map((l: any) => ({
        ingredientId: l.ingredientId,
        quantity: Number(l.qtyOrdered ?? l.quantity ?? 0),
        uom: l.uom ?? '',
        unitPricePen: Number(l.unitPrice ?? l.unitPricePen ?? 0),
      })),
    });
    setShowPOForm(true);
  };
  const { data: pos, isLoading: loadPO } = useQuery({ queryKey: ['pos'], queryFn: () => api.get('/v1/procurement/purchase-orders').then(r => r.data) });
  const { data: suppliers, isLoading: loadSup } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/v1/procurement/suppliers').then(r => r.data) });
  const { data: ingredients } = useQuery({ queryKey: ['ingredient-master'], queryFn: () => api.get('/v1/inventory/ingredient-master').then(r => r.data) });
  const approvePO = useMutation({
    mutationFn: (id: string) => api.patch(`/v1/procurement/purchase-orders/${id}/approve`, { approved: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); toast.success('OC aprobada'); }
  });
  const createPO = useMutation({
    mutationFn: (b: any) => editingPOId
      ? api.patch(`/v1/procurement/purchase-orders/${editingPOId}`, b)
      : api.post('/v1/procurement/purchase-orders', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos'] }); toast.success(editingPOId ? 'OC actualizada' : 'OC creada'); setShowPOForm(false); setEditingPOId(null); setPoForm(EMPTY_PO); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? e.response?.data?.message ?? 'Error')
  });

  const ingName = (id: string) => ingredients?.data?.find((x: any) => x.id === id)?.name ?? id;
  const supName = (po: any) => po.supplier?.businessName ?? suppliers?.data?.find((s: any) => s.id === po.supplierId)?.businessName ?? '';
  const supRuc  = (po: any) => po.supplier?.ruc ?? suppliers?.data?.find((s: any) => s.id === po.supplierId)?.ruc ?? '';

  // Open a print-ready window for an approved OC so the user can send / save it
  // as a PDF for the supplier (mirrors the batch-card print flow in Production).
  const printPO = (po: any) => {
    const cur = po.currency && po.currency !== 'PEN' ? po.currency : 'PEN';
    const rate = Number(po.exchangeRate) || 1;
    const money = (n: number) => 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = (po.lines ?? []).map((l: any) => {
      const qty = Number(l.qtyOrdered ?? l.quantity ?? 0);
      const price = Number(l.unitPrice ?? l.unitPricePen ?? 0);
      const lineSoles = Number(l.lineTotalPen ?? qty * price * rate);
      return `<tr>
        <td>${l.ingredient?.name ?? ingName(l.ingredientId)}</td>
        <td style="text-align:right">${qty.toLocaleString('es-PE')}</td>
        <td style="text-align:center">${l.uom ?? ''}</td>
        <td style="text-align:right">${cur === 'PEN' ? 'S/' : cur} ${price.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right">${money(lineSoles)}</td>
      </tr>`;
    }).join('');
    const deliv = po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('es-PE') : '—';
    const created = po.orderedAt || po.createdAt ? new Date(po.orderedAt ?? po.createdAt).toLocaleDateString('es-PE') : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${po.poNumber}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;padding:32px;max-width:800px;margin:0 auto}
        h1{font-size:20px;margin:0 0 2px} .muted{color:#6b7280;font-size:12px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #b45309;padding-bottom:12px;margin-bottom:16px}
        .brand{font-size:22px;font-weight:800;color:#b45309}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
        th{background:#fdf3e7;color:#92400e;text-align:left;padding:8px;font-size:11px;text-transform:uppercase}
        td{padding:8px;border-bottom:1px solid #eee}
        .totals{margin-top:12px;margin-left:auto;width:260px;font-size:13px}
        .totals div{display:flex;justify-content:space-between;padding:4px 0}
        .totals .grand{border-top:2px solid #b45309;font-weight:700;font-size:15px;padding-top:8px}
        .info{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;margin-bottom:8px}
        .info b{color:#374151}
      </style></head><body>
      <div class="head">
        <div><div class="brand">Victorsdou</div><div class="muted">Orden de Compra</div></div>
        <div style="text-align:right"><h1>${po.poNumber}</h1><div class="muted">Emitida: ${created}</div></div>
      </div>
      <div class="info">
        <div><b>Proveedor:</b> ${supName(po)}</div>
        <div><b>RUC:</b> ${supRuc(po)}</div>
        <div><b>Fecha de entrega:</b> ${deliv}</div>
        <div><b>Moneda:</b> ${cur}${cur !== 'PEN' ? ` (TC ${rate.toFixed(4)})` : ''}</div>
      </div>
      <table><thead><tr><th>Ítem</th><th style="text-align:right">Cantidad</th><th style="text-align:center">UoM</th><th style="text-align:right">Precio</th><th style="text-align:right">Total S/</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <div class="totals">
        <div><span>Subtotal</span><span>${money(po.subtotalPen ?? 0)}</span></div>
        <div><span>IGV 18%</span><span>${money(po.igvPen ?? 0)}</span></div>
        <div class="grand"><span>Total</span><span>${money(po.totalPen ?? 0)}</span></div>
      </div>
      ${po.notes ? `<p class="muted" style="margin-top:16px"><b>Notas:</b> ${po.notes}</p>` : ''}
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    else toast.error('Habilita las ventanas emergentes para descargar el PDF');
  };

  return (
    <div className="space-y-6">
      {receivingPO && (
        <ReceivePOModal
          po={receivingPO}
          onClose={() => setReceivingPO(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['pos'] });
            qc.invalidateQueries({ queryKey: ['inventory-dashboard'] });
            qc.invalidateQueries({ queryKey: ['reorder-alerts'] });
            qc.invalidateQueries({ queryKey: ['expiry-alerts'] });
          }}
        />
      )}
      {viewingPO && (() => {
        const po = viewingPO;
        const cur = po.currency && po.currency !== 'PEN' ? po.currency : 'PEN';
        const rate = Number(po.exchangeRate) || 1;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setViewingPO(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-900 font-mono">{po.poNumber}</h2>
                  <p className="text-xs text-gray-400">{po.supplier?.businessName} · <StatusBadge status={po.status} /></p>
                </div>
                <button onClick={() => setViewingPO(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-400">Proveedor:</span> <span className="font-medium">{supName(po)}</span></div>
                  <div><span className="text-gray-400">RUC:</span> <span className="font-mono">{supRuc(po)}</span></div>
                  <div><span className="text-gray-400">Fecha entrega:</span> {po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('es-PE') : '—'}</div>
                  <div><span className="text-gray-400">Moneda:</span> {cur}{cur !== 'PEN' && <span className="text-gray-400"> (TC {rate.toFixed(4)})</span>}</div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                      <tr><th className="px-3 py-2 text-left">Ítem</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-center">UoM</th><th className="px-3 py-2 text-right">Precio {cur === 'PEN' ? 'S/' : cur}</th><th className="px-3 py-2 text-right">Total S/</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(po.lines ?? []).map((l: any, i: number) => {
                        const qty = Number(l.qtyOrdered ?? l.quantity ?? 0);
                        const price = Number(l.unitPrice ?? l.unitPricePen ?? 0);
                        return (
                          <tr key={i}>
                            <td className="px-3 py-2">{l.ingredient?.name ?? ingName(l.ingredientId)}</td>
                            <td className="px-3 py-2 text-right">{fmtNum(qty)}</td>
                            <td className="px-3 py-2 text-center text-gray-500">{l.uom}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmtNum(price)}</td>
                            <td className="px-3 py-2 text-right font-mono">S/ {fmtNum(l.lineTotalPen ?? qty * price * rate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="ml-auto w-56 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono">S/ {fmtNum(po.subtotalPen ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">IGV 18%</span><span className="font-mono">S/ {fmtNum(po.igvPen ?? 0)}</span></div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold"><span>Total</span><span className="font-mono">S/ {fmtNum(po.totalPen ?? 0)}</span></div>
                </div>
                {po.notes && <p className="text-sm text-gray-500"><span className="text-gray-400">Notas:</span> {po.notes}</p>}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
                {po.status === 'DRAFT' && <button onClick={() => { setViewingPO(null); openEditPO(po); }} className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-xl"><Pencil size={14} /> Editar</button>}
                {RECEIVABLE_STATUSES.includes(po.status) && <button onClick={() => { setViewingPO(null); setReceivingPO(po); }} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"><PackageCheck size={14} /> Dar ingreso al stock</button>}
                {(RECEIVABLE_STATUSES.includes(po.status) || po.status === 'FULLY_RECEIVED') && <button onClick={() => printPO(po)} className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700"><FileDown size={14} /> Descargar PDF</button>}
                <button onClick={() => setViewingPO(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 rounded-xl">Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Compras</h1><p className="text-gray-500 text-sm">Compras y proveedores</p></div>
        {tab === 'po' && (
          <div className="flex items-center gap-2">
            <ExcelDownloadButton
              filename="ordenes-de-compra"
              sheetName="OC"
              data={pos?.data ?? []}
              dateField="orderedAt"
              dateLabel="Fecha de OC"
              columns={[
                { header: 'N OC', key: 'poNumber', width: 12 },
                { header: 'Proveedor', key: 'supplier.businessName', width: 28 },
                { header: 'Estado', key: 'status', width: 12 },
                { header: 'Total S/', key: 'totalAmountPen', width: 12, format: (v: any) => v != null ? Number(v) : '' },
                { header: 'Total USD', key: 'totalAmountUsd', width: 12, format: (v: any) => v != null ? Number(v) : '' },
                { header: 'F. entrega', key: 'expectedDeliveryDate', width: 16, format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
                { header: 'F. creacion', key: 'orderedAt', width: 18, format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
                { header: 'Notas', key: 'notes', width: 28 },
              ]}
              extraFilters={[
                { key: 'status', label: 'Estado', type: 'select', options: [
                  { value: 'DRAFT', label: 'Borrador' },
                  { value: 'APPROVED', label: 'Aprobada' },
                  { value: 'PARTIAL_RECEIVED', label: 'Recibida parcial' },
                  { value: 'FULLY_RECEIVED', label: 'Recibida' },
                  { value: 'CANCELLED', label: 'Cancelada' },
                ]},
              ]}
            />
            <button className="btn-primary flex items-center gap-2" onClick={openNewPO}><Plus size={16} /> Nueva OC</button>
          </div>
        )}
        {tab === 'suppliers' && (
          <div className="flex items-center gap-2">
            <ExcelDownloadButton
              filename="proveedores"
              sheetName="Proveedores"
              data={suppliers?.data ?? []}
              columns={[
                { header: 'Razon Social', key: 'businessName', width: 30 },
                { header: 'RUC', key: 'ruc', width: 14 },
                { header: 'Contacto', key: 'contactName', width: 22 },
                { header: 'Email', key: 'contactEmail', width: 28 },
                { header: 'Telefono', key: 'contactPhone', width: 14 },
                { header: 'Plazo pago (dias)', key: 'paymentTermsDays', width: 18 },
                { header: 'Metodo pago', key: 'paymentMethod', width: 16 },
                { header: 'Moneda', key: 'currency', width: 10 },
                { header: 'Banco', key: 'bankName', width: 20 },
                { header: 'Cuenta', key: 'bankAccount', width: 20 },
              ]}
            />
            <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingSup(null); setShowSupForm(true); }}><Plus size={16} /> Nuevo proveedor</button>
          </div>
        )}
      </div>
      <div className="flex gap-2 border-b border-gray-200">
        {(['po', 'suppliers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab===t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'po' ? 'Órdenes de compra' : 'Proveedores'}
          </button>
        ))}
      </div>
      {tab === 'po' && (
        <>
          {showPOForm && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold">{editingPOId ? 'Editar OC' : 'Nueva OC'}</h3>
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
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Moneda de compra</label>
                  <select className="input" value={poForm.currency} onChange={e => setPoForm(f => ({ ...f, currency: e.target.value, exchangeRate: e.target.value === 'PEN' ? '' : f.exchangeRate }))}>
                    <option value="PEN">Soles (PEN)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select></div>
                {poForm.currency !== 'PEN' && (
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Tipo de cambio (S/ por {poForm.currency})</label>
                    <input type="number" min={0} step="0.0001" className="input" placeholder="ej. 3.75" value={poForm.exchangeRate} onChange={e => setPoForm(f => ({ ...f, exchangeRate: e.target.value }))} /></div>
                )}
              </div>
              {poForm.currency !== 'PEN' && (
                <p className="text-xs text-gray-500">Los precios se ingresan en {poForm.currency}. Al recibir el stock, los montos se convierten a soles usando el tipo de cambio.</p>
              )}
              {poForm.lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select className="input" value={l.ingredientId} onChange={e => {
                    const ingId = e.target.value;
                    const ing = ingredients?.data?.find((x: any) => x.id === ingId);
                    setPoForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? { ...x, ingredientId: ingId, uom: x.uom || ing?.baseUom || '' } : x) }));
                  }}>
                    <option value="">Ingrediente...</option>
                    {ingredients?.data?.map((ing: any) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                  </select>
                  <input type="number" className="input w-24" placeholder="Cantidad" min={0} value={l.quantity} onChange={e => setPoForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, quantity: parseFloat(e.target.value)||0} : x) }))} />
                  <select className="input w-28" value={l.uom} onChange={e => setPoForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, uom: e.target.value} : x) }))} title="Unidad de compra">
                    <option value="">Unidad...</option>
                    {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    {l.uom && !UOM_OPTIONS.includes(l.uom) && <option value={l.uom}>{l.uom}</option>}
                  </select>
                  <input type="number" className="input w-32" placeholder={`Precio ${poForm.currency === 'PEN' ? 'S/' : poForm.currency}`} min={0} step="0.01" value={l.unitPricePen} onChange={e => setPoForm(f => ({ ...f, lines: f.lines.map((x,j) => j===i ? {...x, unitPricePen: parseFloat(e.target.value)||0} : x) }))} />
                </div>
              ))}
              <button className="text-sm text-brand-600 hover:underline" onClick={() => setPoForm(f => ({ ...f, lines: [...f.lines, { ingredientId: '', quantity: 1, uom: '', unitPricePen: 0 }] }))}>+ Línea</button>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={!poForm.supplierId || (poForm.currency !== 'PEN' && !(Number(poForm.exchangeRate) > 0))} onClick={() => createPO.mutate({
                  supplierId: poForm.supplierId,
                  currency: poForm.currency,
                  exchangeRate: poForm.currency === 'PEN' ? 1 : (Number(poForm.exchangeRate) || 1),
                  expectedDeliveryDate: poForm.expectedDeliveryDate || undefined,
                  notes: poForm.notes || undefined,
                  lines: poForm.lines,
                })}>{editingPOId ? 'Guardar cambios' : 'Crear OC'}</button>
                <button className="btn-secondary" onClick={() => { setShowPOForm(false); setEditingPOId(null); setPoForm(EMPTY_PO); }}>Cancelar</button>
              </div>
            </div>
          )}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2"><ClipboardList size={18} className="text-gray-400" /><h2 className="font-semibold">Órdenes de compra</h2></div>
            {loadPO ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
              <div className="table-container">
                <table className="w-full text-sm"><thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide"><tr>
                  <th className="px-5 py-3 text-left">Nro. OC</th>
                  <th className="px-5 py-3 text-left">Proveedor</th>
                  <th className="px-5 py-3 text-right">Total S/</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3 text-center">Acciones</th>
                </tr></thead><tbody className="divide-y divide-gray-100">
                  {pos?.data?.map((po: any) => (
                    <tr key={po.id} className="table-row-hover">
                      <td className="px-5 py-3 font-mono">{po.poNumber}</td>
                      <td className="px-5 py-3 font-medium">{po.supplier?.businessName}</td>
                      <td className="px-5 py-3 text-right font-mono">
                        S/ {fmtNum(po.totalPen ?? 0)}
                        {po.currency && po.currency !== 'PEN' && <span className="block text-[10px] text-gray-400">TC {po.currency} {Number(po.exchangeRate).toFixed(4)}</span>}
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={po.status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewingPO(po)} title="Ver detalle" className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-brand-600 transition-colors"><Eye size={15} /></button>
                          {po.status === 'DRAFT' && (
                            <button onClick={() => openEditPO(po)} title="Editar" className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-brand-600 transition-colors"><Pencil size={14} /></button>
                          )}
                          {po.status === 'DRAFT' && (
                            <button onClick={() => approvePO.mutate(po.id)} className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2 py-1 rounded">Aprobar</button>
                          )}
                          {RECEIVABLE_STATUSES.includes(po.status) && (
                            <button onClick={() => setReceivingPO(po)} title="Dar ingreso al stock" className="flex items-center gap-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2 py-1 rounded"><PackageCheck size={13} /> Recibir</button>
                          )}
                          {(RECEIVABLE_STATUSES.includes(po.status) || po.status === 'FULLY_RECEIVED') && (
                            <button onClick={() => printPO(po)} title="Descargar PDF" className="flex items-center gap-1 text-xs bg-brand-50 text-brand-700 hover:bg-brand-100 px-2 py-1 rounded"><FileDown size={13} /> PDF</button>
                          )}
                        </div>
                      </td>
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
