import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Brain, Play, RefreshCw } from 'lucide-react';
import { StatusBadge } from './Dashboard';
import toast from 'react-hot-toast';

export default function AiForecast() {
  const qc = useQueryClient();

  const { data: forecast, isLoading } = useQuery({
    queryKey: ['forecast-current'],
    queryFn: () => api.get('/v1/ai/forecasts/current').then(r => r.data),
  });
  const { data: plan } = useQuery({
    queryKey: ['production-plan'],
    queryFn: () => api.get('/v1/ai/production-plan/suggest').then(r => r.data),
  });

  const runForecast = useMutation({
    mutationFn: () => api.post('/v1/ai/forecasts/run', { horizon: 7 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['forecast-current'] }); toast.success('Forecast iniciado'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'AI service no disponible en dev'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">IA — Forecast & Planificación</h1>
          <p className="text-gray-500 text-sm">Prophet + LightGBM · Horizonte 7 días</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => runForecast.mutate()}>
          <Play size={16} /> Ejecutar forecast
        </button>
      </div>

      {/* AI service note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Brain size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-blue-800">Servicio IA en modo MVP</p>
          <p className="text-sm text-blue-600">El microservicio Python (Prophet + LightGBM) se activa en Phase 2. Los datos de forecast se almacenan en la BD para integración futura.</p>
        </div>
      </div>

      {/* Current forecast */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2"><Brain size={18} className="text-gray-400" /><h2 className="font-semibold">Forecast actual</h2></div>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['forecast-current'] })} className="text-gray-400 hover:text-gray-600 p-1"><RefreshCw size={16} /></button>
        </div>
        {isLoading ? <div className="p-8 text-center text-gray-400">Cargando...</div> : forecast?.data ? (
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Estado</p>
                <div className="mt-1"><StatusBadge status={forecast.data.status} /></div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Horizonte</p>
                <p className="font-bold text-gray-800 mt-1">{forecast.data.horizonDays} días</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Precisión (MAPE)</p>
                <p className="font-bold text-gray-800 mt-1">{forecast.data.mape ? `${(forecast.data.mape * 100).toFixed(1)}%` : '—'}</p>
              </div>
            </div>
            {forecast.data.lines?.length > 0 && (
              <div className="table-container">
              <table className="w-full text-sm">
                <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                  <tr><th className="px-4 py-2 text-left">Producto</th><th className="px-4 py-2 text-left">Fecha</th><th className="px-4 py-2 text-right">Demanda prevista</th><th className="px-4 py-2 text-right">Confianza</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {forecast.data.lines.map((l: any) => (
                    <tr key={l.id} className="table-row-hover">
                      <td className="px-4 py-2 font-medium">{l.product?.name ?? l.productId}</td>
                      <td className="px-4 py-2 text-gray-500">{new Date(l.forecastDate).toLocaleDateString('es-PE')}</td>
                      <td className="px-4 py-2 text-right font-mono">{Number(l.predictedQty).toFixed(0)} uds</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`badge ${l.confidenceScore > 0.8 ? 'bg-green-100 text-green-700' : l.confidenceScore > 0.6 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {l.confidenceScore ? `${(l.confidenceScore * 100).toFixed(0)}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center">
            <Brain size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">Sin forecast activo</p>
            <p className="text-xs text-gray-300 mt-1">Haz clic en "Ejecutar forecast" para generar predicciones</p>
          </div>
        )}
      </div>

      {/* Production plan suggestions */}
      {plan?.data?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold">Sugerencias de producción</h2></div>
          <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
              <tr><th className="px-5 py-3 text-left">Producto</th><th className="px-5 py-3 text-right">Cantidad sugerida</th><th className="px-5 py-3 text-left">Fecha</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plan.data.map((s: any) => (
                <tr key={s.id} className="table-row-hover">
                  <td className="px-5 py-3 font-medium">{s.product?.name ?? s.productId}</td>
                  <td className="px-5 py-3 text-right font-mono">{Number(s.suggestedQty).toFixed(0)} uds</td>
                  <td className="px-5 py-3 text-gray-500">{new Date(s.productionDate).toLocaleDateString('es-PE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
