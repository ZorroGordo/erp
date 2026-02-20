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
  const [suggestDate, setSuggestDate]   = useState(today());
  const [suggestion, setSuggestion]     = useState<any>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [splitMode, setSplitMode]       = useState<'full' | 'district'>('full');
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeForm, setRouteForm]       = useState({ driverId: '', scheduledDate: today(), notes: '' });

  // Existing routes list
  const { data: routes, isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => api.get('/v1/delivery/routes').then(r => r.data),
  });

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
      toast.success('Ruta creada');
      setShowRouteForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  // Fetch route suggestion
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

  // Confirm and create route(s)
  function handleConfirmRoute(driverId: string, date: string, stops: SuggestedStop[]) {
    createRoute.mutate({
      scheduledDate: date,
      driverId,
      jobs: stops.map((s, i) => ({
        salesOrderId:        s.sucursalId ?? s.customerId, // placeholder — link to real order later
        sequence:            i + 1,
        deliveryAddressLine: `${s.addressLine1}${s.addressLine2 ? ', ' + s.addressLine2 : ''} — ${s.district}`,
        customerContact:     s.contactName ?? s.customerName,
        customerPhone:       s.contactPhone ?? undefined,
        scheduledTimeWindow: s.deliveryHour ? `${s.deliveryHour}-${incrementHour(s.deliveryHour, 2)}` : undefined,
      })),
    });
    setSuggestion(null);
  }

  function incrementHour(h: string, n: number): string {
    const [hh, mm] = h.split(':').map(Number);
    const next = (hh + n) % 24;
    return `${String(next).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // Build route groups based on split mode
  function buildGroups(): { label: string; stops: SuggestedStop[] }[] {
    if (!suggestion?.stops?.length) return [];
    if (splitMode === 'full') {
      return [{ label: 'Ruta completa del día', stops: suggestion.stops }];
    }
    // Split by district
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

      {/* ── Route Suggestion Panel ─────────────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-brand-500" />
          <h2 className="font-semibold text-gray-900">Sugerencia de ruta</h2>
          <span className="badge bg-brand-100 text-brand-600 text-xs">Basado en sucursales</span>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            className="input max-w-xs"
            value={suggestDate}
            onChange={e => { setSuggestDate(e.target.value); setSuggestion(null); }}
          />
          <button
            onClick={fetchSuggestion}
            disabled={suggestLoading}
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {suggestLoading
              ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Calculando...</>
              : <><Sparkles size={14} /> Sugerir ruta del {fmtDate(suggestDate)}</>
            }
          </button>
        </div>

        {/* Results */}
        {suggestion && suggestion.total > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between bg-brand-50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-semibold text-brand-900">{suggestion.total} entregas</span>
                <span className="text-brand-600">{suggestion.byDistrict?.length} distritos</span>
                <span className="text-brand-600">{suggestion.dow}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Dividir por:</span>
                <button
                  onClick={() => setSplitMode('full')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    splitMode === 'full' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                  }`}
                >
                  <Truck size={11} className="inline mr-1" /> Ruta única
                </button>
                <button
                  onClick={() => setSplitMode('district')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${
                    splitMode === 'district' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                  }`}
                >
                  <Split size={11} /> Por distrito
                </button>
              </div>
            </div>

            {/* District overview chips */}
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

            {/* Route groups */}
            <div className="space-y-4">
              {buildGroups().map((group, i) => (
                <RouteGroup
                  key={`${splitMode}-${i}`}
                  label={group.label}
                  stops={group.stops}
                  routeIndex={i}
                  drivers={drivers}
                  onConfirm={handleConfirmRoute}
                />
              ))}
            </div>
          </div>
        )}

        {suggestion && suggestion.total === 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
            <AlertCircle size={15} className="text-gray-400" />
            No hay sucursales con entrega programada para el {fmtDate(suggestDate)}.
            Configura los días de entrega en cada sucursal desde el módulo de Clientes.
          </div>
        )}
      </div>

      {/* ── Manual route form ─── */}
      {showRouteForm && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Nueva ruta manual</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Chofer</label>
              <select className="input" value={routeForm.driverId} onChange={e => setRouteForm(f => ({ ...f, driverId: e.target.value }))}>
                <option value="">Seleccionar chofer...</option>
                {drivers.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.employee?.fullName ?? d.id}</option>
                ))}
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
            <button
              className="btn-primary"
              onClick={() => createRoute.mutate({ ...routeForm, jobs: [] })}
            >Crear ruta</button>
            <button className="btn-secondary" onClick={() => setShowRouteForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Routes list ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Truck size={18} className="text-gray-400" />
          <h2 className="font-semibold">Rutas de entrega</h2>
          <span className="ml-auto text-sm text-gray-400">{routes?.data?.length ?? 0}</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : (
          <div className="table-container">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Código</th>
                  <th className="px-5 py-3 text-left">Chofer</th>
                  <th className="px-5 py-3 text-left">Fecha</th>
                  <th className="px-5 py-3 text-right">Paradas</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {routes?.data?.map((r: any) => (
                  <tr key={r.id} className="table-row-hover">
                    <td className="px-5 py-3 font-mono text-xs">{r.routeCode}</td>
                    <td className="px-5 py-3 flex items-center gap-1.5">
                      <Building2 size={12} className="text-gray-400" />
                      {r.driver?.employee?.fullName ?? r.driverId}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {r.scheduledDate ? new Date(r.scheduledDate).toLocaleDateString('es-PE') : '—'}
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
          <p className="text-center text-gray-400 py-8">Sin rutas aún — usa la sugerencia de ruta para comenzar</p>
        )}
      </div>
    </div>
  );
}
