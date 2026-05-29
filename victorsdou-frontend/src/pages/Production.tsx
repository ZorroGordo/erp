import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState, useEffect } from 'react';
import { Plus, Factory, X, CheckCircle2, Loader2, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { StatusBadge } from './Dashboard';
import toast from 'react-hot-toast';

interface BOMLine {
  id: string;
  ingredientId: string;
  ingredient: { id: string; name: string; baseUom: string; avgCostPen: string };
  qtyRequired: string;
  uom: string;
  wasteFactorPct: string;
}

interface Recipe {
  id: string;
  productId: string;
  product?: { id: string; name: string; productType?: string };
  yieldQty: string;
  yieldUom: string;
  bomLines: BOMLine[];
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  plannedQty: string;
  actualQty: string | null;
  scheduledDate: string;
  completedAt: string | null;
  recipeId: string;
  recipe?: Recipe & { product?: any };
}

const nextStatus: Record<string, string> = {
  PLANNED: 'IN_PROGRESS', DRAFT: 'IN_PROGRESS', CONFIRMED: 'IN_PROGRESS', SCHEDULED: 'IN_PROGRESS',
};

// Kanban columns — grouped production-order states. Designed to look good on a
// large bakery screen.
const KANBAN_COLUMNS: { key: string; label: string; statuses: string[]; head: string; dot: string }[] = [
  { key: 'PENDING',     label: 'Programadas',  statuses: ['DRAFT', 'PLANNED', 'CONFIRMED', 'SCHEDULED'], head: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  { key: 'IN_PROGRESS', label: 'En progreso',  statuses: ['IN_PROGRESS'],                                head: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  { key: 'COMPLETED',   label: 'Completadas',  statuses: ['COMPLETED'],                                  head: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
];

export default function Production() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [form, setForm] = useState({ recipeId: '', plannedQty: 1, scheduledDate: new Date().toISOString().slice(0, 10) });
  const [closingOrder, setClosingOrder] = useState<Order | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['production-orders'],
    queryFn: () => api.get('/v1/production/orders').then(r => r.data),
  });
  // Recipes returns ACTIVE recipes for both intermediate and finished products,
  // so this dropdown automatically covers both per the spec.
  const { data: recipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api.get('/v1/production/recipes').then(r => r.data),
  });

  const create = useMutation({
    mutationFn: (body: any) => api.post('/v1/production/orders', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production-orders'] }); toast.success('Orden creada'); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: any) => api.patch(`/v1/production/orders/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production-orders'] }); toast.success('Estado actualizado'); },
  });

  const allOrders: Order[] = orders?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Producción</h1>
          <p className="text-gray-500 text-sm">Órdenes de producción y recetas</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <LayoutGrid size={15} /> Kanban
            </button>
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${view === 'table' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <TableIcon size={15} /> Tabla
            </button>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> Nueva orden
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva orden de producción</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Receta <span className="text-gray-400">(intermedio o terminado)</span>
              </label>
              <select className="input" value={form.recipeId} onChange={e => setForm(f => ({ ...f, recipeId: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {recipes?.data?.map((r: Recipe) => {
                  const label = r.product?.name ?? r.productId;
                  const typeTag = r.product?.productType === 'INTERMEDIATE' ? ' (PI)'
                               : r.product?.productType === 'FINISHED' ? ' (PT)' : '';
                  return <option key={r.id} value={r.id}>{label}{typeTag}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad planificada</label>
              <input type="number" className="input" min={1} value={form.plannedQty}
                onChange={e => setForm(f => ({ ...f, plannedQty: parseInt(e.target.value)||1 }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha programada</label>
              <input type="date" className="input" value={form.scheduledDate}
                onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!form.recipeId} onClick={() => create.mutate({
              recipeId: form.recipeId,
              recipeVersion: 1,
              plannedQty: form.plannedQty,
              scheduledDate: form.scheduledDate,
            })}>Crear</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card p-8 text-center text-gray-400">Cargando...</div>
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KANBAN_COLUMNS.map(col => {
            const colOrders = allOrders.filter(o => col.statuses.includes(o.status));
            return (
              <div key={col.key} className="bg-gray-50 rounded-2xl border border-gray-100 flex flex-col min-h-[200px]">
                <div className={`flex items-center justify-between px-4 py-3 rounded-t-2xl ${col.head}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <span className="font-semibold text-sm">{col.label}</span>
                  </div>
                  <span className="text-xs font-bold bg-white/70 rounded-full px-2 py-0.5">{colOrders.length}</span>
                </div>
                <div className="p-3 space-y-3 flex-1 overflow-y-auto" style={{ maxHeight: '70vh' }}>
                  {colOrders.length === 0 && (
                    <p className="text-center text-gray-300 text-sm py-6">—</p>
                  )}
                  {colOrders.map(o => (
                    <div key={o.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900 leading-snug">{o.recipe?.product?.name ?? '—'}</p>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="text-[11px] font-mono text-gray-400 mt-0.5">{o.orderNumber}</p>
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">Plan</p>
                          <p className="font-semibold text-gray-700">{o.plannedQty}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">Producido</p>
                          <p className="font-semibold text-gray-700">{o.actualQty ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">Fecha</p>
                          <p className="font-semibold text-gray-700">{o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString('es-PE') : '—'}</p>
                        </div>
                      </div>
                      {(nextStatus[o.status] || (o.status !== 'COMPLETED' && o.status !== 'CANCELLED')) && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                          {nextStatus[o.status] && (
                            <button
                              onClick={() => updateStatus.mutate({ id: o.id, status: nextStatus[o.status] })}
                              className="flex-1 text-xs bg-brand-100 text-brand-700 hover:bg-brand-200 px-2 py-1.5 rounded-lg font-medium"
                            >
                              → {nextStatus[o.status].replace(/_/g, ' ')}
                            </button>
                          )}
                          {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                            <button
                              onClick={() => setClosingOrder(o)}
                              className="flex-1 text-xs bg-green-600 text-white hover:bg-green-700 px-2 py-1.5 rounded-lg font-medium"
                            >
                              Cerrar orden
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Factory size={18} className="text-gray-400" />
            <h2 className="font-semibold">Órdenes de producción</h2>
          </div>
          <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Orden #</th>
                <th className="px-5 py-3 text-left">Producto</th>
                <th className="px-5 py-3 text-right">Planificado</th>
                <th className="px-5 py-3 text-right">Producido</th>
                <th className="px-5 py-3 text-left">Fecha</th>
                <th className="px-5 py-3 text-left">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allOrders.map((o: Order) => (
                <tr key={o.id} className="table-row-hover">
                  <td className="px-5 py-3 font-mono text-gray-700 text-xs">{o.orderNumber}</td>
                  <td className="px-5 py-3 font-medium">{o.recipe?.product?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-right">{o.plannedQty}</td>
                  <td className="px-5 py-3 text-right">{o.actualQty ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString('es-PE') : '—'}</td>
                  <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3 text-center space-x-1">
                    {nextStatus[o.status] && (
                      <button
                        onClick={() => updateStatus.mutate({ id: o.id, status: nextStatus[o.status] })}
                        className="text-xs bg-brand-100 text-brand-700 hover:bg-brand-200 px-2 py-1 rounded"
                      >
                        → {nextStatus[o.status].replace(/_/g,' ')}
                      </button>
                    )}
                    {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                      <button
                        onClick={() => setClosingOrder(o)}
                        className="text-xs bg-green-600 text-white hover:bg-green-700 px-2 py-1 rounded"
                      >
                        Cerrar orden
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {!allOrders.length && <p className="text-center text-gray-400 py-8">Sin órdenes aún</p>}
        </div>
      )}

      {closingOrder && (
        <CloseOrderModal
          order={closingOrder}
          onClose={() => setClosingOrder(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['production-orders'] });
            setClosingOrder(null);
          }}
        />
      )}
    </div>
  );
}

// ── Lote (batch) picker for a single materia prima / intermedio ──────────────
interface Batch { id: string; supplierLotNo: string | null; qtyRemaining: string; expiryDate: string | null; receivedDate: string; }
function BatchSelect({ ingredientId, value, onSelect }: { ingredientId: string; value?: string; onSelect: (batchId: string, label: string) => void }) {
  const { data } = useQuery({
    queryKey: ['ingredient-batches', ingredientId],
    queryFn: () => api.get(`/v1/inventory/ingredients/${ingredientId}/batches`).then(r => r.data),
    staleTime: 30_000,
  });
  const batches: Batch[] = data?.data ?? [];
  return (
    <select
      className="input font-mono text-xs w-full"
      value={value ?? ''}
      onChange={e => {
        const b = batches.find(x => x.id === e.target.value);
        onSelect(e.target.value, b?.supplierLotNo ?? '');
      }}
    >
      <option value="">— Elegir lote —</option>
      {batches.map(b => (
        <option key={b.id} value={b.id}>
          {(b.supplierLotNo || 'sin lote')} · {Number(b.qtyRemaining).toFixed(1)} disp.{b.expiryDate ? ` · vence ${new Date(b.expiryDate).toLocaleDateString('es-PE')}` : ''}
        </option>
      ))}
      {batches.length === 0 && <option value="" disabled>(sin lotes en inventario)</option>}
    </select>
  );
}

// ── Close order modal ───────────────────────────────────────────────────────
function CloseOrderModal({ order, onClose, onSuccess }: { order: Order; onClose: () => void; onSuccess: () => void }) {
  // Fetch BOM for the recipe
  const { data: bomData } = useQuery({
    queryKey: ['recipe-bom', order.recipeId],
    queryFn: () => api.get(`/v1/production/recipes/${order.recipeId}/bom`).then(r => r.data),
  });

  const recipe: Recipe | null = bomData?.data ?? null;
  const yieldQty = recipe ? Number(recipe.yieldQty) || 1 : 1;
  const scale = Number(order.plannedQty) / yieldQty;

  // Local form state — initialized once the BOM loads
  const [actualYieldQty, setActualYieldQty] = useState<string>(String(order.plannedQty));
  const [completedAt, setCompletedAt] = useState<string>(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    // Datetime-local needs YYYY-MM-DDTHH:mm
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return iso;
  });
  const [finishedLotNumber, setFinishedLotNumber] = useState('');
  const [finishedExpiryDate, setFinishedExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [consumptions, setConsumptions] = useState<Record<string, { actualQty: string; lotNumber: string; batchId: string; manual: boolean }>>({});

  // Auto-fill each line's consumption from the recipe, scaled to the units actually
  // produced. Re-scales when the produced quantity changes, but never overwrites a
  // line the user edited by hand (so over/under-use can still be tracked).
  useEffect(() => {
    if (!recipe) return;
    const producedScale = (Number(actualYieldQty) || 0) / yieldQty;
    setConsumptions(prev => {
      const next = { ...prev };
      recipe.bomLines.forEach(l => {
        const perBatch = Number(l.qtyRequired) * (1 + Number(l.wasteFactorPct) / 100) * producedScale;
        const existing = next[l.ingredientId];
        if (!existing) {
          next[l.ingredientId] = { actualQty: perBatch.toFixed(3), lotNumber: '', batchId: '', manual: false };
        } else if (!existing.manual) {
          next[l.ingredientId] = { ...existing, actualQty: perBatch.toFixed(3) };
        }
      });
      return next;
    });
  }, [recipe?.id, actualYieldQty]);

  const close = useMutation({
    mutationFn: (body: any) => api.post(`/v1/production/orders/${order.id}/close`, body),
    onSuccess: (resp: any) => {
      const c = resp.data?.data?.cost;
      toast.success(`Orden cerrada. Costo unitario: S/ ${c?.unitCost ?? '—'}`);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Error al cerrar orden'),
  });

  const canSubmit = recipe && Number(actualYieldQty) > 0 && completedAt;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Cerrar orden de producción</h2>
            <p className="text-xs text-gray-500">{order.orderNumber} — {order.recipe?.product?.name ?? ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!recipe ? (
            <div className="text-center text-gray-400 py-8">Cargando receta…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad real producida <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" className="input font-mono"
                    value={actualYieldQty}
                    onChange={e => setActualYieldQty(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha y hora real de término <span className="text-red-500">*</span></label>
                  <input type="datetime-local" className="input"
                    value={completedAt} onChange={e => setCompletedAt(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Lote producto terminado</label>
                  <input className="input font-mono" placeholder="L-2026-001"
                    value={finishedLotNumber} onChange={e => setFinishedLotNumber(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vencimiento producto terminado</label>
                  <input type="date" className="input"
                    value={finishedExpiryDate} onChange={e => setFinishedExpiryDate(e.target.value)} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Consumo real de materias primas</h3>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Materia prima</th>
                      <th className="px-3 py-2 text-right">Planeado</th>
                      <th className="px-3 py-2 text-right">Cant. real</th>
                      <th className="px-3 py-2 text-left">Lote utilizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recipe.bomLines.map(l => {
                      const planned = Number(l.qtyRequired) * (1 + Number(l.wasteFactorPct) / 100) * scale;
                      const c = consumptions[l.ingredientId] ?? { actualQty: '', lotNumber: '', batchId: '', manual: false };
                      return (
                        <tr key={l.id}>
                          <td className="px-3 py-2 font-medium">{l.ingredient.name}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-500 text-xs">
                            {planned.toFixed(3)} {l.uom}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" min="0" step="0.001"
                              className="input font-mono text-right w-28"
                              value={c.actualQty}
                              onChange={e => setConsumptions(p => ({ ...p, [l.ingredientId]: { ...c, actualQty: e.target.value, manual: true } }))} />
                          </td>
                          <td className="px-3 py-2 w-56">
                            <BatchSelect
                              ingredientId={l.ingredientId}
                              value={c.batchId}
                              onSelect={(batchId, label) => setConsumptions(p => ({ ...p, [l.ingredientId]: { ...c, batchId, lotNumber: label } }))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 mt-1">El lote elegido se descuenta de su saldo en inventario.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones de la corrida" />
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button
            disabled={!canSubmit || close.isPending}
            onClick={() => close.mutate({
              completedAt: new Date(completedAt).toISOString(),
              actualYieldQty: Number(actualYieldQty),
              finishedLotNumber: finishedLotNumber || undefined,
              finishedExpiryDate: finishedExpiryDate || undefined,
              notes: notes || undefined,
              consumptions: Object.entries(consumptions)
                .map(([ingredientId, v]) => ({
                  ingredientId,
                  actualQty: Number(v.actualQty) || 0,
                  lotNumber: v.lotNumber || undefined,
                  batchId: v.batchId || undefined,
                }))
                .filter(c => c.actualQty > 0),
            })}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {close.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Cerrar orden
          </button>
        </div>
      </div>
    </div>
  );
}
