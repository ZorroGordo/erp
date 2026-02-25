import { useState } from 'react';
import { Search, Loader2, X, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

export interface RucResult {
  ruc: string; razonSocial: string; nombreComercial: string;
  estado: string; condicion: string;
  direccion: string; distrito: string; provincia: string; departamento: string;
}
export interface DniResult {
  dni: string; fullName: string; nombres: string; apellidoPaterno: string; apellidoMaterno: string;
}

interface RucLookupInputProps {
  docType: 'RUC' | 'DNI';
  value: string;
  onChange: (v: string) => void;
  onFound: (data: RucResult | DniResult) => void;
  disabled?: boolean;
  label?: string;
}

type LookupStatus = 'idle' | 'loading' | 'found' | 'token_missing' | 'not_found' | 'error';

export function RucLookupInput({ docType, value, onChange, onFound, disabled, label }: RucLookupInputProps) {
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [dismissed, setDismissed] = useState(false);

  const expectedLen = docType === 'RUC' ? 11 : 8;
  const canSearch = value.trim().length === expectedLen && !disabled;

  async function runLookup() {
    if (!canSearch) return;
    setStatus('loading');
    setDismissed(false);
    try {
      const ep = docType === 'RUC' ? `/v1/lookup/ruc?n=${value.trim()}` : `/v1/lookup/dni?n=${value.trim()}`;
      const r = await api.get(ep);
      onFound(r.data);
      setStatus('found');
    } catch (e: any) {
      const code = e.response?.data?.error;
      if (code === 'APIS_TOKEN_MISSING' || code === 'APIS_TOKEN_INVALID') setStatus('token_missing');
      else if (code === 'NOT_FOUND') setStatus('not_found');
      else setStatus('error');
    }
  }

  const lbl = label !== undefined ? label : (docType === 'RUC' ? 'RUC' : 'DNI');
  const ph = docType === 'RUC' ? '20xxxxxxxxx (11 dígitos)' : '12345678 (8 dígitos)';
  const btn = docType === 'RUC' ? 'Buscar en SUNAT' : 'Buscar en RENIEC';

  return (
    <div className="space-y-1.5">
      {lbl && (
        <label className="block text-xs font-medium text-gray-600">
          {lbl} <span className="text-red-500">*</span>
        </label>
      )}
      <div className="flex gap-2">
        <input
          className="input flex-1 font-mono"
          placeholder={ph}
          value={value}
          maxLength={expectedLen}
          disabled={disabled}
          onChange={e => { onChange(e.target.value.replace(/\D/g, '')); setStatus('idle'); setDismissed(false); }}
          onKeyDown={e => e.key === 'Enter' && runLookup()}
        />
        <button
          type="button"
          onClick={runLookup}
          disabled={!canSearch || status === 'loading'}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-700 transition-colors whitespace-nowrap"
        >
          {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {btn}
        </button>
      </div>

      {status === 'token_missing' && !dismissed && (
        <div className="flex items-start justify-between gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <div className="flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>Búsqueda automática no configurada — ingresa los datos manualmente.</span>
          </div>
          <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700 shrink-0"><X size={13} /></button>
        </div>
      )}
      {status === 'not_found' && !dismissed && (
        <div className="flex items-start justify-between gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <div className="flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{docType} no encontrado en el padrón oficial — ingresa los datos manualmente.</span>
          </div>
          <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700 shrink-0"><X size={13} /></button>
        </div>
      )}
      {status === 'error' && !dismissed && (
        <div className="flex items-start justify-between gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <div className="flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>No se pudo conectar con el servicio — ingresa los datos manualmente.</span>
          </div>
          <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700 shrink-0"><X size={13} /></button>
        </div>
      )}
      {status === 'found' && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
          ✓ Datos encontrados y completados automáticamente.
        </p>
      )}
    </div>
  );
}
