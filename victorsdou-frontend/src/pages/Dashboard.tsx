import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  Package, AlertTriangle, Factory, ShoppingCart,
  TrendingUp, Clock, ChevronLeft, ChevronRight, DollarSign,
} from 'lucide-react';
import { Link } from 'react-router-dom';

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
  return new Date(y, mo - 1, 1)
    .toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ── StatCard ─────────────────────────────────────────────────────────────────

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

function IncomeCard({
  month,
  customerType,
}: {
  month: string;
  customerType: 'all' | 'B2B' | 'B2C';
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-summary', month, customerType],
    queryFn: () =>
      api
        .get(
          `/v1/invoices/summary?month=${month}${
            customerType !== 'all' ? `&customerType=${customerType}` : ''
          }`,
        )
        .then(r => r.data.data),
  });

  const total    = data?.totalIncome         ?? 0;
  const subtotal = data?.subtotal            ?? 0;
  const igv      = data?.igv                 ?? 0;
  const count    = data?.invoiceCount        ?? 0;
  const factura  = data?.breakdown?.factura  ?? 0;
  const boleta   = data?.breakdown?.boleta   ?? 0;

  return (
    <div className="card p-5 flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-500">
        <DollarSign size={22} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500 leading-tight">Ingresos del mes</p>

        {isLoading ? (
          <p className="text-2xl font-bold text-gray-300 tabular-nums animate-pulse">S/ —</p>
        ) : (
          <p className="text-2xl font-bold text-gray-900 tabular-nums">S/ {fmt(total)}</p>
        )}

        <p className="text-xs text-gray-400 mt-1">
          Sin IGV:&nbsp;<span className="font-medium text-gray-600">S/ {fmt(subtotal)}</span>
          &ensp;·&ensp;
          IGV:&nbsp;<span className="font-medium text-gray-600">S/ {fmt(igv)}</span>
        </p>

        {customerType === 'all' && (
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5 font-medium">
              Facturas&nbsp;S/ {fmt(factura)}
            </span>
            <span className="text-xs bg-purple-50 text-purple-700 rounded px-2 py-0.5 font-medium">
              Boletas&nbsp;S/ {fmt(boleta)}
            </span>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-1.5">
          {count} comprobante{count !== 1 ? 's' : ''} emitido{count !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}

// ── StatusBadge (shared) ──────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING:     'bg-yellow-100 text-yellow-800',
    CONFIRMED:   'bg-blue-100 text-blue-800',
    IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
    COMPLETED:   'bg-green-100 text-green-800',
    CANCELLED:   'bg-red-100 text-red-800',
    DELIVERED:   'bg-emerald-100 text-emerald-800',
    DRAFT:       'bg-gray-100 text-gray-600',
    APPROVED:    'bg-cyan-100 text-cyan-800',
  };
  return (
    <span className={`badge ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();

  // ── Filters ───────────────────────────────────────────────────────────────
  const [month, setMonth] = useState(currentMonthStr);
  const [customerType, setCustomerType] = useState<'all' | 'B2B' | 'B2C'>('all');
  const isCurrent = month === currentMonthStr();

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: alerts }     = useQuery({ queryKey: ['reorder-alerts'],    queryFn: () => api.get('/v1/inventory/reorder-alerts').then(r => r.data) });
  const { data: expiry }     = useQuery({ queryKey: ['expiry-alerts'],     queryFn: () => api.get('/v1/inventory/batches/expiry-alerts').then(r => r.data) });
  const { data: orders }     = useQuery({ queryKey: ['sales-orders'],      queryFn: () => api.get('/v1/sales-orders/').then(r => r.data) });
  const { data: prodOrders } = useQuery({ queryKey: ['production-orders'], queryFn: () => api.get('/v1/production/orders').then(r => r.data) });
  const { data: stock }      = useQuery({ queryKey: ['stock'],             queryFn: () => api.get('/v1/inventory/ingredients').then(r => r.data) });

  const pendingOrders  = orders?.data?.filter((o: any) => ['PENDING', 'CONFIRMED'].includes(o.status))?.length ?? 0;
  const inProgressProd = prodOrders?.data?.filter((o: any) => o.status === 'IN_PROGRESS')?.length ?? 0;
  const lowStock       = alerts?.data?.length ?? 0;
  const expiringSoon   = expiry?.data?.length ?? 0;
  const ingredients    = stock?.data?.length ?? 0;

  return (
    <div className="space-y-6">

      {/* ── Header + filter bar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bienvenido, {user?.fullName?.split(' ')[0]} 👋
          </h1>
          <p className="text-gray-500 mt-1">Resumen operativo de Victorsdou Bakery</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">

          {/* ── Month picker ── */}
          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg px-1.5 py-1 shadow-sm">
            <button
              onClick={() => setMonth(m => shiftMonth(m, -1))}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-medium text-gray-700 capitalize px-1 min-w-[136px] text-center select-none">
              {monthLabel(month)}
            </span>
            <button
              onClick={() => !isCurrent && setMonth(m => shiftMonth(m, 1))}
              disabled={isCurrent}
              className={`p-1 rounded transition-colors ${
                isCurrent
                  ? 'text-gray-200 cursor-default'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'
              }`}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* ── Customer type toggle ── */}
          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            {(['all', 'B2B', 'B2C'] as const).map(t => (
              <button
                key={t}
                onClick={() => setCustomerType(t)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  customerType === t
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                {t === 'all' ? 'Todos' : t}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* ── KPI grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Income card — full width */}
        <div className="col-span-2 lg:col-span-3">
          <IncomeCard month={month} customerType={customerType} />
        </div>

        <StatCard icon={ShoppingCart} label="Pedidos pendientes" value={pendingOrders}
          sub="Confirmados + pendientes" color="bg-blue-500" to="/sales" />
        <StatCard icon={Factory} label="Producción activa" value={inProgressProd}
          sub="Órdenes en proceso" color="bg-green-500" to="/production" />
        <StatCard icon={AlertTriangle} label="Reposición urgente" value={lowStock}
          sub="Ingredientes bajo mínimo" color="bg-orange-500" to="/inventory" />
        <StatCard icon={Clock} label="Por vencer pronto" value={expiringSoon}
          sub="Lotes próximos a vencer" color="bg-red-500" to="/inventory" />
        <StatCard icon={Package} label="Ingredientes activos" value={ingredients}
          sub="En almacén principal" color="bg-purple-500" to="/inventory" />
        <StatCard icon={TrendingUp} label="Módulos activos" value="12"
          sub="API 100% operativa" color="bg-brand-600" />
      </div>

      {/* ── Quick links ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent sales */}
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
                <p className="text-sm font-semibold">S/ {Number(o.totalAmountPen).toFixed(2)}</p>
                <StatusBadge status={o.status} />
              </div>
            </div>
          ))}
          {!orders?.data?.length && <p className="text-sm text-gray-400 py-4 text-center">No hay pedidos aún</p>}
        </div>

        {/* Production orders */}
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
                <p className="text-sm font-semibold">{o.plannedQty} uds</p>
                <StatusBadge status={o.status} />
              </div>
            </div>
          ))}
          {!prodOrders?.data?.length && <p className="text-sm text-gray-400 py-4 text-center">No hay órdenes aún</p>}
        </div>

      </div>
    </div>
  );
}
