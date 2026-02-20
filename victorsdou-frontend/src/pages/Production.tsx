import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Plus, Factory } from 'lucide-react';
import { StatusBadge } from './Dashboard';
import toast from 'react-hot-toast';

export default function Production() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ recipeId: '', plannedQty: 1, scheduledDate: '' });

  const { data: orders, isLoading } = useQuery({
    queryKey: ['production-orders'],
    queryFn: () => api.get('/v1/production/orders').then(r => r.data),
  });
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

  const nextStatus: Record<string, string> = {
    PLANNED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Producción</h1>
          <p className="text-gray-500 text-sm">Órdenes de producción y recetas</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
          <Plus size={16} /> Nueva orden
        </button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva orden de producción</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Receta</label>
              <select className="input" value={form.recipeId} onChange={e => setForm(f => ({ ...f, recipeId: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {recipes?.data?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
            <button className="btn-primary" disabled={!form.recipeId} onClick={() => create.mutate(form)}>Crear</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Factory size={18} className="text-gray-400" />
          <h2 className="font-semibold">Órdenes de producción</h2>
        </div>
        {isLoading ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
          <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Batch</th>
                <th className="px-5 py-3 text-left">Receta</th>
                <th className="px-5 py-3 text-right">Planificado</th>
                <th className="px-5 py-3 text-right">Producido</th>
                <th className="px-5 py-3 text-left">Fecha</th>
                <th className="px-5 py-3 text-left">Estado</th>
                <th className="px-5 py-3 text-center">Avanzar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders?.data?.map((o: any) => (
                <tr key={o.id} className="table-row-hover">
                  <td className="px-5 py-3 font-mono text-gray-700">{o.batchCode}</td>
                  <td className="px-5 py-3 font-medium">{o.recipe?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-right">{o.plannedQty}</td>
                  <td className="px-5 py-3 text-right">{o.actualQty ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString('es-PE') : '—'}</td>
                  <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3 text-center">
                    {nextStatus[o.status] && (
                      <button
                        onClick={() => updateStatus.mutate({ id: o.id, status: nextStatus[o.status] })}
                        className="text-xs bg-brand-100 text-brand-700 hover:bg-brand-200 px-2 py-1 rounded"
                      >
                        → {nextStatus[o.status].replace(/_/g,' ')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!orders?.data?.length && !isLoading && <p className="text-center text-gray-400 py-8">Sin órdenes aún</p>}
      </div>
    </div>
  );
}
