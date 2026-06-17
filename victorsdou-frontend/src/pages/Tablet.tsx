import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Square, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

// Stages tracked on the shop floor (order matches the production flow). The
// hint shows which products each stage typically applies to; the operator
// records only the stages actually used for the batch.
const STAGES: { key: string; label: string; hint?: string }[] = [
  { key: 'DOSIFICADO',  label: 'Dosificado' },
  { key: 'AMASADO',     label: 'Amasado' },
  { key: 'PORCIONADO',  label: 'Porcionado' },
  { key: 'REPOSO',      label: 'Reposo',          hint: 'mie, ciabatta, seeded, blanco' },
  { key: 'BOLEADO',     label: 'Boleado',         hint: 'no ciabatta, focaccia' },
  { key: 'LABRADO',     label: 'Labrado',         hint: 'no hamburguesa' },
  { key: 'FERMENTADO',  label: 'Fermentado' },
  { key: 'REPOSO_FRIO', label: 'Reposo en frío',  hint: 'solo masa madre' },
  { key: 'PREPARACION', label: 'Preparación' },
  { key: 'HORNEADO',    label: 'Horneado' },
  { key: 'ENFRIADO',    label: 'Enfriado' },
  { key: 'ENVASADO',    label: 'Envasado' },
];

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  plannedQty: string;
  line?: string | null;
  recipe?: { product?: { name?: string } };
}

interface StageLog {
  id: string;
  stage: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  quantity: string | null;
  leftover: string | null;
  notes: string | null;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export default function Tablet() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: ordersData } = useQuery({
    queryKey: ['tablet-orders'],
    queryFn: () => api.get('/v1/production/orders').then(r => r.data),
    refetchInterval: 15_000,
  });
  const orders: Order[] = (ordersData?.data ?? []).filter(
    (o: Order) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED',
  );

  const selected = orders.find(o => o.id === selectedId) ?? null;

  if (!selected) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Producción — Tablet</h1>
          <Link to="/production" className="flex items-center gap-2 text-gray-300 hover:text-white text-lg">
            <ArrowLeft size={22} /> Volver
          </Link>
        </div>
        <p className="text-gray-400 mb-4 text-lg">Selecciona una orden para registrar los tiempos por etapa.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map(o => (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className="bg-gray-800 hover:bg-gray-700 rounded-2xl p-6 text-left transition-colors border border-gray-700"
            >
              <p className="text-2xl font-bold">{o.recipe?.product?.name ?? '—'}</p>
              <p className="font-mono text-emerald-400 text-lg mt-1">{o.orderNumber}</p>
              <p className="text-gray-400 mt-2">
                Plan: {Number(o.plannedQty)} {o.line ? `· Línea ${o.line}` : ''}
              </p>
            </button>
          ))}
          {orders.length === 0 && (
            <p className="text-gray-500 text-lg col-span-full text-center py-12">No hay órdenes en curso.</p>
          )}
        </div>
      </div>
    );
  }

  return <OrderStages order={selected} onBack={() => setSelectedId(null)} />;
}

function OrderStages({ order, onBack }: { order: Order; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: stagesData } = useQuery({
    queryKey: ['tablet-stages', order.id],
    queryFn: () => api.get(`/v1/production/orders/${order.id}/stages`).then(r => r.data),
    refetchInterval: 10_000,
  });
  const logs: StageLog[] = stagesData?.data ?? [];
  const byStage: Record<string, StageLog> = {};
  logs.forEach(l => { byStage[l.stage] = l; });

  // Live clock for running timers.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mutate = useMutation({
    mutationFn: (body: any) => api.post(`/v1/production/orders/${order.id}/stages`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tablet-stages', order.id] }),
    onError: () => toast.error('Error al guardar'),
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-300 hover:text-white text-lg">
          <ArrowLeft size={22} /> Órdenes
        </button>
        <div className="text-right">
          <p className="text-2xl font-bold">{order.recipe?.product?.name ?? '—'}</p>
          <p className="font-mono text-emerald-400">{order.orderNumber}{order.line ? ` · Línea ${order.line}` : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STAGES.map(s => (
          <StageCard
            key={s.key}
            stage={s}
            log={byStage[s.key]}
            busy={mutate.isPending}
            onAction={(body) => mutate.mutate({ stage: s.key, ...body })}
          />
        ))}
      </div>
    </div>
  );
}

function StageCard({
  stage, log, busy, onAction,
}: {
  stage: { key: string; label: string; hint?: string };
  log?: StageLog;
  busy: boolean;
  onAction: (body: any) => void;
}) {
  const [quantity, setQuantity] = useState(log?.quantity ?? '');
  const [leftover, setLeftover] = useState(log?.leftover ?? '');

  useEffect(() => {
    if (log?.quantity != null) setQuantity(log.quantity);
    if (log?.leftover != null) setLeftover(log.leftover);
  }, [log?.quantity, log?.leftover]);

  const running = !!log?.startedAt && !log?.endedAt;
  const done = !!log?.endedAt;
  const elapsed = running && log?.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(log.startedAt).getTime()) / 1000))
    : (log?.durationSec ?? 0);

  const payload = () => ({
    quantity: quantity === '' ? undefined : Number(quantity),
    leftover: leftover === '' ? undefined : Number(leftover),
  });

  return (
    <div className={`rounded-2xl p-5 border ${done ? 'bg-emerald-900/30 border-emerald-700' : running ? 'bg-amber-900/30 border-amber-600' : 'bg-gray-800 border-gray-700'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xl font-bold">{stage.label}</p>
          {stage.hint && <p className="text-xs text-gray-400">{stage.hint}</p>}
        </div>
        <div className="text-right">
          {done ? (
            <span className="flex items-center gap-1 text-emerald-400 font-mono text-lg"><CheckCircle2 size={18} /> {fmtDuration(elapsed)}</span>
          ) : running ? (
            <span className="flex items-center gap-1 text-amber-300 font-mono text-lg"><Clock size={18} /> {fmtDuration(elapsed)}</span>
          ) : (
            <span className="text-gray-500 text-sm">sin iniciar</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Cantidad</label>
          <input type="number" inputMode="decimal" className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-lg"
            value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Sobrante</label>
          <input type="number" inputMode="decimal" className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-lg"
            value={leftover} onChange={e => setLeftover(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        {!running && !done && (
          <button disabled={busy} onClick={() => onAction({ action: 'START', ...payload() })}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl py-3 text-lg font-semibold">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} Inicio
          </button>
        )}
        {running && (
          <button disabled={busy} onClick={() => onAction({ action: 'END', ...payload() })}
            className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl py-3 text-lg font-semibold">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} />} Fin
          </button>
        )}
        {done && (
          <button disabled={busy} onClick={() => onAction({ action: 'UPDATE', ...payload() })}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-xl py-3 text-base font-medium">
            Guardar cantidades
          </button>
        )}
        {(running || done) && (
          <button disabled={busy} onClick={() => onAction({ action: 'START', ...payload() })}
            className="px-4 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-xl py-3 text-sm">
            Reiniciar
          </button>
        )}
      </div>
    </div>
  );
}
