"""
Patch Dashboard.tsx:
Add 4 new widget options:
- comprobantes: Comprobantes pendientes
- payrollSummary: Resumen de nómina (employees count + payslip status)
- stockAlerts: Alertas de stock crítico (table)
- expiryAlerts: Lotes por vencer (table)
"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Dashboard.tsx'
with open(path) as f:
    src = f.read()

# ── 1. Extend CardId and CARD_DEFS ──────────────────────────────────────────
src = src.replace(
    "type CardId = 'income' | 'kpis' | 'birthdays' | 'recentSales' | 'prodOrders';",
    "type CardId = 'income' | 'kpis' | 'birthdays' | 'recentSales' | 'prodOrders' | 'comprobantes' | 'payrollSummary' | 'stockAlerts' | 'expiryAlerts';"
)

src = src.replace(
    '''const CARD_DEFS: { id: CardId; label: string }[] = [
  { id: 'income',      label: 'Ingresos del mes' },
  { id: 'kpis',        label: 'KPIs operativos' },
  { id: 'birthdays',   label: 'Cumpleaños del mes' },
  { id: 'recentSales', label: 'Últimos pedidos' },
  { id: 'prodOrders',  label: 'Producción' },
];''',
    '''const CARD_DEFS: { id: CardId; label: string }[] = [
  { id: 'income',         label: 'Ingresos del mes' },
  { id: 'kpis',           label: 'KPIs operativos' },
  { id: 'birthdays',      label: 'Cumpleaños del mes' },
  { id: 'recentSales',    label: 'Últimos pedidos' },
  { id: 'prodOrders',     label: 'Producción' },
  { id: 'comprobantes',   label: 'Comprobantes pendientes' },
  { id: 'payrollSummary', label: 'Resumen de nómina' },
  { id: 'stockAlerts',    label: 'Stock crítico' },
  { id: 'expiryAlerts',   label: 'Lotes por vencer' },
];'''
)

# ── 2. Add new widget components before the Dashboard export ─────────────────
new_widgets = '''// ── ComprobantesCard ─────────────────────────────────────────────────────────
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

'''

src = src.replace(
    '// ── Dashboard ─────────────────────────────────────────────────────────────────',
    new_widgets + '// ── Dashboard ─────────────────────────────────────────────────────────────────'
)

# ── 3. Add FileText and Mail to lucide-react imports ──────────────────────────
src = src.replace(
    '  Package, AlertTriangle, Factory, ShoppingCart, TrendingUp, Clock,\n  ChevronLeft, ChevronRight, DollarSign, Cake, GripVertical, X, Plus,\n  LayoutGrid,',
    '  Package, AlertTriangle, Factory, ShoppingCart, TrendingUp, Clock,\n  ChevronLeft, ChevronRight, DollarSign, Cake, GripVertical, X, Plus,\n  LayoutGrid, FileText, Mail,'
)

# ── 4. Add new cards to bottomIds and renderCard switch ───────────────────────
src = src.replace(
    "  const topIds:    CardId[] = ['income', 'kpis'];\n  const bottomIds: CardId[] = ['birthdays', 'recentSales', 'prodOrders'];",
    "  const topIds:    CardId[] = ['income', 'kpis'];\n  const bottomIds: CardId[] = ['birthdays', 'recentSales', 'prodOrders', 'comprobantes', 'payrollSummary', 'stockAlerts', 'expiryAlerts'];"
)

# ── 5. Add cases to renderCard switch ─────────────────────────────────────────
src = src.replace(
    "      default: return null;\n    }\n  };",
    """      case 'comprobantes':
        return wrap('comprobantes', <ComprobantesCard />);

      case 'payrollSummary':
        return wrap('payrollSummary', <PayrollSummaryCard />);

      case 'stockAlerts':
        return wrap('stockAlerts', <StockAlertsCard />);

      case 'expiryAlerts':
        return wrap('expiryAlerts', <ExpiryAlertsCard />);

      default: return null;
    }
  };"""
)

with open(path, 'w') as f:
    f.write(src)
print("Dashboard.tsx updated with new widget cards")
