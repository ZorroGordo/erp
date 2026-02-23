import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { fmtMoney, fmtInt } from '../lib/fmt';
import {
  Package, AlertTriangle, Factory, ShoppingCart, TrendingUp, Clock,
  ChevronLeft, ChevronRight, DollarSign, Cake, GripVertical, X, Plus,
  LayoutGrid, FileText, Mail, CheckCircle2, ClipboardCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Types ────────────────────────────────────────────────────────────────────
type CardId = 'income' | 'kpis' | 'birthdays' | 'recentSales' | 'prodOrders' | 'comprobantes' | 'payrollSummary' | 'stockAlerts' | 'expiryAlerts' | 'tasks';
interface DashCard { id: CardId; visible: boolean; order: number; }

const CARD_DEFS: { id: CardId; label: string }[] = [
  { id: 'income',         label: 'Ingresos del mes' },
  { id: 'kpis',           label: 'KPIs operativos' },
  { id: 'birthdays',      label: 'Cumpleaños del mes' },
  { id: 'recentSales',    label: 'Últimos pedidos' },
  { id: 'prodOrders',     label: 'Producción' },
  { id: 'comprobantes',   label: 'Comprobantes pendientes' },
  { id: 'payrollSummary', label: 'Resumen de nómina' },
  { id: 'stockAlerts',    label: 'Stock crítico' },
  { id: 'expiryAlerts',   label: 'Lotes por vencer' },
  { id: 'tasks',          label: 'Tareas pendientes' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

// ── Per-user dashboard config ─────────────────────────────────────────────────
function useDashConfig(userId: string) {
  const key = `vos_dash_${userId}`;
  const defaultConfig: DashCard[] = CARD_DEFS.map((c, i) => ({ id: c.id, visible: c.id !== 'tasks', order: i }));

  const [config, setConfig] = useState<DashCard[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as DashCard[];
        const merged = CARD_DEFS.map(d => {
          const s = saved.find(c => c.id === d.id);
          return s ?? { id: d.id, visible: d.id !== 'tasks', order: CARD_DEFS.indexOf(d) };
        });
        return merged.sort((a, b) => a.order - b.order);
      }
    } catch { /* ignore */ }
    return defaultConfig;
  });

  const save = (next: DashCard[]) => {
    const reindexed = next.map((c, i) => ({ ...c, order: i }));
    setConfig(reindexed);
    localStorage.setItem(key, JSON.stringify(reindexed));
  };

  const toggleVisible = (id: CardId) => save(config.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  const reorder = (fromId: CardId, toId: CardId) => {
    const arr = [...config];
    const from = arr.findIndex(c => c.id === fromId);
    const to   = arr.findIndex(c => c.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    save(arr);
  };
  const reset = () => save(defaultConfig);

  return { config, toggleVisible, reorder, reset };
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, to }: any) {
  const content = (
    <div className={`card p-5 flex items-start gap-4 ${to ? 'card-interactive' : ''}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 leading-tight">{label}</p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{content}</Link> : content;
}

// ── IncomeCard ────────────────────────────────────────────────────────────────
function IncomeCard({ month, customerType }: { month: string; customerType: 'all' | 'B2B' | 'B2C' }) {
  const prevMonth = shiftMonth(month, -1);
  const qs = (m: string) => `/v1/invoices/summary?month=${m}${customerType !== 'all' ? `&customerType=${customerType}` : ''}`;

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-summary', month, customerType],
    queryFn: () => api.get(qs(month)).then(r => r.data.data),
  });
  const { data: prevData } = useQuery({
    queryKey: ['invoice-summary', prevMonth, customerType],
    queryFn: () => api.get(qs(prevMonth)).then(r => r.data.data),
  });

  const total     = data?.totalIncome        ?? 0;
  const subtotal  = data?.subtotal           ?? 0;
  const igv       = data?.igv                ?? 0;
  const count     = data?.invoiceCount       ?? 0;
  const factura   = data?.breakdown?.factura ?? 0;
  const boleta    = data?.breakdown?.boleta  ?? 0;
  const prevTotal = prevData?.totalIncome    ?? 0;
  const pctChange = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : null;
  const [prevY, prevMo] = prevMonth.split('-').map(Number);
  const prevLabel = new Date(prevY, prevMo - 1, 1).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });

  return (
    <div className="card p-5 flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-500">
        <DollarSign size={22} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500 leading-tight">Ingresos del mes</p>
        {isLoading
          ? <p className="text-2xl font-bold text-gray-300 tabular-nums animate-pulse">—</p>
          : <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtMoney(total)}</p>
        }
        {/* Prior-month comparison */}
        {!isLoading && pctChange !== null && (
          <p className={`text-xs font-medium mt-0.5 ${pctChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {pctChange >= 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}% vs {prevLabel}
          </p>
        )}
        {!isLoading && pctChange === null && (
          <p className="text-xs text-gray-400 mt-0.5">Sin datos mes anterior</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          Sin IGV:&nbsp;<span className="font-medium text-gray-600">{fmtMoney(subtotal)}</span>
          &ensp;·&ensp;
          IGV:&nbsp;<span className="font-medium text-gray-600">{fmtMoney(igv)}</span>
        </p>
        {customerType === 'all' && (
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5 font-medium">Facturas&nbsp;{fmtMoney(factura)}</span>
            <span className="text-xs bg-purple-50 text-purple-700 rounded px-2 py-0.5 font-medium">Boletas&nbsp;{fmtMoney(boleta)}</span>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1.5">{count} comprobante{count !== 1 ? 's' : ''} emitido{count !== 1 ? 's' : ''}</p>
      </div>
    </div>
  );
}

// ── BirthdayCard ──────────────────────────────────────────────────────────────
function BirthdayCard() {
  const { data: empData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/v1/payroll/employees').then(r => r.data),
  });
  const employees: any[] = empData?.data ?? [];
  const now          = new Date();
  const currentMonth = now.getMonth() + 1;
  const today        = now.getDate();

  const birthdays = employees
    .filter(e => e.birthDate)
    .map(e => { const bd = new Date(e.birthDate); return { ...e, bdMonth: bd.getMonth() + 1, bdDay: bd.getDate() }; })
    .filter(e => e.bdMonth === currentMonth)
    .sort((a, b) => a.bdDay - b.bdDay);

  return (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Cake size={16} className="text-pink-500" /> Cumpleaños del mes
        </h2>
        <span className="text-xs text-gray-400 capitalize">
          {new Date().toLocaleDateString('es-PE', { month: 'long' })}
        </span>
      </div>
      {birthdays.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Sin cumpleaños este mes</p>
      ) : (
        <div className="space-y-2">
          {birthdays.map(e => {
            const isToday = e.bdDay === today;
            return (
              <div key={e.id} className={`flex items-center gap-3 py-2 px-3 rounded-lg ${isToday ? 'bg-pink-50 border border-pink-200' : 'bg-gray-50'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isToday ? 'bg-pink-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {e.fullName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.fullName}</p>
                  <p className="text-xs text-gray-400">{e.position}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {isToday
                    ? <span className="text-xs font-semibold text-pink-600">🎂 ¡Hoy!</span>
                    : <span className="text-xs text-gray-500">{String(e.bdDay).padStart(2, '0')}/{String(currentMonth).padStart(2, '0')}</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800', CONFIRMED: 'bg-blue-100 text-blue-800',
    IN_PROGRESS: 'bg-indigo-100 text-indigo-800', COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800', DELIVERED: 'bg-emerald-100 text-emerald-800',
    DRAFT: 'bg-gray-100 text-gray-600', APPROVED: 'bg-cyan-100 text-cyan-800',
  };
  return <span className={`badge ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status.replace(/_/g, ' ')}</span>;
}

// ── DraggableSection ──────────────────────────────────────────────────────────
function DraggableSection({
  id, editMode, onRemove, onDragStart, onDragOver, onDrop, isDragOver, children,
}: {
  id: CardId; editMode: boolean; onRemove: () => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void; isDragOver: boolean; children: React.ReactNode;
}) {
  return (
    <div
      draggable={editMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={() => {}}
      className={`relative transition-all ${editMode ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragOver ? 'ring-2 ring-brand-400 ring-offset-2 rounded-xl opacity-70' : ''}`}
    >
      {editMode && (
        <>
          <button
            onClick={onRemove}
            className="absolute -top-2 -right-2 z-20 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors"
          >
            <X size={12} />
          </button>
          <div className="absolute top-3 left-3 z-20 text-gray-400 pointer-events-none">
            <GripVertical size={16} />
          </div>
          <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-brand-300 pointer-events-none" />
        </>
      )}
      <div className={editMode ? 'opacity-90' : ''}>{children}</div>
    </div>
  );
}

// ── ComprobantesCard ─────────────────────────────────────────────────────────
function ComprobantesCard() {
  const { data } = useQuery({
    queryKey: ['comprobantes-stats'],
    queryFn: () => api.get('/v1/comprobantes/stats/summary').then(r => r.data.data),
  });
  if (!data) return <div className="card p-5 animate-pulse h-32" />;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <FileText size={16} className="text-indigo-500" /> Comprobantes
        </h2>
        <Link to="/comprobantes" className="text-xs text-brand-600 hover:underline">Ver todos →</Link>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-amber-50 rounded-xl py-3">
          <p className="text-2xl font-bold text-amber-700">{data.pendientes ?? 0}</p>
          <p className="text-xs text-amber-600 mt-0.5">Pendientes</p>
        </div>
        <div className="bg-green-50 rounded-xl py-3">
          <p className="text-2xl font-bold text-green-700">{data.validados ?? 0}</p>
          <p className="text-xs text-green-600 mt-0.5">Validados</p>
        </div>
        <div className="bg-blue-50 rounded-xl py-3">
          <p className="text-2xl font-bold text-blue-700">{data.mesActual ?? 0}</p>
          <p className="text-xs text-blue-600 mt-0.5">Este mes</p>
        </div>
      </div>
      {data.emailPendientes > 0 && (
        <p className="text-xs text-sky-600 mt-3 flex items-center gap-1.5 bg-sky-50 rounded-lg px-3 py-1.5">
          <Mail size={11} /> {data.emailPendientes} recibido{data.emailPendientes !== 1 ? 's' : ''} por email sin validar
        </p>
      )}
    </div>
  );
}

// ── PayrollSummaryCard ────────────────────────────────────────────────────────
function PayrollSummaryCard() {
  const { data: empData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/v1/payroll/employees').then(r => r.data),
  });
  const employees: any[] = empData?.data ?? [];
  const planilla = employees.filter(e => e.employmentType === 'PLANILLA').length;
  const rxh      = employees.filter(e => e.employmentType === 'RXH').length;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <DollarSign size={16} className="text-teal-500" /> Nómina
        </h2>
        <Link to="/payroll" className="text-xs text-brand-600 hover:underline">Ver planilla →</Link>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-teal-50 rounded-xl py-3">
          <p className="text-2xl font-bold text-teal-700">{employees.length}</p>
          <p className="text-xs text-teal-600 mt-0.5">Total activos</p>
        </div>
        <div className="bg-blue-50 rounded-xl py-3">
          <p className="text-2xl font-bold text-blue-700">{planilla}</p>
          <p className="text-xs text-blue-600 mt-0.5">Planilla</p>
        </div>
        <div className="bg-purple-50 rounded-xl py-3">
          <p className="text-2xl font-bold text-purple-700">{rxh}</p>
          <p className="text-xs text-purple-600 mt-0.5">RxH</p>
        </div>
      </div>
    </div>
  );
}

// ── StockAlertsCard ───────────────────────────────────────────────────────────
function StockAlertsCard() {
  const { data } = useQuery({
    queryKey: ['reorder-alerts'],
    queryFn: () => api.get('/v1/inventory/reorder-alerts').then(r => r.data),
  });
  const alerts: any[] = data?.data ?? [];
  return (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-500" /> Stock crítico
        </h2>
        <Link to="/inventory" className="text-xs text-brand-600 hover:underline">Ver inventario →</Link>
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Sin alertas de stock 🎉</p>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 6).map((a: any) => (
            <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{a.name ?? a.ingredientName}</p>
                <p className="text-xs text-gray-400">{a.unit ?? a.unitOfMeasure}</p>
              </div>
              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                {Number(a.currentStock ?? a.totalQty ?? 0).toFixed(1)} restante
              </span>
            </div>
          ))}
          {alerts.length > 6 && <p className="text-xs text-gray-400 text-center pt-1">+{alerts.length - 6} más</p>}
        </div>
      )}
    </div>
  );
}

// ── ExpiryAlertsCard ──────────────────────────────────────────────────────────
function ExpiryAlertsCard() {
  const { data } = useQuery({
    queryKey: ['expiry-alerts'],
    queryFn: () => api.get('/v1/inventory/batches/expiry-alerts').then(r => r.data),
  });
  const items: any[] = data?.data ?? [];
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  return (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Clock size={16} className="text-red-500" /> Lotes por vencer
        </h2>
        <Link to="/inventory" className="text-xs text-brand-600 hover:underline">Ver inventario →</Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Sin lotes próximos a vencer 🎉</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 6).map((a: any) => {
            const daysLeft = Math.ceil((new Date(a.expiryDate).getTime() - Date.now()) / 86400000);
            return (
              <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.ingredient?.name ?? a.name}</p>
                  <p className="text-xs text-gray-400">{fmtDate(a.expiryDate)} · Lote {a.batchCode ?? a.lotNumber}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${daysLeft <= 3 ? 'bg-red-100 text-red-700' : daysLeft <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {daysLeft}d
                </span>
              </div>
            );
          })}
          {items.length > 6 && <p className="text-xs text-gray-400 text-center pt-1">+{items.length - 6} más</p>}
        </div>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

// ?? TasksCard ?????????????????????????????????????????????????????????????????
function TaskProgressRow({ label, done, total, color }: { label: string; done: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const all = done === total && total > 0;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${all ? 'bg-green-100' : color}`}>
        <CheckCircle2 size={16} className={all ? 'text-green-600' : 'text-white'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
          <span className={`text-xs font-bold ml-2 flex-shrink-0 ${all ? 'text-green-600' : 'text-gray-500'}`}>{done}/{total}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${all ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function TasksCard({ month }: { month: string }) {
  const { data: payrollData } = useQuery<any>({
    queryKey: ['tasks-payroll', month],
    queryFn: () => api.get(`/v1/payroll/summary?month=${month}`).then(r => r.data).catch(() => null),
    staleTime: 60_000,
  });
  const { data: compData } = useQuery<any>({
    queryKey: ['tasks-comprobantes'],
    queryFn: () => api.get('/v1/comprobantes/stats/summary').then(r => r.data).catch(() => null),
    staleTime: 60_000,
  });

  const boletas   = { done: payrollData?.data?.confirmed ?? 0, total: payrollData?.data?.total ?? 0 };
  const validated = { done: compData?.data?.validated    ?? 0, total: compData?.data?.total   ?? 0 };
  const emailPend = compData?.data?.emailPendientes ?? 0;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
          <ClipboardCheck size={17} className="text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Tareas pendientes</h3>
          <p className="text-xs text-gray-400">Estado operativo del mes</p>
        </div>
      </div>
      <div className="space-y-2">
        <TaskProgressRow label="Boletas de planilla confirmadas" done={boletas.done} total={boletas.total} color="bg-brand-500" />
        <TaskProgressRow label="Comprobantes de proveedor validados" done={validated.done} total={validated.total} color="bg-purple-500" />
        {emailPend > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
            <Mail size={14} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium">{emailPend} comprobante{emailPend !== 1 ? 's' : ''} por revisar en bandeja de entrada</p>
          </div>
        )}
        {boletas.total === 0 && validated.total === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">No hay datos de tareas para este mes.</p>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const userId   = user?.id ?? 'guest';

  const { config, toggleVisible, reorder, reset } = useDashConfig(userId);
  const [editMode, setEditMode] = useState(false);
  const dragId    = useRef<CardId | null>(null);
  const [dragOver, setDragOver] = useState<CardId | null>(null);

  const [month, setMonth]               = useState(currentMonthStr);
  const [customerType, setCustomerType] = useState<'all' | 'B2B' | 'B2C'>('all');
  const isCurrent = month === currentMonthStr();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [widgetPopupOpen, setWidgetPopupOpen] = useState(false);

  const { data: alerts }     = useQuery({ queryKey: ['reorder-alerts'],    queryFn: () => api.get('/v1/inventory/reorder-alerts').then(r => r.data) });
  const { data: expiry }     = useQuery({ queryKey: ['expiry-alerts'],     queryFn: () => api.get('/v1/inventory/batches/expiry-alerts').then(r => r.data) });
  const { data: orders }     = useQuery({ queryKey: ['sales-orders'],      queryFn: () => api.get('/v1/sales-orders/').then(r => r.data) });
  const { data: prodOrders } = useQuery({ queryKey: ['production-orders'], queryFn: () => api.get('/v1/production/orders').then(r => r.data) });
  const { data: stock }      = useQuery({ queryKey: ['stock'],             queryFn: () => api.get('/v1/inventory/ingredients').then(r => r.data) });

  const pendingOrders  = orders?.data?.filter((o: any) => ['PENDING', 'CONFIRMED'].includes(o.status))?.length ?? 0;
  const inProgressProd = prodOrders?.data?.filter((o: any) => o.status === 'IN_PROGRESS')?.length ?? 0;
  const lowStock       = alerts?.data?.length ?? 0;
  const expiringSoon   = expiry?.data?.length ?? 0;
  const ingredients    = stock?.data?.length  ?? 0;

  const handleDragStart = (id: CardId) => { dragId.current = id; };
  const handleDragOver  = (e: React.DragEvent, id: CardId) => { e.preventDefault(); setDragOver(id); };
  const handleDrop      = (toId: CardId) => {
    if (dragId.current && dragId.current !== toId) reorder(dragId.current, toId);
    dragId.current = null;
    setDragOver(null);
  };

  const renderCard = (card: DashCard) => {
    const wrap = (id: CardId, children: React.ReactNode) => (
      <DraggableSection key={id} id={id} editMode={editMode}
        onRemove={() => toggleVisible(id)}
        onDragStart={() => handleDragStart(id)}
        onDragOver={e => handleDragOver(e, id)}
        onDrop={() => handleDrop(id)}
        isDragOver={dragOver === id}
      >
        {children}
      </DraggableSection>
    );

    switch (card.id) {
      case 'income':
        return wrap('income', <IncomeCard month={month} customerType={customerType} />);

      case 'kpis':
        return wrap('kpis',
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={ShoppingCart}  label="Pedidos pendientes"  value={pendingOrders}  sub="Confirmados + pendientes" color="bg-blue-500"   to="/sales" />
            <StatCard icon={Factory}       label="Producción activa"   value={inProgressProd} sub="Órdenes en proceso"       color="bg-green-500"  to="/production" />
            <StatCard icon={AlertTriangle} label="Reposición urgente"  value={lowStock}       sub="Ingredientes bajo mínimo" color="bg-orange-500" to="/inventory" />
            <StatCard icon={Clock}         label="Por vencer pronto"   value={expiringSoon}   sub="Lotes próximos a vencer"  color="bg-red-500"    to="/inventory" />
            <StatCard icon={Package}       label="Ingredientes activos" value={ingredients}   sub="En almacén principal"     color="bg-purple-500" to="/inventory" />
            <StatCard icon={TrendingUp}    label="Módulos activos"     value="12"             sub="API 100% operativa"       color="bg-brand-600" />
          </div>
        );

      case 'birthdays':
        return wrap('birthdays', <BirthdayCard />);

      case 'recentSales':
        return wrap('recentSales',
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Últimos pedidos</h2>
              <Link to="/sales" className="text-xs text-brand-600 hover:underline">Ver todos →</Link>
            </div>
            {orders?.data?.slice(0, 5).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between py-2 border-b border-brand-100 last:border-0">
                <div>
                  <p className="text-sm font-medium">{o.orderNumber}</p>
                  <p className="text-xs text-gray-400">{o.channel} · {o.customer?.businessName ?? o.customer?.fullName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{fmtMoney(o.totalAmountPen)}</p>
                  <StatusBadge status={o.status} />
                </div>
              </div>
            ))}
            {!orders?.data?.length && <p className="text-sm text-gray-400 py-4 text-center">No hay pedidos aún</p>}
          </div>
        );

      case 'prodOrders':
        return wrap('prodOrders',
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Órdenes de producción</h2>
              <Link to="/production" className="text-xs text-brand-600 hover:underline">Ver todas →</Link>
            </div>
            {prodOrders?.data?.slice(0, 5).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between py-2 border-b border-brand-100 last:border-0">
                <div>
                  <p className="text-sm font-medium">{o.batchCode}</p>
                  <p className="text-xs text-gray-400">{o.recipe?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{fmtInt(o.plannedQty)} uds</p>
                  <StatusBadge status={o.status} />
                </div>
              </div>
            ))}
            {!prodOrders?.data?.length && <p className="text-sm text-gray-400 py-4 text-center">No hay órdenes aún</p>}
          </div>
        );

      case 'comprobantes':
        return wrap('comprobantes', <ComprobantesCard />);

      case 'payrollSummary':
        return wrap('payrollSummary', <PayrollSummaryCard />);

      case 'stockAlerts':
        return wrap('stockAlerts', <StockAlertsCard />);

      case 'expiryAlerts':
        return wrap('expiryAlerts', <ExpiryAlertsCard />);

      case 'tasks':
        return wrap('tasks', <TasksCard month={month} />);

      default: return null;
    }
  };

  const topIds:    CardId[] = ['income', 'kpis'];
  const bottomIds: CardId[] = ['birthdays', 'recentSales', 'prodOrders', 'comprobantes', 'payrollSummary', 'stockAlerts', 'expiryAlerts', 'tasks'];
  const visibleCards  = config.filter(c => c.visible);
  const hiddenCards   = config.filter(c => !c.visible);
  const visibleTop    = visibleCards.filter(c => topIds.includes(c.id));
  const visibleBottom = visibleCards.filter(c => bottomIds.includes(c.id));

  // Close date picker when clicking outside
  const handleOutsideClick = () => {
    if (datePickerOpen) setDatePickerOpen(false);
    if (widgetPopupOpen) setWidgetPopupOpen(false);
  };

  return (
    <div className="space-y-6" onClick={handleOutsideClick}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bienvenido, {user?.fullName?.split(' ')[0]} 👋</h1>
          <p className="text-gray-500 mt-1">Resumen operativo de Victorsdou Bakery</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <div className="relative">
            <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg px-1.5 py-1 shadow-sm">
              <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" aria-label="Mes anterior">
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setDatePickerOpen(v => !v)}
                className="text-sm font-medium text-gray-700 capitalize px-2 min-w-[136px] text-center hover:bg-gray-50 rounded py-0.5 transition-colors"
              >
                {monthLabel(month)}
              </button>
              <button onClick={() => !isCurrent && setMonth(m => shiftMonth(m, 1))} disabled={isCurrent}
                className={`p-1 rounded transition-colors ${isCurrent ? 'text-gray-200 cursor-default' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'}`} aria-label="Mes siguiente">
                <ChevronRight size={15} />
              </button>
            </div>
            {datePickerOpen && (() => {
              const [selY, selMo] = month.split('-').map(Number);
              const nowY = new Date().getFullYear();
              const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
              return (
                <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64" onMouseDown={e => e.stopPropagation()}>
                  {/* Year row */}
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => { const ny = selY - 1; setMonth(`${ny}-${String(selMo).padStart(2,'0')}`); }} className="p-1 rounded hover:bg-gray-100 text-gray-500"><ChevronLeft size={14}/></button>
                    <span className="text-sm font-semibold text-gray-800">{selY}</span>
                    <button onClick={() => { if (selY < nowY) { const ny = selY + 1; setMonth(`${ny}-${String(selMo).padStart(2,'0')}`); }}} disabled={selY >= nowY} className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"><ChevronRight size={14}/></button>
                  </div>
                  {/* Month grid */}
                  <div className="grid grid-cols-4 gap-1">
                    {MONTHS_ES.map((lbl, idx) => {
                      const mo = idx + 1;
                      const isFuture = selY === nowY && mo > new Date().getMonth() + 1;
                      const isSelected = selY === selY && mo === selMo;
                      return (
                        <button key={mo} disabled={isFuture}
                          onClick={() => { setMonth(`${selY}-${String(mo).padStart(2,'0')}`); setDatePickerOpen(false); }}
                          className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${isSelected ? 'bg-brand-600 text-white' : isFuture ? 'text-gray-200 cursor-default' : 'hover:bg-brand-50 text-gray-600 hover:text-brand-700'}`}>
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => { setMonth(currentMonthStr()); setDatePickerOpen(false); }} className="w-full mt-2 text-xs text-brand-600 hover:text-brand-800 font-medium py-1 hover:bg-brand-50 rounded-lg transition-colors">
                    Hoy
                  </button>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            {(['all', 'B2B', 'B2C'] as const).map(t => (
              <button key={t} onClick={() => setCustomerType(t)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${customerType === t ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
                {t === 'all' ? 'Todos' : t}
              </button>
            ))}
          </div>
          {!editMode && (
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setWidgetPopupOpen(v => !v); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-brand-600 border-brand-200 hover:bg-brand-50 hover:border-brand-400 transition-all shadow-sm"
              >
                <Plus size={13} /> Agregar widget
              </button>
              {widgetPopupOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[230px] overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Widgets del dashboard</p>
                  <div className="py-1">
                    {CARD_DEFS.map(def => {
                      const card = config.find(c => c.id === def.id);
                      const isVisible = card?.visible ?? false;
                      return (
                        <button key={def.id}
                          onClick={() => { if (!isVisible) toggleVisible(def.id); setWidgetPopupOpen(false); }}
                          className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors ${isVisible ? 'cursor-default' : 'hover:bg-brand-50 cursor-pointer'}`}
                        >
                          <span className={isVisible ? 'text-gray-300' : 'text-gray-700'}>{def.label}</span>
                          {isVisible
                            ? <span className="text-xs text-gray-300 font-medium flex-shrink-0">Activo</span>
                            : <Plus size={13} className="text-brand-500 flex-shrink-0" />
                          }
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-gray-100 px-3 py-2">
                    <button
                      onClick={() => { setEditMode(true); setWidgetPopupOpen(false); }}
                      className="text-xs text-gray-400 hover:text-brand-600 flex items-center gap-1.5 transition-colors py-0.5"
                    >
                      <LayoutGrid size={11} /> Personalizar orden y visibilidad
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <button onClick={() => setEditMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shadow-sm ${editMode ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'}`}>
            <LayoutGrid size={13} />
            {editMode ? 'Listo' : 'Personalizar'}
          </button>
        </div>
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-brand-700">
            <GripVertical size={16} />
            <span className="font-medium">Modo edición</span>
            <span className="text-brand-500 hidden sm:inline">— Arrastra para reordenar · × para ocultar</span>
          </div>
          <button onClick={reset} className="text-xs text-brand-500 hover:text-brand-700 underline">Restaurar</button>
        </div>
      )}

      {/* Top cards — 2-col grid (income half-width alongside kpis) */}
      {visibleTop.length > 0 && (
        <div className={visibleTop.length === 1 ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start'}>
          {visibleTop.map(c => renderCard(c))}
        </div>
      )}

      {/* Bottom cards — 2-col grid */}
      {visibleBottom.length > 0 && (
        <div className={visibleBottom.length === 1 ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-6'}>
          {visibleBottom.map(c => renderCard(c))}
        </div>
      )}

      {/* Restore hidden cards */}
      {editMode && hiddenCards.length > 0 && (
        <div className="card p-4 border-dashed border-2 border-gray-200 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Plus size={12} /> Secciones ocultas — click para mostrar
          </p>
          <div className="flex flex-wrap gap-2">
            {hiddenCards.map(c => {
              const def = CARD_DEFS.find(d => d.id === c.id);
              return (
                <button key={c.id} onClick={() => toggleVisible(c.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors">
                  <Plus size={12} /> {def?.label ?? c.id}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
