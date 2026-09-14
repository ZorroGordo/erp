import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState, useEffect } from 'react';
import { Plus, Factory, X, CheckCircle2, Loader2, LayoutGrid, Table as TableIcon, Tablet, ClipboardList, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
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

// ── Batch card (PDF via print) ───────────────────────────────────────────────
// Builds a printable batch card mirroring the "Cerrar orden" layout, with the
// real (scaled-to-planned) quantities and BLANK lot columns to fill in by hand.
async function openBatchCard(order: Order) {
  try {
    const r = await api.get(`/v1/production/recipes/${order.recipeId}/bom`);
    const recipe = r.data?.data;
    if (!recipe) { toast.error('No se pudo cargar la receta'); return; }
    const yieldQty = Number(recipe.yieldQty) || 1;
    const scale = Number(order.plannedQty) / yieldQty;
    const prodName = order.recipe?.product?.name ?? recipe.product?.name ?? '';
    // Format in UTC so a date stored at UTC-midnight isn't shifted back a day
    // when rendered in Peru's timezone (UTC-5) — the batch card must show the
    // exact scheduled date that was registered.
    const fecha = order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : '';

    // For a CLOSED order, fetch the real consumptions so the card prints the
    // actual quantities used and the LOTE UTILIZADO for each materia prima.
    let consMap: Record<string, { actualQty: number; lotNumber: string | null }> = {};
    const isClosed = order.status === 'COMPLETED';
    if (isClosed) {
      try {
        const cr = await api.get(`/v1/production/orders/${order.id}/consumptions`);
        for (const c of (cr.data?.data ?? [])) {
          consMap[c.ingredientId] = { actualQty: Number(c.actualQty) || 0, lotNumber: c.lotNumber ?? null };
        }
      } catch { /* fall back to a blank card if consumptions can't be loaded */ }
    }

    const rows = (recipe.bomLines ?? []).map((l: any) => {
      const planned = Number(l.qtyRequired) * (1 + Number(l.wasteFactorPct) / 100) * scale;
      const cons = consMap[l.ingredientId];
      const qty = cons ? cons.actualQty : planned;
      const loteCell = cons && cons.lotNumber
        ? `<td class="mono">${cons.lotNumber}</td>`
        : `<td class="blank"></td>`;
      return `<tr>
        <td>${l.ingredient?.name ?? ''}</td>
        <td class="num">${qty.toFixed(3)} ${l.uom ?? ''}</td>
        ${loteCell}
        <td class="blank"></td></tr>`;
    }).join('');
    const rendimientoReal = isClosed && order.actualQty != null ? `${Number(order.actualQty)}` : '__________';
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>Batch Card ${order.orderNumber}</title>
      <style>
        *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;}
        body{margin:24px;color:#1A1A1A;}
        h1{font-size:20px;margin:0;color:#2D6A4F;}
        .sub{color:#666;font-size:12px;margin:2px 0 16px;}
        .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 16px;margin-bottom:16px;font-size:13px;}
        .grid div span{color:#888;display:block;font-size:10px;text-transform:uppercase;letter-spacing:.04em;}
        .lote{font-family:monospace;font-size:18px;font-weight:bold;color:#2D6A4F;}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}
        th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;}
        th{background:#F5F0E8;text-transform:uppercase;font-size:10px;letter-spacing:.04em;}
        td.num{text-align:right;font-family:monospace;}
        td.mono{font-family:monospace;font-size:12px;color:#2D6A4F;}
        td.blank{height:26px;}
        .foot{margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;font-size:12px;}
        .sign{margin-top:36px;border-top:1px solid #888;padding-top:4px;color:#666;}
        @media print{body{margin:12mm;} button{display:none;}}
      </style></head><body>
      <h1>VICTORSDOU — Batch Card</h1>
      <p class="sub">Hoja de producción · cantidades para ${Number(order.plannedQty)} ${recipe.yieldUom ?? 'und'} planificadas</p>
      <div class="grid">
        <div><span>Lote / Orden</span><span class="lote">${order.orderNumber}</span></div>
        <div><span>Producto</span>${prodName}</div>
        <div><span>Línea</span>${(order as any).line ?? '—'}</div>
        <div><span>Fecha programada</span>${fecha}</div>
        <div><span>Cantidad planificada</span>${Number(order.plannedQty)}</div>
        <div><span>Rendimiento real</span>${rendimientoReal}</div>
      </div>
      <table><thead><tr>
        <th>Materia prima</th><th style="text-align:right">Cantidad</th>
        <th>Lote utilizado</th><th>Verificado</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="foot">
        <div class="sign">Preparado por</div>
        <div class="sign">Revisado por</div>
      </div>
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Permite ventanas emergentes para descargar el batch card'); return; }
    w.document.write(html);
    w.document.close();
  } catch {
    toast.error('Error al generar el batch card');
  }
}

export default function Production() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showDemanda, setShowDemanda] = useState(false);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [form, setForm] = useState({ recipeId: '', plannedQty: 1, line: 'A', scheduledDate: new Date().toISOString().slice(0, 10) });
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production-orders'] }); qc.invalidateQueries({ queryKey: ['inventory-dashboard'] }); toast.success('Estado actualizado'); },
  });

  const removeOrder = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/production/orders/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production-orders'] }); qc.invalidateQueries({ queryKey: ['inventory-dashboard'] }); toast.success('Orden eliminada'); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'No se pudo eliminar'),
  });

  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const cancelOrder = (o: Order) => {
    if (!window.confirm(`¿Cancelar la orden ${o.orderNumber}? Se liberará el stock reservado.`)) return;
    updateStatus.mutate({ id: o.id, status: 'CANCELLED' });
  };
  const deleteOrder = (o: Order) => {
    if (!window.confirm(`¿Eliminar la orden ${o.orderNumber}? Esta acción no se puede deshacer.`)) return;
    removeOrder.mutate(o.id);
  };

  const allOrders: Order[] = orders?.data ?? [];

  // Unit of measure for the planned quantity comes from the selected recipe's
  // yield unit (yieldUom) — shown next to the quantity field so the operator
  // knows what unit they're planning in.
  const selectedRecipe: Recipe | undefined = recipes?.data?.find((r: Recipe) => r.id === form.recipeId);
  const plannedUnit = selectedRecipe?.yieldUom || 'und';

  return (
    <div className="space-y-6">
      {showDemanda && (
        <DemandaModal
          onClose={() => setShowDemanda(false)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['production-orders'] }); }}
        />
      )}
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
          <Link to="/tablet" className="btn-secondary flex items-center gap-2">
            <Tablet size={16} /> Modo Tablet
          </Link>
          <button className="btn-secondary flex items-center gap-2" onClick={() => setShowDemanda(true)}>
            <ClipboardList size={16} /> Desde pedidos
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> Nueva orden
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva orden de producción</h3>
          <div className="grid grid-cols-4 gap-4">
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
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Cantidad planificada <span className="text-gray-400">({plannedUnit})</span>
              </label>
              <div className="flex">
                <input type="number" className="input rounded-r-none" min={1} value={form.plannedQty}
                  onChange={e => setForm(f => ({ ...f, plannedQty: parseInt(e.target.value)||1 }))} />
                <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-gray-200 bg-gray-50 text-gray-500 text-sm whitespace-nowrap">
                  {plannedUnit}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Línea de producción</label>
              <select className="input" value={form.line} onChange={e => setForm(f => ({ ...f, line: e.target.value }))}>
                <option value="A">Línea A</option>
                <option value="B">Línea B</option>
                <option value="C">Línea C</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha programada</label>
              <input type="date" className="input" value={form.scheduledDate}
                onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">El lote se genera automáticamente: AA + día del año + línea + Nº de batch (ej. 26001A01).</p>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!form.recipeId} onClick={() => create.mutate({
              recipeId: form.recipeId,
              recipeVersion: 1,
              plannedQty: form.plannedQty,
              line: form.line,
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
                          <p className="font-semibold text-gray-700">{o.plannedQty} <span className="text-xs font-normal text-gray-400">{o.recipe?.yieldUom ?? ''}</span></p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">Producido</p>
                          <p className="font-semibold text-gray-700">{o.actualQty ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">Fecha</p>
                          <p className="font-semibold text-gray-700">{o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : '—'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => openBatchCard(o)}
                        className="mt-3 w-full text-xs border border-brand-200 text-brand-700 hover:bg-brand-50 px-2 py-1.5 rounded-lg font-medium"
                      >
                        Batch card (PDF)
                      </button>
                      {(nextStatus[o.status] || (o.status !== 'COMPLETED' && o.status !== 'CANCELLED')) && (
                        <div className="flex gap-2 mt-2 pt-3 border-t border-gray-100">
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
                      {o.status !== 'COMPLETED' && (
                        <div className="flex gap-2 mt-2">
                          {o.status !== 'CANCELLED' && (
                            <>
                              <button
                                onClick={() => setEditingOrder(o)}
                                className="flex-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 px-2 py-1.5 rounded-lg font-medium"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => cancelOrder(o)}
                                className="flex-1 text-xs bg-amber-100 text-amber-700 hover:bg-amber-200 px-2 py-1.5 rounded-lg font-medium"
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => deleteOrder(o)}
                            className="flex-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1.5 rounded-lg font-medium"
                          >
                            Eliminar
                          </button>
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
                <th className="px-5 py-3 text-left">Unidad</th>
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
                  <td className="px-5 py-3 text-gray-500">{o.recipe?.yieldUom ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : '—'}</td>
                  <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3 text-center space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => openBatchCard(o)}
                      className="text-xs border border-brand-200 text-brand-700 hover:bg-brand-50 px-2 py-1 rounded"
                    >
                      Batch card
                    </button>
                    {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                      <button
                        onClick={() => setEditingOrder(o)}
                        className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 px-2 py-1 rounded"
                      >
                        Editar
                      </button>
                    )}
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
                    {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                      <button
                        onClick={() => cancelOrder(o)}
                        className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-200 px-2 py-1 rounded"
                      >
                        Cancelar
                      </button>
                    )}
                    {o.status !== 'COMPLETED' && (
                      <button
                        onClick={() => deleteOrder(o)}
                        className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1 rounded"
                      >
                        Eliminar
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
            qc.invalidateQueries({ queryKey: ['inventory-dashboard'] });
            setClosingOrder(null);
          }}
        />
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['production-orders'] });
            qc.invalidateQueries({ queryKey: ['inventory-dashboard'] });
            setEditingOrder(null);
          }}
        />
      )}
    </div>
  );
}

// ── Edit order modal ─────────────────────────────────────────────────────────
// Edits an open order's planned quantity, line and scheduled date. Changing the
// quantity re-reserves the BOM stock on the backend.
function EditOrderModal({ order, onClose, onSuccess }: { order: Order; onClose: () => void; onSuccess: () => void }) {
  const [plannedQty, setPlannedQty] = useState<number>(Number(order.plannedQty) || 1);
  const [line, setLine] = useState<string>((order as any).line ?? 'A');
  const [scheduledDate, setScheduledDate] = useState<string>(
    order.scheduledDate ? new Date(order.scheduledDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const unit = order.recipe?.yieldUom || 'und';

  const save = useMutation({
    mutationFn: (body: any) => api.patch(`/v1/production/orders/${order.id}`, body),
    onSuccess: () => { toast.success('Orden actualizada'); onSuccess(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'No se pudo actualizar'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Editar orden de producción</h2>
            <p className="text-xs text-gray-500">{order.orderNumber} — {order.recipe?.product?.name ?? ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad planificada <span className="text-gray-400">({unit})</span></label>
            <div className="flex">
              <input type="number" min={1} className="input rounded-r-none" value={plannedQty}
                onChange={e => setPlannedQty(parseFloat(e.target.value) || 0)} />
              <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-gray-200 bg-gray-50 text-gray-500 text-sm">{unit}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Línea</label>
              <select className="input" value={line} onChange={e => setLine(e.target.value)}>
                <option value="A">Línea A</option>
                <option value="B">Línea B</option>
                <option value="C">Línea C</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha programada</label>
              <input type="date" className="input" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">Si cambias la cantidad, se recalcula la reserva de insumos. El número de orden/lote no cambia.</p>
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button
            disabled={!(plannedQty > 0) || save.isPending}
            onClick={() => save.mutate({ plannedQty, line, scheduledDate })}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
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

  // Auto-fill each line's consumption ONCE from the recipe, scaled to the
  // PLANNED quantity of the order. Changing the "cantidad real producida"
  // (rendimiento) must NOT recalculate the formula — the planned consumption is
  // the reference and the operator adjusts real amounts by hand if needed. So
  // this only runs when the recipe loads, not when actualYieldQty changes.
  useEffect(() => {
    if (!recipe) return;
    const plannedScale = Number(order.plannedQty) / yieldQty;
    setConsumptions(prev => {
      const next = { ...prev };
      recipe.bomLines.forEach(l => {
        const perBatch = Number(l.qtyRequired) * (1 + Number(l.wasteFactorPct) / 100) * plannedScale;
        if (!next[l.ingredientId]) {
          next[l.ingredientId] = { actualQty: perBatch.toFixed(3), lotNumber: '', batchId: '', manual: false };
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id]);

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

// ── DemandaModal ─────────────────────────────────────────────────────────────
// "Los productos solicitados deben aparecer en el módulo de producción con un
// listado con las cantidades solicitadas y un campo editable con el batch
// recomendado por sistema."
//
// Aggregates the open sales orders by product over a delivery-date window. The
// recommended quantity is the requested amount rounded up to whole batches
// (Recipe.yieldQty); it is pre-filled and editable, and only the rows that are
// checked generate a production order.
function DemandaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10));
  const [incluirSinFecha, setIncluirSinFecha] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(today);
  const [line, setLine] = useState('A');
  const [marcarEnProduccion, setMarcarEnProduccion] = useState(true);
  const [rows, setRows] = useState<Record<string, { qty: string; checked: boolean; line: string }>>({});
  const [creating, setCreating] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['production-demand', desde, hasta, incluirSinFecha],
    queryFn: () => api.get('/v1/production/demand', {
      params: { desde, hasta, incluirSinFecha: incluirSinFecha ? 'true' : undefined },
    }).then(r => r.data),
  });
  const items: any[] = data?.data?.items ?? [];

  // Seed the editable quantities from the suggestion whenever the window
  // changes; rows already covered by a live production order start unchecked.
  useEffect(() => {
    if (!items.length) { setRows({}); return; }
    setRows(prev => {
      const next: typeof prev = {};
      for (const it of items) {
        next[it.productId] = prev[it.productId] ?? {
          qty: String(it.plannedQtySugerida ?? it.qtySolicitada ?? 0),
          checked: !it.sinReceta && !it.yaEnProduccion,
          line,
        };
      }
      return next;
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (id: string, k: 'qty' | 'checked' | 'line', v: any) =>
    setRows(r => ({ ...r, [id]: { ...r[id], [k]: v } }));

  const seleccionados = items.filter(i => rows[i.productId]?.checked && !i.sinReceta);

  const generar = async () => {
    if (!seleccionados.length) return;
    setCreating(true);
    try {
      const res = await api.post('/v1/production/orders/bulk', {
        scheduledDate,
        line,
        marcarEnProduccion,
        items: seleccionados.map(i => ({
          recipeId: i.recipeId,
          plannedQty: Number(rows[i.productId].qty) || 0,
          line: rows[i.productId].line || line,
          linkedSalesOrderIds: i.salesOrderIds,
          notes: `Generada desde pedidos (${i.pedidos.length} pedido/s)`,
        })),
      });
      const d = res.data.data;
      setResultado(d);
      if (d.resumen.creados) {
        toast.success(`${d.resumen.creados} orden(es) de producción creadas`);
        onCreated();
        await refetch();
      }
      if (d.resumen.conError) toast.error(`${d.resumen.conError} con error`);
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error al generar las órdenes');
    } finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-brand-600" />
            <div>
              <h2 className="font-bold text-gray-900">Producción desde pedidos</h2>
              <p className="text-xs text-gray-400">Cantidades solicitadas por producto y el batch recomendado</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Entrega desde</label>
            <input type="date" className="input text-sm" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Hasta</label>
            <input type="date" className="input text-sm" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-2">
            <input type="checkbox" checked={incluirSinFecha} onChange={e => setIncluirSinFecha(e.target.checked)} />
            Incluir pedidos sin fecha
          </label>
          <div className="ml-auto flex items-end gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Producir el</label>
              <input type="date" className="input text-sm" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">Línea</label>
              <select className="input text-sm w-20" value={line}
                onChange={e => { setLine(e.target.value); setRows(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, line: e.target.value }]))); }}>
                {['A', 'B', 'C'].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? <p className="text-center text-gray-400 py-10">Cargando pedidos…</p>
            : !items.length ? <p className="text-center text-gray-400 py-10">No hay pedidos con entrega en ese rango.</p> : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Solicitado</th>
                    <th className="px-3 py-2 text-left">Pedidos</th>
                    <th className="px-3 py-2 text-left">1ª entrega</th>
                    <th className="px-3 py-2 text-right">Batch</th>
                    <th className="px-3 py-2 text-right">A producir</th>
                    <th className="px-3 py-2 text-center">Línea</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(it => {
                    const row = rows[it.productId];
                    const qty = Number(row?.qty) || 0;
                    const falta = qty < it.qtySolicitada;
                    return (
                      <tr key={it.productId} className={it.sinReceta ? 'bg-amber-50' : ''}>
                        <td className="px-3 py-2">
                          <input type="checkbox" disabled={it.sinReceta}
                            checked={!!row?.checked}
                            onChange={e => setRow(it.productId, 'checked', e.target.checked)} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{it.nombre}</span>
                          {it.sku && <span className="block text-[10px] text-gray-400 font-mono">{it.sku}</span>}
                          {it.sinReceta && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-700 mt-0.5">
                              <AlertTriangle size={11} /> Sin receta activa — no se puede generar
                            </span>
                          )}
                          {it.yaEnProduccion && !it.sinReceta && (
                            <span className="block text-[10px] text-gray-400 mt-0.5">Ya cubierto por una orden abierta</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{it.qtySolicitada}{it.uom ? <span className="text-gray-400 text-[10px] ml-1">{it.uom}</span> : null}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {it.pedidos.length} pedido(s)
                          <span className="block text-[10px] text-gray-400 truncate max-w-[14rem]">
                            {[...new Set(it.pedidos.map((p: any) => p.cliente).filter(Boolean))].slice(0, 3).join(', ')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {it.primeraEntrega ? new Date(it.primeraEntrega).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">
                          {it.yieldQty ? <>{it.batchesSugeridos} × {it.yieldQty}{it.yieldUom ? ` ${it.yieldUom}` : ''}</> : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" min={0} step="0.01" disabled={it.sinReceta}
                            className="input w-24 text-right font-mono"
                            value={row?.qty ?? ''} onChange={e => setRow(it.productId, 'qty', e.target.value)} />
                          {falta && qty > 0 && <span className="block text-[10px] text-amber-600">Bajo lo solicitado</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <select className="input w-16 text-sm" disabled={it.sinReceta}
                            value={row?.line ?? line} onChange={e => setRow(it.productId, 'line', e.target.value)}>
                            {['A', 'B', 'C'].map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {resultado && (
            <div className="space-y-2">
              {!!resultado.creados?.length && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-green-800">
                  {resultado.creados.map((c: any) => <div key={c.id}>Orden {c.orderNumber} · {c.plannedQty}</div>)}
                </div>
              )}
              {!!resultado.errores?.length && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
                  {resultado.errores.map((e: any, i: number) => <div key={i}>{e.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2 bg-gray-50 rounded-b-2xl">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={marcarEnProduccion} onChange={e => setMarcarEnProduccion(e.target.checked)} />
            Marcar los pedidos como "En producción"
          </label>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 rounded-xl">Cerrar</button>
            <button
              disabled={!seleccionados.length || creating}
              onClick={generar}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {creating && <Loader2 size={14} className="animate-spin" />}
              <Factory size={14} /> Generar {seleccionados.length} orden(es)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

