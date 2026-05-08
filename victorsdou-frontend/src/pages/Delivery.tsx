import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import {
  Plus, Truck, MapPin, Clock, Package, Phone, User,
  ChevronDown, ChevronRight, Sparkles, Split,
  GripVertical, Check, AlertCircle, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ────────────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().split('T')[0];
}
function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
}

const STATUS_COLORS: Record<string, string> = {
  PLANNED:     'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED:   'bg-green-100 text-green-700',
};
const CAT_COLORS: Record<string, string> = {
  SUPERMERCADO:    'bg-sky-100 text-sky-700',
  TIENDA_NATURISTA:'bg-green-100 text-green-700',
  CAFETERIA:       'bg-amber-100 text-amber-700',
  RESTAURANTE:     'bg-orange-100 text-orange-700',
  HOTEL:           'bg-violet-100 text-violet-700',
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface SuggestedStop {
  sequence:         number;
  stopType:         'SUCURSAL' | 'CUSTOMER'; // CUSTOMER = direct delivery addr, no sucursales
  sucursalId?:      string;
  sucursalName?:    string;
  customerId:       string;
  customerName:     string;
  customerCategory: string | null;
  contactName:      string | null;
  contactPhone:     string | null;
  addressLine1:     string;
  addressLine2:     string | null;
  district:         string;
  deliveryHour:     string | null;
  deliveryUnitsQty: number | null;
  deliveryNotes:    string | null;
}

// ── StopRow ────────────────────────────────────────────────────────────────────
function StopRow({ stop, index, onMove }: { stop: SuggestedStop; index: number; onMove: (from: number, to: number) => void }) {
  return (
    <div className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-3 group hover:border-brand-300 hover:shadow-sm transition-all">
      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        <GripVertical size={14} className="text-gray-300 group-hover:text-gray-400 cursor-grab" />
        <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {stop.stopType === 'SUCURSAL' ? (
            <>
              <span className="font-medium text-gray-900 text-sm">{stop.sucursalName}</span>
              <span className="text-gray-400 text-xs">·</span>
              <span className="text-gray-600 text-xs">{stop.customerName}</span>
            </>
          ) : (
            <span className="font-medium text-gray-900 text-sm">{stop.customerName}</span>
          )}
          {stop.customerCategory && (
            <span className={`badge text-xs ${CAT_COLORS[stop.customerCategory] ?? 'bg-gray-100 text-gray-500'}`}>
              {stop.customerCategory}
            </span>
          )}
          {stop.stopType === 'CUSTOMER' && (
            <span className="badge bg-purple-50 text-purple-600 text-xs">Dirección directa</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <MapPin size={10} className="text-gray-400" />
            {stop.addressLine1}{stop.addressLine2 ? `, ${stop.addressLine2}` : ''} — {stop.district}
          </span>
          {stop.contactPhone && (
            <span className="flex items-center gap-1">
              <Phone size={10} className="text-gray-400" /> {stop.contactPhone}
            </span>
          )}
          {stop.contactName && (
            <span className="flex items-center gap-1">
              <User size={10} className="text-gray-400" /> {stop.contactName}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {stop.deliveryHour && (
            <span className="flex items-center gap-1 text-xs text-brand-600">
              <Clock size={10} /> {stop.deliveryHour}
            </span>
          )}
          {stop.deliveryUnitsQty && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Package size={10} /> {stop.deliveryUnitsQty} und.
            </span>
          )}
          {stop.deliveryNotes && (
            <span className="text-xs text-amber-600 italic truncate max-w-xs">{stop.deliveryNotes}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── RouteGroup ─────────────────────────────────────────────────────────────────
function RouteGroup({
  label, stops, routeIndex, drivers, onConfirm,
}: {
  label: string;
  stops: SuggestedStop[];
  routeIndex: number;
  drivers: any[];
  onConfirm: (driverId: string, date: string, stops: SuggestedStop[]) => void;
}) {
  const [open, setOpen]       = useState(true);
  const [driverId, setDriverId] = useState('');
  const [date, setDate]       = useState(today());
  const [localStops, setLocalStops] = useState(stops);

  function moveStop(from: number, to: number) {
    const arr = [...localStops];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setLocalStops(arr);
  }

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <span className="font-semibold text-gray-900">{label}</span>
          <span className="badge bg-brand-100 text-brand-700">{localStops.length} paradas</span>
          {localStops.some(s => s.deliveryHour) && (
            <span className="text-xs text-gray-400">
              {localStops.filter(s => s.deliveryHour).map(s => s.deliveryHour).sort()[0]} →{' '}
              {localStops.filter(s => s.deliveryHour).map(s => s.deliveryHour).sort().at(-1)}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">Ruta {routeIndex + 1}</span>
      </div>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-100">
          {/* Stops */}
          <div className="space-y-2 pt-3">
            {localStops.map((stop, i) => (
              <StopRow key={stop.sucursalId ?? stop.customerId} stop={stop} index={i} onMove={moveStop} />
            ))}
          </div>

          {/* Assign driver + confirm */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <select
              className="input flex-1 max-w-xs"
              value={driverId}
              onChange={e => setDriverId(e.target.value)}
            >
              <option value="">Asignar chofer...</option>
              {drivers.map((d: any) => (
                <option key={d.id} value={d.id}>{d.employee?.fullName ?? d.id}</option>
              ))}
            </select>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            <button
              onClick={() => {
                if (!driverId) return toast.error('Selecciona un chofer');
                onConfirm(driverId, date, localStops);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <Check size={14} /> Confirmar ruta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Delivery() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'scheduled'>('pending');
  const [suggestDate, setSuggestDate]   = useState(today());
  const [suggestion, setSuggestion]     = useState<any>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [splitMode, setSplitMode]       = useState<'full' | 'district'>('full');
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeForm, setRouteForm]       = useState({ driverId: '', scheduledDate: today(), notes: '' });
  const [selectedPendingOrders, setSelectedPendingOrders] = useState<Set<string>>(new Set());
  const [suggestRouteResult, setSuggestRouteResult] = useState<any>(null);
  const [suggestRouteLoading, setSuggestRouteLoading] = useState(false);
  const [suggestedDriverId, setSuggestedDriverId] = useState('');
  const [suggestedDate, setSuggestedDate] = useState(today());

  // Existing routes list (scheduled)
  const { data: routes, isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => api.get('/v1/delivery/routes').then(r => r.data),
  });

  // Pending orders (with guía, not assigned to route)
  const { data: pendingOrdersData, isLoading: pendingLoading } = useQuery({
    queryKey: ['delivery-pending-orders'],
    queryFn: () => api.get('/v1/delivery/pending-orders').then(r => r.data),
  });
  const pendingOrders = pendingOrdersData?.data ?? [];

  // Drivers list
  const { data: driversData } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.get('/v1/delivery/drivers').then(r => r.data),
  });
  const drivers = driversData?.data ?? [];

  const createRoute = useMutation({
    mutationFn: (b: any) => api.post('/v1/delivery/routes', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['delivery-pending-orders'] });
      toast.success('Ruta creada');
      setShowRouteForm(false);
      setSuggestRouteResult(null);
      setSelectedPendingOrders(new Set());
      setSuggestedDriverId('');
      setSuggestedDate(today());
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  // Fetch route suggestion based on sucursales
  async function fetchSuggestion() {
    setSuggestLoading(true);
    try {
      const r = await api.get(`/v1/delivery/suggest?date=${suggestDate}`);
      setSuggestion(r.data);
      if (r.data.total === 0) toast('No hay entregas programadas para ese día', { icon: '📭' });
    } catch {
      toast.error('Error al obtener sugerencia de ruta');
    } finally {
      setSuggestLoading(false);
    }
  }

  // Suggest route from selected pending orders
  async function fetchSuggestRoute() {
    if (selectedPendingOrders.size === 0) return toast.error('Selecciona al menos un pedido');
    setSuggestRouteLoading(true);
    try {
      const r = await api.post('/v1/delivery/suggest-route', { orderIds: Array.from(selectedPendingOrders) });
      setSuggestRouteResult(r.data);
    } catch {
      toast.error('Error al sugerir ruta');
    } finally {
      setSuggestRouteLoading(false);
    }
  }

  // Confirm and create route(s)
  function handleConfirmRoute(driverId: string, date: string, stops: SuggestedStop[]) {
    createRoute.mutate({
      scheduledDate: date,
      driverId,
      jobs: stops.map((s, i) => ({
        salesOrderId:        s.sucursalId ?? s.customerId,
        sequence:            i + 1,
        deliveryAddressLine: `${s.addressLine1}${s.addressLine2 ? ', ' + s.addressLine2 : ''} — ${s.district}`,
        customerContact:     s.contactName ?? s.customerName,
        customerPhone:       s.contactPhone ?? undefined,
        scheduledTimeWindow: s.deliveryHour ? `${s.deliveryHour}-${incrementHour(s.deliveryHour, 2)}` : undefined,
      })),
    });
    setSuggestion(null);
  }

  // Create route from suggest-route result
  function handleConfirmSuggestedRoute(driverId: string, date: string) {
    if (!driverId) return toast.error('Selecciona un chofer');
    createRoute.mutate({
      scheduledDate: date,
      driverId,
      jobs: (suggestRouteResult?.stops ?? []).map((s: any, i: number) => ({
        salesOrderId:        s.salesOrderId,
        sequence:            i + 1,
        deliveryAddressLine: s.addressLine,
        customerContact:     s.contactName ?? s.customerName,
        customerPhone:       s.contactPhone ?? undefined,
      })),
    });
  }

  function incrementHour(h: string, n: number): string {
    const [hh, mm] = h.split(':').map(Number);
    const next = (hh + n) % 24;
    return `${String(next).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function buildGroups(): { label: string; stops: SuggestedStop[] }[] {
    if (!suggestion?.stops?.length) return [];
    if (splitMode === 'full') {
      return [{ label: 'Ruta completa del día', stops: suggestion.stops }];
    }
    const byDistrict: Record<string, SuggestedStop[]> = {};
    for (const s of suggestion.stops as SuggestedStop[]) {
      if (!byDistrict[s.district]) byDistrict[s.district] = [];
      byDistrict[s.district].push(s);
    }
    return Object.entries(byDistrict).map(([district, stops]) => ({
      label: `${district} (${stops.length} paradas)`,
      stops,
    }));
  }

  function togglePendingOrder(id: string) {
    const s = new Set(selectedPendingOrders);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedPendingOrders(s);
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Despacho</h1>
          <p className="text-gray-500 text-sm">Rutas de entrega y planificación</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={() => setShowRouteForm(v => !v)}>
          <Plus size={16} /> Ruta manual
        </button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-3 border-b border-gray-200">
        <button onClick={() => setTab('pending')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'pending' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>
          <Package size={14} className="inline mr-1.5" />
          Pedidos pendientes ({pendingOrders.length})
        </button>
        <button onClick={() => setTab('scheduled')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'scheduled' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>
          <Truck size={14} className="inline mr-1.5" />
          Rutas programadas ({routes?.data?.length ?? 0})
        </button>
      </div>

      {/* ── Pending Orders Tab ─────────────────────────────────────────────── */}
      {tab === 'pending' && (
        <>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-purple-500" />
                <h2 className="font-semibold">Pedidos con guía — sin ruta asignada</h2>
              </div>
              {selectedPendingOrders.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{selectedPendingOrders.size} seleccionados</span>
                  <button onClick={fetchSuggestRoute} disabled={suggestRouteLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
                    {suggestRouteLoading
                      ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /></>
                      : <Sparkles size={14} />
                    }
                    Sugerir ruta
                  </button>
                </div>
              )}
            </div>

            {pendingLoading ? (
              <div className="p-8 text-center text-gray-400">Cargando...</div>
            ) : pendingOrders.length === 0 ? (
              <div className="py-16 text-center">
                <Check size={40} className="text-green-200 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Todos los pedidos listos han sido asignados a ruta</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-purple-50 text-purple-700 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3 text-center w-10">
                        <input type="checkbox"
                          checked={selectedPendingOrders.size === pendingOrders.length && pendingOrders.length > 0}
                          onChange={() => {
                            if (selectedPendingOrders.size === pendingOrders.length) setSelectedPendingOrders(new Set());
                            else setSelectedPendingOrders(new Set(pendingOrders.map((o: any) => o.id)));
                          }}
                          className="rounded border-gray-300 cursor-pointer" />
                      </th>
                      <th className="px-5 py-3 text-left">Pedido</th>
                      <th className="px-5 py-3 text-left">Cliente</th>
                      <th className="px-5 py-3 text-left">Distrito</th>
                      <th className="px-5 py-3 text-left">Código postal</th>
                      <th className="px-5 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingOrders.map((o: any) => {
                      const addr = o.sucursal ?? o.customer?.addresses?.[0];
                      return (
                        <tr key={o.id} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-5 py-3 text-center">
                            <input type="checkbox" checked={selectedPendingOrders.has(o.id)} onChange={() => togglePendingOrder(o.id)} className="rounded border-gray-300 cursor-pointer" />
                          </td>
                          <td className="px-5 py-3 font-mono text-xs">{o.orderNumber}</td>
                          <td className="px-5 py-3">{o.customer?.displayName}</td>
                          <td className="px-5 py-3 text-xs text-gray-600">{addr?.district ?? '—'}</td>
                          <td className="px-5 py-3 text-xs font-mono text-gray-500">{addr?.postalCode ?? '—'}</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold">S/ {Number(o.totalPen).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Suggested route result */}
          {suggestRouteResult && (
            <div className="card p-5 space-y-4 border-l-4 border-brand-500">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-brand-500" />
                <h3 className="font-semibold">Ruta sugerida — {suggestRouteResult.total} paradas</h3>
              </div>
              {suggestRouteResult.byPostalCode?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestRouteResult.byPostalCode.map((g: any) => (
                    <div key={g.postalCode ?? 'sin-cp'} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-600">
                      <MapPin size={10} className="text-gray-400" />
                      <span className="font-medium">{g.postalCode ?? 'Sin CP'}</span>
                      <span className="text-gray-400">({g.count})</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {(suggestRouteResult.stops ?? []).map((s: any) => (
                  <div key={s.salesOrderId} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
                    <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">{s.sequence}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-gray-900">{s.customerName}</span>
                      <div className="text-xs text-gray-500">{s.addressLine} {s.postalCode ? `(CP: ${s.postalCode})` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <select className="input flex-1 max-w-xs" value={suggestedDriverId} onChange={e => setSuggestedDriverId(e.target.value)}>
                  <option value="">Asignar chofer...</option>
                  {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.employee?.fullName ?? d.id}</option>)}
                </select>
                <input type="date" className="input" value={suggestedDate} onChange={e => setSuggestedDate(e.target.value)} />
                <button onClick={() => handleConfirmSuggestedRoute(suggestedDriverId, suggestedDate)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
                  <Check size={14} /> Confirmar ruta
                </button>
              </div>
            </div>
          )}

          {/* Sucursal-based suggestion (legacy) */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-brand-500" />
              <h2 className="font-semibold text-gray-900">Sugerencia por sucursales</h2>
              <span className="badge bg-brand-100 text-brand-600 text-xs">Basado en días de entrega</span>
            </div>
            <div className="flex items-center gap-3">
              <input type="date" className="input max-w-xs" value={suggestDate}
                onChange={e => { setSuggestDate(e.target.value); setSuggestion(null); }} />
              <button onClick={fetchSuggestion} disabled={suggestLoading}
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {suggestLoading
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Calculando...</>
                  : <><Sparkles size={14} /> Sugerir ruta del {fmtDate(suggestDate)}</>
                }
              </button>
            </div>
            {suggestion && suggestion.total > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-brand-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-semibold text-brand-900">{suggestion.total} entregas</span>
                    <span className="text-brand-600">{suggestion.byDistrict?.length} distritos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSplitMode('full')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${splitMode === 'full' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                      <Truck size={11} className="inline mr-1" /> Ruta única
                    </button>
                    <button onClick={() => setSplitMode('district')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${splitMode === 'district' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                      <Split size={11} /> Por distrito
                    </button>
                  </div>
                </div>
                {suggestion.byDistrict?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestion.byDistrict.map((g: any) => (
                      <div key={g.district} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-600">
                        <MapPin size={10} className="text-gray-400" />
                        <span className="font-medium">{g.district}</span>
                        <span className="text-gray-400">({g.count})</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-4">
                  {buildGroups().map((group, i) => (
                    <RouteGroup key={`${splitMode}-${i}`} label={group.label} stops={group.stops} routeIndex={i} drivers={drivers} onConfirm={handleConfirmRoute} />
                  ))}
                </div>
              </div>
            )}
            {suggestion && suggestion.total === 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
                <AlertCircle size={15} className="text-gray-400" />
                No hay sucursales con entrega programada para el {fmtDate(suggestDate)}.
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Scheduled Routes Tab ──────────────────────────────────────────── */}
      {tab === 'scheduled' && (
        <>
          {/* Manual route form */}
          {showRouteForm && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">Nueva ruta manual</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Chofer</label>
                  <select className="input" value={routeForm.driverId} onChange={e => setRouteForm(f => ({ ...f, driverId: e.target.value }))}>
                    <option value="">Seleccionar chofer...</option>
                    {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.employee?.fullName ?? d.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha programada</label>
                  <input type="date" className="input" value={routeForm.scheduledDate}
                    onChange={e => setRouteForm(f => ({ ...f, scheduledDate: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                  <input className="input" value={routeForm.notes} placeholder="Instrucciones generales de la ruta..."
                    onChange={e => setRouteForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => createRoute.mutate({ ...routeForm, jobs: [] })}>Crear ruta</button>
                <button className="btn-secondary" onClick={() => setShowRouteForm(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Routes table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Truck size={18} className="text-gray-400" />
              <h2 className="font-semibold">Rutas programadas</h2>
              <span className="ml-auto text-sm text-gray-400">{routes?.data?.length ?? 0}</span>
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-gray-400">Cargando...</div>
            ) : (
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3 text-left">Fecha</th>
                      <th className="px-5 py-3 text-left">Código</th>
                      <th className="px-5 py-3 text-left">Chofer</th>
                      <th className="px-5 py-3 text-right">Paradas</th>
                      <th className="px-5 py-3 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {routes?.data?.map((r: any) => (
                      <tr key={r.id} className="table-row-hover">
                        <td className="px-5 py-3 text-gray-500">
                          {r.scheduledDate ? new Date(r.scheduledDate).toLocaleDateString('es-PE') : '—'}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">{r.routeCode}</td>
                        <td className="px-5 py-3 flex items-center gap-1.5">
                          <Building2 size={12} className="text-gray-400" />
                          {r.driver?.employee?.fullName ?? r.driverId}
                        </td>
                        <td className="px-5 py-3 text-right font-medium">{r.jobs?.length ?? 0}</td>
                        <td className="px-5 py-3">
                          <span className={`badge ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-500'}`}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!routes?.data?.length && !isLoading && (
              <p className="text-center text-gray-400 py-8">Sin rutas aún — usa la pestaña de pedidos pendientes para crear rutas</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
