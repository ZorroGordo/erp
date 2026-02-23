import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Receipt, Send, CheckCircle2, XCircle, Clock, FileDown, AlertCircle,
  Loader2, Plus, Trash2, Search, X, UserPlus, Building2, User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useState, useRef, useEffect } from 'react';
import { fmtMoney, fmtNum } from '../lib/fmt';

// ─── Types ────────────────────────────────────────────────────────────────────
type DocType      = 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO';
type InvoiceStatus= 'DRAFT' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'VOIDED';

interface Invoice {
  id: string; docType: string; series: string; correlative: string;
  issueDate: string; entityName: string; entityDocNo: string;
  igvPen: string; totalPen: string; currency: string; status: InvoiceStatus;
  pdfUrl?: string; rejectionReason?: string;
}
interface Customer {
  id: string; displayName: string; docType: string; docNumber: string;
  email?: string; type: string;
}
interface LineItem { description: string; qty: number; unitPrice: number; igvRate: number; discountPct: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;
const calcLine = (l: LineItem) => {
  const effPrice = round2(l.unitPrice * (1 - (l.discountPct ?? 0) / 100));
  const sub = round2(l.qty * effPrice);
  const igv = round2(sub * l.igvRate);
  return { sub, igv, total: round2(sub + igv) };
};
const BLANK_LINE: LineItem = { description: '', qty: 1, unitPrice: 0, igvRate: 0.18, discountPct: 0 };

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, reason }: { status: InvoiceStatus; reason?: string }) {
  const map: Record<InvoiceStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    DRAFT:    { label: 'Borrador',  icon: <Clock size={12} />,        cls: 'bg-gray-100 text-gray-600' },
    PENDING:  { label: 'Enviando…', icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-yellow-100 text-yellow-700' },
    ACCEPTED: { label: 'Aceptado',  icon: <CheckCircle2 size={12} />, cls: 'bg-green-100 text-green-700' },
    REJECTED: { label: 'Rechazado', icon: <XCircle size={12} />,      cls: 'bg-red-100 text-red-700' },
    VOIDED:   { label: 'Anulado',   icon: <AlertCircle size={12} />,  cls: 'bg-orange-100 text-orange-700' },
  };
  const { label, icon, cls } = map[status] ?? map.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`} title={reason}>
      {icon} {label}
    </span>
  );
}

// ─── Customer search autocomplete ─────────────────────────────────────────────
function CustomerSearch({ onSelect }: { onSelect: (c: Customer | null) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ data: Customer[] }>({
    queryKey: ['customers-search', q],
    queryFn:  () => api.get('/v1/customers/').then(r => r.data),
    enabled:  true,
    staleTime: 30_000,
  });

  const filtered = (data?.data ?? []).filter(c =>
    !q || c.displayName?.toLowerCase().includes(q.toLowerCase()) ||
    c.docNumber?.includes(q)
  ).slice(0, 8);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 border border-brand-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-brand-300">
        <Search size={14} className="text-gray-400 flex-shrink-0" />
        <input
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
          placeholder="Buscar cliente por nombre o RUC/DNI…"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {q && <button onClick={() => { setQ(''); onSelect(null); setOpen(false); }} className="text-gray-300 hover:text-gray-500"><X size={14} /></button>}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.map(c => (
            <button key={c.id} className="w-full px-4 py-2.5 text-left hover:bg-brand-50 flex items-center gap-3 transition-colors"
              onClick={() => { onSelect(c); setQ(c.displayName); setOpen(false); }}>
              <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${c.type === 'B2B' ? 'bg-brand-100 text-brand-700' : 'bg-purple-100 text-purple-700'}`}>
                {c.type === 'B2B' ? <Building2 size={13} /> : <User size={13} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{c.displayName}</p>
                <p className="text-xs text-gray-400 font-mono">{c.docType} {c.docNumber}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create invoice modal ─────────────────────────────────────────────────────
function CreateInvoiceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [docType, setDocType] = useState<DocType>('FACTURA');

  // Entity state — always directly controlled
  const [entityId,    setEntityId]    = useState('');
  const [entityDocNo, setEntityDocNo] = useState('');
  const [entityName,  setEntityName]  = useState('');
  const [entityEmail, setEntityEmail] = useState('');
  const [entityAddr,  setEntityAddr]  = useState('');
  // For both FACTURA and BOLETA: choose between searching existing or entering new
  const [clientMode, setClientMode]   = useState<'search' | 'new'>('search');
  // entityConfirmed: true only after user picks from search OR explicitly confirms manual entry
  const [entityConfirmed, setEntityConfirmed] = useState(false);
  // Lookup state (for the RUC auto-fill button)
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg,     setLookupMsg]     = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);

  // Lines
  const [lines, setLines] = useState<LineItem[]>([{ ...BLANK_LINE }]);
  // Master discount
  const [masterDiscountPct, setMasterDiscountPct] = useState(0);
  // Product catalog search
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);

  const { data: productsData } = useQuery<{ data: any[] }>({
    queryKey: ['products-catalog'],
    queryFn:  () => api.get('/v1/products').then(r => r.data),
    staleTime: 60_000,
  });

  const filteredProducts = (productsData?.data ?? []).filter(p =>
    !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 8);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!productRef.current?.contains(e.target as Node)) setProductDropdownOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function addProductLine(product: any) {
    setLines(ls => [...ls, { description: product.name, qty: 1, unitPrice: parseFloat(product.basePricePen ?? '0') || 0, igvRate: 0.18, discountPct: 0 }]);
    setProductSearch('');
    setProductDropdownOpen(false);
  }

  const rawTotals = {
    sub:   round2(lines.reduce((s, l) => s + calcLine(l).sub,   0)),
    igv:   round2(lines.reduce((s, l) => s + calcLine(l).igv,   0)),
    total: round2(lines.reduce((s, l) => s + calcLine(l).total, 0)),
  };
  const masterFactor = 1 - (masterDiscountPct > 0 ? masterDiscountPct / 100 : 0);
  const totals = {
    sub:        round2(rawTotals.sub   * masterFactor),
    igv:        round2(rawTotals.igv   * masterFactor),
    total:      round2(rawTotals.total * masterFactor),
    masterDisc: masterDiscountPct > 0 ? round2(rawTotals.total * (masterDiscountPct / 100)) : 0,
  };

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  function clearEntity() {
    setEntityId(''); setEntityDocNo(''); setEntityName('');
    setEntityEmail(''); setEntityAddr(''); setLookupMsg(null);
    setEntityConfirmed(false);
  }

  async function runRucLookup() {
    const n = entityDocNo.trim().replace(/\D/g, '');
    if (n.length !== 11) return;
    setLookupLoading(true); setLookupMsg(null);
    try {
      const r = await api.get(`/v1/lookup/ruc?n=${n}`);
      const name = r.data.razonSocial || r.data.nombreComercial || '';
      if (name) setEntityName(name);
      if (r.data.direccion) setEntityAddr(r.data.direccion);
      setLookupMsg({ type: 'ok', text: `✓ ${name || 'Encontrado'} · ${r.data.direccion ?? ''}` });
      setEntityConfirmed(true);
    } catch (e: any) {
      const code = e?.response?.data?.error ?? '';
      const text = code === 'APIS_TOKEN_MISSING'
        ? 'Token no configurado — ingresa la razón social manualmente'
        : code === 'NOT_FOUND'
        ? 'RUC no encontrado en el padrón — ingresa la razón social manualmente'
        : 'Error de búsqueda — ingresa los datos manualmente';
      setLookupMsg({ type: 'warn', text });
    } finally { setLookupLoading(false); }
  }

  const createMutation = useMutation({
    mutationFn: (emitAfter: boolean) =>
      api.post('/v1/invoices/', {
        docType,
        entityId:    entityId  || undefined,
        entityDocNo: entityDocNo.trim(),
        entityName:  entityName.trim(),
        entityEmail: entityEmail.trim() || undefined,
        items: lines.map(l => ({
          description: l.description,
          qty: l.qty,
          // Apply per-line + master discount to the unit price sent to backend
          unitPrice: round2(l.unitPrice * (1 - (l.discountPct ?? 0) / 100) * masterFactor),
          igvRate: l.igvRate,
        })),
      }).then(async (r) => {
        if (emitAfter) await api.post(`/v1/invoices/${r.data.data.id}/emit`);
        return r.data.data;
      }),
    onSuccess: (_, emitAfter) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(emitAfter ? '✅ Factura emitida a SUNAT' : 'Borrador guardado');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? e?.response?.data?.error ?? e?.message ?? 'Error'),
  });

  const isFactura = docType === 'FACTURA' || docType === 'NOTA_CREDITO';
  const linesValid = lines.every(l => l.description.trim() && l.qty > 0 && l.unitPrice >= 0);
  const canSave = linesValid && (
    isFactura
      ? (entityConfirmed && entityDocNo.trim().length === 11 && entityName.trim().length > 0)
      : true   // Boleta: entity entirely optional
  );
  // Also need Building2 for the entity chip icon above

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
              <Receipt size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">Nuevo comprobante</h2>
              <p className="text-xs text-gray-400">Facturación electrónica · SUNAT vía Factpro</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Doc type toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo de documento</label>
            <div className="flex gap-2 flex-wrap">
              {([
                ['FACTURA',      '📄 Factura (01)'],
                ['BOLETA',       '🧾 Boleta (03)'],
                ['NOTA_CREDITO', '📋 Nota Crédito (07)'],
              ] as [DocType, string][]).map(([dt, label]) => (
                <button key={dt} onClick={() => { setDocType(dt); clearEntity(); setClientMode('search'); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${docType === dt ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-brand-200 hover:bg-brand-50'}`}>
                  {label}
                </button>
              ))}
            </div>
            {isFactura && <p className="text-xs text-amber-600 mt-1.5">Factura: requiere RUC del receptor. Otorga crédito fiscal IGV al cliente.</p>}
            {docType === 'BOLETA' && <p className="text-xs text-blue-500 mt-1.5">Boleta: para consumidores finales. El receptor es opcional (anónimo).</p>}
            {docType === 'NOTA_CREDITO' && <p className="text-xs text-purple-600 mt-1.5">Nota de Crédito: anula o reduce el monto de una factura o boleta emitida.</p>}
          </div>

          {/* ── Client section ── */}
          <div className="bg-brand-50/60 rounded-2xl p-5 space-y-4 border border-brand-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {isFactura ? 'Cliente · Empresa (RUC requerido)' : 'Receptor (opcional)'}
              </label>
              <div className="flex gap-1.5">
                {(['search', 'new'] as const).map(m => (
                  <button key={m} onClick={() => { setClientMode(m); clearEntity(); }}
                    className={`text-xs px-3 py-1 rounded-lg font-medium transition-all ${clientMode === m ? 'bg-brand-600 text-white' : 'text-brand-600 hover:bg-brand-100'}`}>
                    {m === 'search' ? '🔍 Cliente existente' : (isFactura ? '📋 Ingresar RUC' : '➕ Nuevo')}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected customer chip — only shown once entity is confirmed */}
            {entityConfirmed && (entityDocNo || entityName) && (
              <div className="bg-white rounded-xl border border-brand-200 px-4 py-3 flex items-center gap-3">
                <span className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 flex-shrink-0">
                  {isFactura ? <Building2 size={15} /> : <User size={15} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{entityName || '—'}</p>
                  <p className="text-xs text-gray-400 font-mono">{entityDocNo}</p>
                  {entityEmail && <p className="text-xs text-gray-400">{entityEmail}</p>}
                </div>
                <button onClick={clearEntity} className="text-gray-300 hover:text-red-400 transition-colors"><X size={15} /></button>
              </div>
            )}

            {/* Search mode: pick from existing customers */}
            {clientMode === 'search' && !entityConfirmed && (
              <>
                <CustomerSearch onSelect={c => {
                  if (c) { setEntityId(c.id); setEntityDocNo(c.docNumber); setEntityName(c.displayName); setEntityEmail(c.email ?? ''); setEntityConfirmed(true); }
                  else   { clearEntity(); }
                }} />
                {!isFactura && <p className="text-xs text-gray-400 italic flex items-center gap-1"><UserPlus size={12} /> Sin receptor → boleta anónima.</p>}
                {isFactura && <p className="text-xs text-amber-600 italic flex items-center gap-1"><Building2 size={12} /> Selecciona un cliente con RUC registrado.</p>}
              </>
            )}

            {/* Manual / new mode: RUC entry + SUNAT lookup */}
            {clientMode === 'new' && !entityConfirmed && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-brand-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-300 font-mono"
                    placeholder={isFactura ? '20xxxxxxxxx — RUC (11 dígitos)' : 'DNI (8 dig.) o RUC (11 dig.) — opcional'}
                    value={entityDocNo}
                    maxLength={11}
                    onChange={e => { const v = e.target.value.replace(/\D/g, ''); setEntityDocNo(v); setEntityId(''); setLookupMsg(null); }}
                    onKeyDown={e => e.key === 'Enter' && [8,11].includes(entityDocNo.length) && runRucLookup()}
                  />
                  <button
                    type="button"
                    onClick={runRucLookup}
                    disabled={lookupLoading || ![8, 11].includes(entityDocNo.trim().length)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-700 transition-colors"
                  >
                    {lookupLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                    Buscar en SUNAT
                  </button>
                </div>
                {lookupMsg && (
                  <p className={`text-xs px-2 py-1.5 rounded-lg ${lookupMsg.type === 'ok' ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50'}`}>
                    {lookupMsg.text}
                  </p>
                )}
                <input
                  className="input w-full"
                  placeholder={isFactura ? 'Razón social *' : 'Nombre del cliente (opcional para boleta anónima)'}
                  value={entityName}
                  onChange={e => setEntityName(e.target.value)}
                />
                <input
                  className="input w-full"
                  type="email"
                  placeholder="Email (opcional — Factpro enviará el PDF aquí)"
                  value={entityEmail}
                  onChange={e => setEntityEmail(e.target.value)}
                />
                {/* Confirm button — only needed when lookup didn't auto-confirm */}
                {!lookupMsg?.type.startsWith('ok') && (entityDocNo || entityName) && (
                  <button
                    type="button"
                    onClick={() => setEntityConfirmed(true)}
                    disabled={isFactura && (entityDocNo.trim().length !== 11 || !entityName.trim())}
                    className="w-full py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
                  >
                    Confirmar datos →
                  </button>
                )}
                {!isFactura && !entityDocNo && !entityName && (
                  <p className="text-xs text-gray-400 italic flex items-center gap-1"><UserPlus size={12} /> Sin receptor → boleta anónima.</p>
                )}
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Productos / Servicios</label>
              <button onClick={() => setLines(ls => [...ls, { ...BLANK_LINE }])}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium">
                <Plus size={13} /> Línea libre
              </button>
            </div>

            {/* Product catalog search */}
            <div ref={productRef} className="relative mb-3">
              <div className="flex items-center gap-2 border border-brand-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-brand-300">
                <Search size={14} className="text-gray-400 flex-shrink-0" />
                <input
                  className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                  placeholder="Buscar producto del catálogo y agregar a la línea…"
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setProductDropdownOpen(true); }}
                  onFocus={() => setProductDropdownOpen(true)}
                />
                {productSearch && <button onClick={() => { setProductSearch(''); setProductDropdownOpen(false); }} className="text-gray-300 hover:text-gray-500"><X size={14} /></button>}
              </div>
              {productDropdownOpen && (filteredProducts.length > 0 || productSearch) && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-xl shadow-lg overflow-hidden">
                  {filteredProducts.map(p => (
                    <button key={p.id} className="w-full px-4 py-2.5 text-left hover:bg-brand-50 flex items-center gap-3 transition-colors"
                      onClick={() => addProductLine(p)}>
                      <span className="text-xs text-gray-400 font-mono w-16 flex-shrink-0 truncate">{p.sku}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{p.name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">S/ {(parseFloat(p.basePricePen ?? '0') || 0).toFixed(2)}</span>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400 italic">Sin resultados — usa "Línea libre" para ingresar manualmente.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_70px_110px_60px_80px_90px_30px] gap-2 px-1 text-xs text-gray-400 font-medium uppercase tracking-wide">
                <span>Descripción</span><span className="text-right">Cant.</span><span className="text-right">P. Unit (sin IGV)</span>
                <span className="text-right">Dsc.%</span><span className="text-right">IGV</span><span className="text-right">Total</span><span />
              </div>

              {lines.map((line, i) => {
                const { sub: _sub, igv, total } = calcLine(line);
                return (
                  <div key={i} className="grid grid-cols-[1fr_70px_110px_60px_80px_90px_30px] gap-2 items-center">
                    <input className="border border-brand-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-300 w-full"
                      placeholder="Descripción del producto/servicio"
                      value={line.description}
                      onChange={e => updateLine(i, { description: e.target.value })} />
                    <input type="number" min={0.01} step={0.01}
                      className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full"
                      value={line.qty}
                      onChange={e => updateLine(i, { qty: parseFloat(e.target.value) || 0 })} />
                    <input type="number" min={0} step={0.01}
                      className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full"
                      value={line.unitPrice}
                      onChange={e => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    <input type="number" min={0} max={100} step={0.5}
                      className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full"
                      placeholder="0"
                      value={line.discountPct || ''}
                      onChange={e => updateLine(i, { discountPct: Math.min(100, parseFloat(e.target.value) || 0) })} />
                    <p className="text-sm text-right text-gray-500 font-mono">S/{igv.toFixed(2)}</p>
                    <p className={`text-sm text-right font-semibold font-mono ${(line.discountPct ?? 0) > 0 ? 'text-brand-700' : 'text-gray-800'}`}>S/{total.toFixed(2)}</p>
                    <button onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}
                      disabled={lines.length === 1}
                      className="text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors flex items-center justify-center">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="mt-4 ml-auto w-72 space-y-1.5 border-t border-gray-100 pt-3">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal (sin IGV)</span><span className="font-mono">S/ {rawTotals.sub.toFixed(2)}</span>
              </div>
              {/* Master discount */}
              <div className="flex items-center justify-between text-sm text-gray-500 gap-2">
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  Descuento global
                  <input type="number" min={0} max={100} step={0.5} placeholder="0"
                    className="border border-brand-200 rounded-md px-1.5 py-0.5 text-xs text-right w-14 outline-none focus:ring-1 focus:ring-brand-300"
                    value={masterDiscountPct || ''}
                    onChange={e => setMasterDiscountPct(Math.min(100, parseFloat(e.target.value) || 0))} />
                  <span className="text-xs">%</span>
                </span>
                {totals.masterDisc > 0
                  ? <span className="font-mono text-red-500">- S/ {totals.masterDisc.toFixed(2)}</span>
                  : <span className="font-mono text-gray-300">—</span>
                }
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal neto</span><span className="font-mono">S/ {totals.sub.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>IGV (18%)</span><span className="font-mono">S/ {totals.igv.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>Total</span><span className="font-mono">S/ {totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-200 transition-all">
            Cancelar
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(false)}
              disabled={!canSave || createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-brand-300 text-brand-700 rounded-xl text-sm font-medium hover:bg-brand-50 disabled:opacity-50 transition-all"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
              Guardar borrador
            </button>
            <button
              onClick={() => createMutation.mutate(true)}
              disabled={!canSave || createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Guardar y Emitir a SUNAT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const DOC_LABEL: Record<string, string> = {
  FACTURA: 'Factura (01)', BOLETA: 'Boleta (03)',
  NOTA_CREDITO: 'Nota Crédito (07)', NOTA_DEBITO: 'Nota Débito (08)',
};

export default function Invoices() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ data: Invoice[] }>({
    queryKey: ['invoices'],
    queryFn:  () => api.get('/v1/invoices/').then(r => r.data),
    refetchInterval: 10_000,
  });

  const emitMutation = useMutation({
    mutationFn: (id: string) => api.post(`/v1/invoices/${id}/emit`).then(r => r.data),
    onMutate:  () => toast.loading('Enviando a SUNAT…', { id: 'emit' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      res.accepted
        ? toast.success('✅ Comprobante aceptado por SUNAT', { id: 'emit' })
        : toast.error('⚠️ Rechazado — ver detalle', { id: 'emit' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? 'Error al emitir', { id: 'emit' }),
  });

  const invoices = data?.data ?? [];
  const accepted = invoices.filter(i => i.status === 'ACCEPTED').length;
  const pending  = invoices.filter(i => i.status === 'PENDING').length;
  const rejected = invoices.filter(i => i.status === 'REJECTED').length;

  return (
    <div className="space-y-6">
      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación electrónica</h1>
          <p className="text-gray-500 text-sm">Comprobantes SUNAT — vía Factpro · Plan gratuito · DEMO</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-all shadow-sm"
        >
          <Plus size={16} /> Nuevo comprobante
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total',      value: invoices.length, color: 'text-blue-600',  bg: 'bg-blue-50' },
          { label: 'Aceptados',  value: accepted,        color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Pendientes', value: pending,         color: 'text-yellow-600',bg: 'bg-yellow-50' },
          { label: 'Rechazados', value: rejected,        color: 'text-red-600',   bg: 'bg-red-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-2xl p-5 text-center ${bg}`}>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-sm text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Receipt size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-800">Comprobantes</h2>
          <span className="ml-auto text-xs text-gray-400 bg-brand-50 px-2 py-0.5 rounded-full">PCGE · SUNAT · UBL 2.1</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Serie-Número</th>
                  <th className="px-5 py-3 text-left">Tipo</th>
                  <th className="px-5 py-3 text-left">Receptor</th>
                  <th className="px-5 py-3 text-left">Fecha</th>
                  <th className="px-5 py-3 text-right">IGV</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-left">Estado SUNAT</th>
                  <th className="px-5 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-brand-50/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">
                      {inv.series}-{String(inv.correlative).padStart(8, '0')}
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{DOC_LABEL[inv.docType] ?? inv.docType}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800 truncate max-w-[160px]">{inv.entityName || <span className="italic text-gray-300">Anónimo</span>}</p>
                      <p className="text-xs text-gray-400 font-mono">{inv.entityDocNo}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {new Date(inv.issueDate).toLocaleDateString('es-PE')}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-gray-500">
                      S/ {fmtNum(inv.igvPen)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-gray-800">
                      S/ {fmtNum(inv.totalPen)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={inv.status} reason={inv.rejectionReason ?? undefined} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {(inv.status === 'DRAFT' || inv.status === 'REJECTED') && (
                          <button onClick={() => emitMutation.mutate(inv.id)} disabled={emitMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-all">
                            {emitMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            Emitir
                          </button>
                        )}
                        {inv.status === 'ACCEPTED' && inv.pdfUrl && (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-all">
                            <FileDown size={12} /> PDF
                          </a>
                        )}
                        {inv.status === 'ACCEPTED' && !inv.pdfUrl && (
                          <span className="text-xs text-gray-300 italic">Procesando…</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!invoices.length && !isLoading && (
          <div className="py-16 text-center">
            <Receipt size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Sin comprobantes</p>
            <p className="text-xs text-gray-300 mt-1 max-w-xs mx-auto">Crea tu primera factura o boleta con el botón de arriba.</p>
            <button onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium mx-auto hover:bg-brand-700 transition-all">
              <Plus size={14} /> Nueva factura / boleta
            </button>
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
        <span>
          Integrado con <strong>Factpro</strong> · Búsqueda RUC/DNI vía{' '}
          <a href="https://apis.net.pe" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-600">apis.net.pe</a>
          {' '}(agrega <code className="bg-gray-100 px-1 rounded">APIS_NET_PE_TOKEN</code> en .env para activar auto-fill).
          Para producción cambia <code className="bg-gray-100 px-1 rounded">FACTPRO_BASE_URL</code> a <code className="bg-gray-100 px-1 rounded">https://api.factpro.la/api/v2</code>.
        </span>
      </div>
    </div>
  );
}
