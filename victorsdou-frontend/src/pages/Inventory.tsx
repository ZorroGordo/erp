import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  AlertTriangle, Clock, Package, Plus, LayoutGrid, List,
  Settings, X, Loader2, ArrowDownToLine, FileText,
  ShoppingCart, Bell,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtMoney, fmtNum } from '../lib/fmt';
import { ExcelDownloadButton } from '../components/ExcelDownloadButton';

// ── Types ─────────────────────────────────────────────────────────────────────
type DashUnit    = 'qty' | 'pct' | 'und';
type AlertStatus = 'ok' | 'alert' | 'critical';

interface AlertConfig {
  alertThreshold: number;
  minThreshold:   number;
  alertEmails:    string[];
  dashboardUnit:  string;
}

interface IngredientDashItem {
  id:            string;
  name:          string;
  sku:           string;
  category:      string;
  baseUom:       string;
  avgCostPen:    number;
  totalQty:      number;
  totalReserved: number;
  available:     number;
  status:        AlertStatus;
  alertConfig:   AlertConfig | null;
  warehouses:    { warehouseId: string; warehouseName: string; qty: number; reserved: number }[];
}

interface Warehouse { id: string; name: string; type: string; }

// ── useCountUp ────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1100) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);
  useEffect(() => {
    const startTime = performance.now();
    const startVal  = value;
    const animate = (now: number) => {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease     = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(startVal + (target - startVal) * ease);
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

// ── Status styles ─────────────────────────────────────────────────────────────
const STYLE: Record<AlertStatus, { border: string; badge: string; num: string; bar: string }> = {
  ok:       { border: 'border-green-200',  badge: 'bg-green-100 text-green-700',  num: 'text-gray-900',  bar: 'bg-green-500' },
  alert:    { border: 'border-amber-300',  badge: 'bg-amber-100 text-amber-700',  num: 'text-amber-700', bar: 'bg-amber-400' },
  critical: { border: 'border-red-300',    badge: 'bg-red-100 text-red-700',      num: 'text-red-600',   bar: 'bg-red-500'   },
};
const STATUS_LABEL: Record<AlertStatus, string> = {
  ok: '✓ OK', alert: '⚠ Alerta', critical: '🔴 Crítico',
};

// ── GaugeMeter ────────────────────────────────────────────────────────────────
function GaugeMeter({ available, alertThr, minThr }: { available: number; alertThr: number; minThr: number }) {
  if (!alertThr && !minThr) return null;
  const max       = Math.max(available, alertThr, minThr) * 1.35 || 1;
  const fillPct   = Math.min((available / max) * 100, 100);
  const alertPct  = alertThr ? (alertThr / max) * 100 : 0;
  const minPct    = minThr   ? (minThr   / max) * 100 : 0;
  const fillColor = available <= (minThr || 0) ? 'bg-red-400' : available <= (alertThr || 0) ? 'bg-amber-400' : 'bg-green-400';
  return (
    <div className="relative h-2 bg-gray-100 rounded-full mt-3">
      <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${fillColor}`} style={{ width: `${fillPct}%` }} />
      {alertPct > 0 && <div className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-amber-500 z-10 rounded-full" style={{ left: `${alertPct}%` }} />}
      {minPct   > 0 && <div className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-red-500   z-10 rounded-full" style={{ left: `${minPct}%`   }} />}
    </div>
  );
}

// ── IngredientCard ────────────────────────────────────────────────────────────
function IngredientCard({
  item, onReceive, onSettings, onHistory,
}: {
  item:       IngredientDashItem;
  onReceive:  (i: IngredientDashItem) => void;
  onSettings: (i: IngredientDashItem) => void;
  onHistory:  (i: IngredientDashItem) => void;
}) {
  const UNITS: DashUnit[] = ['qty', 'pct', 'und'];
  const [unit, setUnit] = useState<DashUnit>((item.alertConfig?.dashboardUnit as DashUnit) ?? 'qty');

  const alertThr = Number(item.alertConfig?.alertThreshold ?? 0);
  const minThr   = Number(item.alertConfig?.minThreshold   ?? 0);

  // Compute the counter target value based on unit
  const counterTarget =
    unit === 'pct' && alertThr > 0 ? Math.min((item.available / alertThr) * 100, 999) :
    unit === 'und' ? Math.floor(item.available) :
    item.available;

  const animated = useCountUp(counterTarget);
  const s = STYLE[item.status];

  const displayStr =
    unit === 'pct'
      ? (alertThr > 0 ? `${animated.toFixed(0)}%` : '—')
      : unit === 'und'
      ? Math.floor(animated).toLocaleString('es-PE')
      : animated.toLocaleString('es-PE', { maximumFractionDigits: 2 });

  const unitLabel =
    unit === 'pct' ? '% de umbral' :
    unit === 'und' ? 'und' :
    item.baseUom;

  return (
    <div className={`card border-2 ${s.border} p-4 flex flex-col gap-3 hover:shadow-md transition-shadow`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold leading-tight">{item.category}</span>
        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={() => onHistory(item)}  className="p-1 rounded text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors" title="Historial"><FileText  size={13} /></button>
          <button onClick={() => onSettings(item)} className="p-1 rounded text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors" title="Alertas">   <Settings  size={13} /></button>
        </div>
      </div>

      {/* Name */}
      <div>
        <h3 className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</h3>
        <p className="text-[11px] text-gray-400">{item.sku}</p>
      </div>

      {/* Animated counter — click to cycle unit */}
      <button
        onClick={() => setUnit(UNITS[(UNITS.indexOf(unit) + 1) % UNITS.length])}
        className="rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors py-2.5 px-2 text-center group"
        title="Click para cambiar unidad"
      >
        <div className={`text-2xl font-bold tabular-nums leading-none ${s.num}`}>{displayStr}</div>
        <div className="text-[10px] text-gray-400 mt-1 group-hover:text-brand-500 transition-colors">
          {unitLabel} <span className="opacity-0 group-hover:opacity-100">↻</span>
        </div>
      </button>

      {/* Gauge */}
      <GaugeMeter available={item.available} alertThr={alertThr} minThr={minThr} />

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.badge}`}>{STATUS_LABEL[item.status]}</span>
        <button
          onClick={() => onReceive(item)}
          className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-800 font-medium transition-colors"
        >
          <ArrowDownToLine size={11} /> Recibir
        </button>
      </div>

      {/* Per-warehouse breakdown (only when multiple) */}
      {item.warehouses.length > 1 && (
        <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-2 space-y-0.5">
          {item.warehouses.map(w => (
            <div key={w.warehouseId} className="flex justify-between">
              <span>{w.warehouseName}</span>
              <span className="font-mono">{w.qty.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ReceiveModal ──────────────────────────────────────────────────────────────
function ReceiveModal({
  prefill, ingredients, warehouses, onClose, onSuccess,
}: {
  prefill?:    IngredientDashItem;
  ingredients: IngredientDashItem[];
  warehouses:  Warehouse[];
  onClose:     () => void;
  onSuccess:   () => void;
}) {
  const [ingredientId, setIngredientId] = useState(prefill?.id ?? '');
  const [warehouseId,  setWarehouseId]  = useState(warehouses[0]?.id ?? '');
  const [qty,          setQty]          = useState('');
  const [unitCost,     setUnitCost]     = useState('');
  const [invoiceRef,   setInvoiceRef]   = useState('');
  const [poRef,        setPoRef]        = useState('');
  const [notes,        setNotes]        = useState('');

  const create = useMutation({
    mutationFn: (body: any) => api.post('/v1/inventory/receipts', body),
    onSuccess:  () => { toast.success('Entrada registrada'); onSuccess(); onClose(); },
    onError:    (e: any) => toast.error(e.response?.data?.message ?? 'Error al registrar'),
  });

  const selIng   = ingredients.find(i => i.id === ingredientId);
  const total    = Number(qty) * Number(unitCost);
  const canSave  = ingredientId && warehouseId && Number(qty) > 0 && Number(unitCost) >= 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ArrowDownToLine size={18} className="text-brand-600" />
            <h2 className="font-semibold text-gray-900">Registrar entrada</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Ingredient */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ingrediente <span className="text-red-500">*</span></label>
            <select className="input" value={ingredientId} onChange={e => setIngredientId(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.baseUom})</option>)}
            </select>
          </div>

          {/* Warehouse */}
          {warehouses.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Almacén <span className="text-red-500">*</span></label>
              <select className="input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Qty */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Cantidad <span className="text-red-500">*</span>
                {selIng && <span className="text-gray-400 ml-1">({selIng.baseUom})</span>}
              </label>
              <input type="number" min="0.01" step="0.01" className="input font-mono"
                value={qty} placeholder="50" onChange={e => setQty(e.target.value)} />
            </div>
            {/* Unit cost */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Costo unitario <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                <input type="number" min="0" step="0.01" className="input pl-7 font-mono"
                  value={unitCost} placeholder="0.00" onChange={e => setUnitCost(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Invoice ref */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <FileText size={11} className="inline mr-1" />Nº de Factura / Boleta
            </label>
            <input className="input font-mono" value={invoiceRef} placeholder="F001-000123"
              onChange={e => setInvoiceRef(e.target.value)} />
          </div>

          {/* PO ref */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <ShoppingCart size={11} className="inline mr-1" />Orden de Compra
            </label>
            <input className="input font-mono" value={poRef} placeholder="OC-2025-001"
              onChange={e => setPoRef(e.target.value)} />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <input className="input" value={notes} placeholder="Ej: 10 bolsas de 50 kg"
              onChange={e => setNotes(e.target.value)} />
          </div>

          {/* Total preview */}
          {qty && unitCost && (
            <div className="bg-brand-50 rounded-xl px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-500">Total estimado</span>
              <span className="font-semibold text-brand-700">S/ {total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button className="btn-primary disabled:opacity-50 flex items-center gap-2"
            disabled={!canSave || create.isPending} onClick={() => create.mutate({
              ingredientId, warehouseId,
              qty: Number(qty), unitCost: Number(unitCost),
              invoiceRef: invoiceRef.trim() || undefined,
              poRef:      poRef.trim()      || undefined,
              notes:      notes.trim()      || undefined,
            })}>
            {create.isPending && <Loader2 size={14} className="animate-spin" />}
            Registrar entrada
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── AlertSettingsModal ────────────────────────────────────────────────────────
function AlertSettingsModal({
  item, onClose, onSuccess,
}: {
  item:      IngredientDashItem;
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [alertThr,   setAlertThr]   = useState(String(item.alertConfig?.alertThreshold ?? ''));
  const [minThr,     setMinThr]     = useState(String(item.alertConfig?.minThreshold   ?? ''));
  const [emails,     setEmails]     = useState<string[]>(item.alertConfig?.alertEmails ?? []);
  const [emailInput, setEmailInput] = useState('');
  const [dashUnit,   setDashUnit]   = useState<DashUnit>((item.alertConfig?.dashboardUnit as DashUnit) ?? 'qty');

  const save = useMutation({
    mutationFn: (body: any) => api.put(`/v1/inventory/ingredients/${item.id}/alert-settings`, body),
    onSuccess:  () => { toast.success('Configuración guardada'); onSuccess(); onClose(); },
    onError:    (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  function addEmail() {
    const e = emailInput.trim().toLowerCase();
    if (e && /\S+@\S+\.\S+/.test(e) && !emails.includes(e)) {
      setEmails(p => [...p, e]);
      setEmailInput('');
    }
  }

  const alertThrNum = Number(alertThr) || 0;
  const minThrNum   = Number(minThr)   || 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Configurar alertas</h2>
              <p className="text-xs text-gray-400">{item.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Thresholds */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Umbral de alerta <span className="text-amber-500">🟡</span>
              </label>
              <div className="relative">
                <input type="number" min="0" step="0.01" className="input font-mono pr-10"
                  value={alertThr} placeholder="0" onChange={e => setAlertThr(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{item.baseUom}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Aviso al llegar aquí</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Umbral mínimo <span className="text-red-500">🔴</span>
              </label>
              <div className="relative">
                <input type="number" min="0" step="0.01" className="input font-mono pr-10"
                  value={minThr} placeholder="0" onChange={e => setMinThr(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{item.baseUom}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Alerta crítica</p>
            </div>
          </div>

          {/* Live preview gauge */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Stock disponible actual</span>
              <span className="font-mono font-medium">{item.available.toFixed(2)} {item.baseUom}</span>
            </div>
            {(alertThrNum > 0 || minThrNum > 0) && (
              <GaugeMeter available={item.available} alertThr={alertThrNum} minThr={minThrNum} />
            )}
          </div>

          {/* Display unit */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Unidad en dashboard</label>
            <div className="flex gap-2">
              {(['qty', 'pct', 'und'] as DashUnit[]).map(u => (
                <button key={u} type="button" onClick={() => setDashUnit(u)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                    dashUnit === u
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                  }`}
                >
                  {u === 'qty' ? item.baseUom : u === 'pct' ? '% (de alerta)' : 'und (enteros)'}
                </button>
              ))}
            </div>
          </div>

          {/* Alert emails */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Emails de alerta
              <span className="text-gray-400 font-normal ml-1">(una vez cada 6h máx)</span>
            </label>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm" type="email" value={emailInput}
                placeholder="nombre@victorsdou.pe"
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEmail()}
              />
              <button type="button" onClick={addEmail}
                className="px-3 py-2 bg-brand-600 text-white rounded-xl text-sm hover:bg-brand-700">
                <Plus size={14} />
              </button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {emails.map(e => (
                  <span key={e} className="flex items-center gap-1 bg-brand-50 text-brand-700 text-xs px-2 py-1 rounded-full">
                    {e}
                    <button onClick={() => setEmails(p => p.filter(x => x !== e))} className="hover:text-red-500"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1.5">Requiere MAILGUN_API_KEY configurado en el servidor.</p>
          </div>
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button className="btn-primary disabled:opacity-50 flex items-center gap-2"
            disabled={save.isPending}
            onClick={() => save.mutate({ alertThreshold: alertThrNum, minThreshold: minThrNum, alertEmails: emails, dashboardUnit: dashUnit })}>
            {save.isPending && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── HistoryModal ──────────────────────────────────────────────────────────────
function HistoryModal({ item, onClose }: { item: IngredientDashItem; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['receipts', item.id],
    queryFn:  () => api.get(`/v1/inventory/ingredients/${item.id}/receipts`).then(r => r.data),
  });

  function parseRefs(notes: string | null) {
    if (!notes) return { inv: null, po: null, extra: null };
    const inv  = notes.match(/Factura:\s*([^\s|]+)/)?.[1]  ?? null;
    const po   = notes.match(/OC:\s*([^\s|]+)/)?.[1]       ?? null;
    const rest = notes.replace(/Factura:\s*[^\s|]+\s*\|?\s*/g, '').replace(/OC:\s*[^\s|]+\s*\|?\s*/g, '').trim() || null;
    return { inv, po, extra: rest };
  }

  const receipts = data?.data ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Historial de entradas</h2>
              <p className="text-xs text-gray-400">{item.name} — {data?.meta?.total ?? 0} registros</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Cargando...</div>
          ) : receipts.length === 0 ? (
            <div className="p-10 text-center">
              <ArrowDownToLine size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-400">Sin entradas registradas aún.</p>
              <p className="text-gray-400 text-sm">Usa el botón "Registrar entrada" para agregar stock.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Costo unit.</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-left">Factura</th>
                  <th className="px-4 py-3 text-left">Orden de Compra</th>
                  <th className="px-4 py-3 text-left">Almacén</th>
                  <th className="px-4 py-3 text-left">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receipts.map((r: any) => {
                  const { inv, po, extra } = parseRefs(r.notes);
                  const total = Number(r.qtyIn) * Number(r.unitCostPen);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(r.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">
                        +{fmtNum(r.qtyIn)} {item.baseUom}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500 text-xs">
                        S/ {Number(r.unitCostPen).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 text-xs">
                        S/ {total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        {inv ? <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono">{inv}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {po ? <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-mono">{po}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.warehouse?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{extra ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button className="btn-secondary text-sm" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Inventory() {
  const qc = useQueryClient();
  const [view,         setView]         = useState<'dashboard' | 'list'>('dashboard');
  const [showReceive,  setShowReceive]  = useState(false);
  const [receiveItem,  setReceiveItem]  = useState<IngredientDashItem | undefined>();
  const [settingsItem, setSettingsItem] = useState<IngredientDashItem | null>(null);
  const [historyItem,  setHistoryItem]  = useState<IngredientDashItem | null>(null);

  const { data: dashData, isLoading } = useQuery({
    queryKey: ['inventory-dashboard'],
    queryFn:  () => api.get('/v1/inventory/dashboard').then(r => r.data),
  });
  const { data: warehouseData } = useQuery({
    queryKey: ['warehouses'],
    queryFn:  () => api.get('/v1/inventory/warehouses').then(r => r.data),
    retry: false,
  });
  const { data: reorder } = useQuery({
    queryKey: ['reorder-alerts'],
    queryFn:  () => api.get('/v1/inventory/reorder-alerts').then(r => r.data),
  });
  const { data: expiry } = useQuery({
    queryKey: ['expiry-alerts'],
    queryFn:  () => api.get('/v1/inventory/batches/expiry-alerts').then(r => r.data),
  });

  const ingredients: IngredientDashItem[] = dashData?.data        ?? [];
  const warehouses:  Warehouse[]          = warehouseData?.data   ?? [];
  const criticalCount = ingredients.filter(i => i.status === 'critical').length;
  const alertCount    = ingredients.filter(i => i.status === 'alert').length;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['inventory-dashboard'] });
    qc.invalidateQueries({ queryKey: ['reorder-alerts'] });
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {ingredients.length} ingredientes activos
            {criticalCount > 0 && <span className="text-red-600 ml-2 font-medium">· {criticalCount} crítico(s)</span>}
            {alertCount    > 0 && <span className="text-amber-600 ml-2 font-medium">· {alertCount} con alerta</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(['dashboard', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  view === v ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v === 'dashboard' ? <><LayoutGrid size={13} /> Dashboard</> : <><List size={13} /> Lista</>}
              </button>
            ))}
          </div>
          <ExcelDownloadButton
              filename="inventario"
              sheetName="Inventario"
              data={ingredients}
              columns={[
                { header: 'Ingrediente', key: 'name', width: 28 },
                { header: 'Unidad', key: 'unit', width: 10 },
                { header: 'Stock actual', key: 'currentStock', width: 14, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Stock minimo', key: 'minStock', width: 14, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Punto reorden', key: 'reorderPoint', width: 16, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Costo unit. S/', key: 'averageCost', width: 14, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Estado', key: 'status', width: 12 },
              ]}
              extraFilters={[
                { key: 'status', label: 'Estado', type: 'select', options: [
                  { value: 'ok', label: 'OK' },
                  { value: 'alert', label: 'Alerta' },
                  { value: 'critical', label: 'Critico' },
                ]},
              ]}
            />
          <button onClick={() => { setReceiveItem(undefined); setShowReceive(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={15} /> Registrar entrada
          </button>
        </div>
      </div>

      {/* ── Alert banners ── */}
      {criticalCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">{criticalCount} ingrediente(s) en nivel crítico</p>
            <p className="text-sm text-red-600">{ingredients.filter(i => i.status === 'critical').map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}
      {alertCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">{alertCount} ingrediente(s) bajo umbral de alerta</p>
            <p className="text-sm text-amber-600">{ingredients.filter(i => i.status === 'alert').map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}
      {reorder?.data?.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-orange-700"><strong>{reorder.data.length}</strong> ingrediente(s) bajo punto de reorden configurado.</p>
        </div>
      )}
      {expiry?.data?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <Clock size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700"><strong>{expiry.data.length}</strong> lote(s) próximos a vencer en los próximos 7 días.</p>
        </div>
      )}

      {/* ── DASHBOARD VIEW ── */}
      {view === 'dashboard' && (
        isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="card p-4 animate-pulse border-2 border-gray-100">
                <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                <div className="h-10 bg-gray-200 rounded mb-3" />
                <div className="h-1.5 bg-gray-200 rounded mb-3" />
              </div>
            ))}
          </div>
        ) : ingredients.length === 0 ? (
          <div className="card p-14 text-center">
            <Package size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">Sin ingredientes activos</p>
            <p className="text-gray-400 text-sm mt-1">Agrega ingredientes desde el módulo de Catálogo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {ingredients.map(item => (
              <IngredientCard
                key={item.id}
                item={item}
                onReceive={i => { setReceiveItem(i); setShowReceive(true); }}
                onSettings={setSettingsItem}
                onHistory={setHistoryItem}
              />
            ))}
          </div>
        )
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Package size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-800">Ingredientes</h2>
            <span className="ml-auto text-sm text-gray-400">{ingredients.length} items</span>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Cargando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Ingrediente</th>
                    <th className="px-5 py-3 text-left">Categoría</th>
                    <th className="px-5 py-3 text-right">Disponible</th>
                    <th className="px-5 py-3 text-right">Alerta 🟡</th>
                    <th className="px-5 py-3 text-right">Mínimo 🔴</th>
                    <th className="px-5 py-3 text-right">Costo prom.</th>
                    <th className="px-5 py-3 text-left">UOM</th>
                    <th className="px-5 py-3 text-left">Estado</th>
                    <th className="px-5 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ingredients.map(item => {
                    const s = STYLE[item.status];
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{item.name}</td>
                        <td className="px-5 py-3 text-gray-500">{item.category}</td>
                        <td className="px-5 py-3 text-right font-mono">{item.available.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-mono text-amber-600">
                          {item.alertConfig?.alertThreshold ? fmtNum(item.alertConfig.alertThreshold) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-red-600">
                          {item.alertConfig?.minThreshold ? fmtNum(item.alertConfig.minThreshold) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-gray-500">S/ {item.avgCostPen.toFixed(4)}</td>
                        <td className="px-5 py-3 text-gray-500">{item.baseUom}</td>
                        <td className="px-5 py-3"><span className={`badge text-xs ${s.badge}`}>{STATUS_LABEL[item.status]}</span></td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setReceiveItem(item); setShowReceive(true); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors" title="Registrar entrada">
                              <ArrowDownToLine size={14} />
                            </button>
                            <button onClick={() => setHistoryItem(item)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors" title="Historial">
                              <FileText size={14} />
                            </button>
                            <button onClick={() => setSettingsItem(item)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors" title="Alertas">
                              <Settings size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {showReceive && (
        <ReceiveModal
          prefill={receiveItem}
          ingredients={ingredients}
          warehouses={warehouses}
          onClose={() => { setShowReceive(false); setReceiveItem(undefined); }}
          onSuccess={invalidate}
        />
      )}
      {settingsItem && (
        <AlertSettingsModal item={settingsItem} onClose={() => setSettingsItem(null)} onSuccess={invalidate} />
      )}
      {historyItem && (
        <HistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </div>
  );
}
