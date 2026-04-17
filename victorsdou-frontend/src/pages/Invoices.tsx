import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Receipt, Send, CheckCircle2, XCircle, Clock, FileDown, AlertCircle,
  Loader2, Plus, Trash2, Search, X, UserPlus, Building2, User, Download,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useState, useRef, useEffect } from 'react';
import { fmtMoney, fmtNum } from '../lib/fmt';
import { RucLookupInput } from '../components/RucLookupInput';

// ─── Types ────────────────────────────────────────────────────────────────────
type DocType = 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO';
type InvoiceStatus = 'DRAFT' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'VOIDED';
type TabType = 'invoices' | 'pending-orders';

interface Invoice {
  id: string;
  docType: string;
  series: string;
  correlative: string;
  issueDate: string;
  entityName: string;
  entityDocNo: string;
  igvPen: string;
  totalPen: string;
  currency: string;
  status: InvoiceStatus;
  pdfUrl?: string;
  rejectionReason?: string;
  paymentDueDate?: string;
  paymentDueDays?: number;
  salesOrder?: { orderNumber: string; id: string };
  customer?: {
    displayName: string;
    docNumber: string;
    category: string;
    paymentTermsDays: number;
    tradeName: string;
  };
  lines?: LineItem[];
  subtotalPen?: string;
}

interface Customer {
  id: string;
  displayName: string;
  docType: string;
  docNumber: string;
  email?: string;
  type: string;
}

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  igvRate: number;
  discountPct: number;
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  customer: {
    displayName: string;
    docNumber: string;
    category: string;
    paymentTermsDays: number;
    tradeName: string;
  };
  lines: Array<{ product: { name: string }; qty: number; unitPrice: number; igvRate: number; discountPct: number }>;
  invoiceType?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;
const calcLine = (l: LineItem) => {
  const effPrice = round2(l.unitPrice * (1 - (l.discountPct ?? 0) / 100));
  const sub = round2(l.qty * effPrice);
  const igv = round2(sub * l.igvRate);
  return { sub, igv, total: round2(sub + igv) };
};
const BLANK_LINE: LineItem = { description: '', qty: 1, unitPrice: 0, igvRate: 0.18, discountPct: 0 };

const CATEGORY_LABEL: Record<string, string> = {
  SUPERMERCADO: 'Supermercado',
  TIENDA_NATURISTA: 'Tienda Naturista',
  CAFETERIA: 'Cafetería',
  RESTAURANTE: 'Restaurante',
  HOTEL: 'Hotel',
  EMPRESA: 'Empresa',
  OTROS: 'Otros',
};

const DOC_LABEL: Record<string, string> = {
  FACTURA: 'Factura (01)',
  BOLETA: 'Boleta (03)',
  NOTA_CREDITO: 'Nota Crédito (07)',
  NOTA_DEBITO: 'Nota Débito (08)',
};

function calculateOrderTotals(order: PendingOrder) {
  const sub = round2(order.lines.reduce((s, l) => {
    const effPrice = round2(l.unitPrice * (1 - (l.discountPct ?? 0) / 100));
    return s + l.qty * effPrice;
  }, 0));
  const igv = round2(sub * 0.18);
  const total = round2(sub + igv);
  return { sub, igv, total };
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, reason }: { status: InvoiceStatus; reason?: string }) {
  const map: Record<InvoiceStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    DRAFT: { label: 'Borrador', icon: <Clock size={12} />, cls: 'bg-gray-100 text-gray-600' },
    PENDING: { label: 'Enviando…', icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-yellow-100 text-yellow-700' },
    ACCEPTED: { label: 'Aceptado', icon: <CheckCircle2 size={12} />, cls: 'bg-green-100 text-green-700' },
    REJECTED: { label: 'Rechazado', icon: <XCircle size={12} />, cls: 'bg-red-100 text-red-700' },
    VOIDED: { label: 'Anulado', icon: <AlertCircle size={12} />, cls: 'bg-orange-100 text-orange-700' },
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
    queryFn: () => api.get('/v1/customers/').then(r => r.data),
    enabled: true,
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

// ─── Create invoice modal ──────────────────────────────────────────────────────
function CreateInvoiceModal({ onClose, salesOrderId }: { onClose: () => void; salesOrderId?: string }) {
  const qc = useQueryClient();
  const [docType, setDocType] = useState<DocType>('FACTURA');
  const [entityId, setEntityId] = useState('');
  const [entityDocNo, setEntityDocNo] = useState('');
  const [entityName, setEntityName] = useState('');
  const [entityEmail, setEntityEmail] = useState('');
  const [entityAddr, setEntityAddr] = useState('');
  const [clientMode, setClientMode] = useState<'search' | 'new'>('search');
  const [entityConfirmed, setEntityConfirmed] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([{ ...BLANK_LINE }]);
  const [masterDiscountPct, setMasterDiscountPct] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [paymentDueDays, setPaymentDueDays] = useState(0);
  const productRef = useRef<HTMLDivElement>(null);

  const { data: productsData } = useQuery<{ data: any[] }>({
    queryKey: ['products-catalog'],
    queryFn: () => api.get('/v1/products').then(r => r.data),
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
    sub: round2(lines.reduce((s, l) => s + calcLine(l).sub, 0)),
    igv: round2(lines.reduce((s, l) => s + calcLine(l).igv, 0)),
    total: round2(lines.reduce((s, l) => s + calcLine(l).total, 0)),
  };
  const masterFactor = 1 - (masterDiscountPct > 0 ? masterDiscountPct / 100 : 0);
  const totals = {
    sub: round2(rawTotals.sub * masterFactor),
    igv: round2(rawTotals.igv * masterFactor),
    total: round2(rawTotals.total * masterFactor),
    masterDisc: masterDiscountPct > 0 ? round2(rawTotals.total * (masterDiscountPct / 100)) : 0,
  };

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  function clearEntity() {
    setEntityId(''); setEntityDocNo(''); setEntityName('');
    setEntityEmail(''); setEntityAddr('');
    setEntityConfirmed(false);
  }

  const createMutation = useMutation({
    mutationFn: (emitAfter: boolean) =>
      api.post('/v1/invoices/', {
        docType,
        entityId: entityId || undefined,
        entityDocNo: entityDocNo.trim(),
        entityName: entityName.trim(),
        entityEmail: entityEmail.trim() || undefined,
        paymentDueDays: paymentDueDays > 0 ? paymentDueDays : undefined,
        salesOrderId: salesOrderId || undefined,
        items: lines.map(l => ({
          description: l.description,
          qty: l.qty,
          unitPrice: round2(l.unitPrice * (1 - (l.discountPct ?? 0) / 100) * masterFactor),
          igvRate: l.igvRate,
        })),
      }).then(async (r) => {
        if (emitAfter) await api.post(`/v1/invoices/${r.data.data.id}/emit`);
        return r.data.data;
      }),
    onSuccess: (_, emitAfter) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['pending-orders'] });
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
      : true
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo de documento</label>
            <div className="flex gap-2 flex-wrap">
              {(['FACTURA', 'BOLETA', 'NOTA_CREDITO'] as DocType[]).map(dt => (
                <button key={dt} onClick={() => { setDocType(dt); clearEntity(); setClientMode('search'); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${docType === dt ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-brand-200 hover:bg-brand-50'}`}>
                  {dt === 'FACTURA' ? '📄 Factura (01)' : dt === 'BOLETA' ? '🧾 Boleta (03)' : '📋 Nota Crédito (07)'}
                </button>
              ))}
            </div>
            {isFactura && <p className="text-xs text-amber-600 mt-1.5">Factura: requiere RUC del receptor. Otorga crédito fiscal IGV al cliente.</p>}
            {docType === 'BOLETA' && <p className="text-xs text-blue-500 mt-1.5">Boleta: para consumidores finales. El receptor es opcional (anónimo).</p>}
            {docType === 'NOTA_CREDITO' && <p className="text-xs text-purple-600 mt-1.5">Nota de Crédito: anula o reduce el monto de una factura o boleta emitida.</p>}
          </div>

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

            {clientMode === 'search' && !entityConfirmed && (
              <>
                <CustomerSearch onSelect={c => {
                  if (c) { setEntityId(c.id); setEntityDocNo(c.docNumber); setEntityName(c.displayName); setEntityEmail(c.email ?? ''); setEntityConfirmed(true); }
                  else { clearEntity(); }
                }} />
                {!isFactura && <p className="text-xs text-gray-400 italic flex items-center gap-1"><UserPlus size={12} /> Sin receptor → boleta anónima.</p>}
                {isFactura && <p className="text-xs text-amber-600 italic flex items-center gap-1"><Building2 size={12} /> Selecciona un cliente con RUC registrado.</p>}
              </>
            )}

            {clientMode === 'new' && !entityConfirmed && (
              <div className="space-y-3">
                <RucLookupInput
                  docType={isFactura ? 'RUC' : (entityDocNo.trim().length === 8 ? 'DNI' : 'RUC')}
                  value={entityDocNo}
                  onChange={v => { setEntityDocNo(v); setEntityId(''); }}
                  onFound={(data) => {
                    if ('razonSocial' in data && data.razonSocial) setEntityName(data.razonSocial);
                    else if ('fullName' in data && data.fullName) setEntityName(data.fullName);
                    setEntityConfirmed(true);
                  }}
                />
                <input className="input w-full" placeholder={isFactura ? 'Razón social *' : 'Nombre del cliente (opcional)'} value={entityName} onChange={e => setEntityName(e.target.value)} />
                <input className="input w-full" type="email" placeholder="Email (opcional)" value={entityEmail} onChange={e => setEntityEmail(e.target.value)} />
                {!entityConfirmed && (entityDocNo || entityName) && (
                  <button type="button" onClick={() => setEntityConfirmed(true)} disabled={isFactura && (entityDocNo.trim().length !== 11 || !entityName.trim())}
                    className="w-full py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors">
                    Confirmar datos →
                  </button>
                )}
                {!isFactura && !entityDocNo && !entityName && <p className="text-xs text-gray-400 italic flex items-center gap-1"><UserPlus size={12} /> Sin receptor → boleta anónima.</p>}
              </div>
            )}
          </div>

          {isFactura && (
            <div className="bg-blue-50/60 rounded-2xl p-5 border border-blue-100">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Plazo de pago (días)</label>
              <input type="number" min={0} step={1} className="input w-32" placeholder="0 (al contado)" value={paymentDueDays || ''} onChange={e => setPaymentDueDays(parseInt(e.target.value) || 0)} />
              <p className="text-xs text-gray-400 mt-1.5">Vencimiento: {paymentDueDays > 0 ? new Date(Date.now() + paymentDueDays * 86400000).toLocaleDateString('es-PE') : 'Al contado'}</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Productos / Servicios</label>
              <button onClick={() => setLines(ls => [...ls, { ...BLANK_LINE }])} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium">
                <Plus size={13} /> Línea libre
              </button>
            </div>

            <div ref={productRef} className="relative mb-3">
              <div className="flex items-center gap-2 border border-brand-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-brand-300">
                <Search size={14} className="text-gray-400 flex-shrink-0" />
                <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400" placeholder="Buscar producto del catálogo…" value={productSearch} onChange={e => { setProductSearch(e.target.value); setProductDropdownOpen(true); }} onFocus={() => setProductDropdownOpen(true)} />
                {productSearch && <button onClick={() => { setProductSearch(''); setProductDropdownOpen(false); }} className="text-gray-300 hover:text-gray-500"><X size={14} /></button>}
              </div>
              {productDropdownOpen && (filteredProducts.length > 0 || productSearch) && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-xl shadow-lg overflow-hidden">
                  {filteredProducts.map(p => (
                    <button key={p.id} className="w-full px-4 py-2.5 text-left hover:bg-brand-50 flex items-center gap-3 transition-colors" onClick={() => addProductLine(p)}>
                      <span className="text-xs text-gray-400 font-mono w-16 flex-shrink-0 truncate">{p.sku}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{p.name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">S/ {(parseFloat(p.basePricePen ?? '0') || 0).toFixed(2)}</span>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && <p className="px-4 py-3 text-sm text-gray-400 italic">Sin resultados</p>}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_70px_110px_60px_80px_90px_30px] gap-2 px-1 text-xs text-gray-400 font-medium uppercase tracking-wide">
                <span>Descripción</span><span className="text-right">Cant.</span><span className="text-right">P. Unit</span><span className="text-right">Dsc.%</span><span className="text-right">IGV</span><span className="text-right">Total</span><span />
              </div>

              {lines.map((line, i) => {
                const { sub: _sub, igv, total } = calcLine(line);
                return (
                  <div key={i} className="grid grid-cols-[1fr_70px_110px_60px_80px_90px_30px] gap-2 items-center">
                    <input className="border border-brand-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-300 w-full" placeholder="Descripción" value={line.description} onChange={e => updateLine(i, { description: e.target.value })} />
                    <input type="number" min={0.01} step={0.01} className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full" value={line.qty} onChange={e => updateLine(i, { qty: parseFloat(e.target.value) || 0 })} />
                    <input type="number" min={0} step={0.01} className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full" value={line.unitPrice} onChange={e => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    <input type="number" min={0} max={100} step={0.5} className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full" placeholder="0" value={line.discountPct || ''} onChange={e => updateLine(i, { discountPct: Math.min(100, parseFloat(e.target.value) || 0) })} />
                    <p className="text-sm text-right text-gray-500 font-mono">S/{igv.toFixed(2)}</p>
                    <p className={`text-sm text-right font-semibold font-mono ${(line.discountPct ?? 0) > 0 ? 'text-brand-700' : 'text-gray-800'}`}>S/{total.toFixed(2)}</p>
                    <button onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} disabled={lines.length === 1} className="text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors flex items-center justify-center">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 ml-auto w-72 space-y-1.5 border-t border-gray-100 pt-3">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal (sin IGV)</span><span className="font-mono">S/ {rawTotals.sub.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-500 gap-2">
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  Descuento global
                  <input type="number" min={0} max={100} step={0.5} placeholder="0" className="border border-brand-200 rounded-md px-1.5 py-0.5 text-xs text-right w-14 outline-none focus:ring-1 focus:ring-brand-300" value={masterDiscountPct || ''} onChange={e => setMasterDiscountPct(Math.min(100, parseFloat(e.target.value) || 0))} />
                  <span className="text-xs">%</span>
                </span>
                {totals.masterDisc > 0 ? <span className="font-mono text-red-500">- S/ {totals.masterDisc.toFixed(2)}</span> : <span className="font-mono text-gray-300">—</span>}
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

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-200 transition-all">
            Cancelar
          </button>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate(false)} disabled={!canSave || createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-brand-300 text-brand-700 rounded-xl text-sm font-medium hover:bg-brand-50 disabled:opacity-50 transition-all">
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
              Guardar borrador
            </button>
            <button onClick={() => createMutation.mutate(true)} disabled={!canSave || createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all shadow-sm">
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Guardar y Emitir a SUNAT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit invoice modal ────────────────────────────────────────────────────────
function EditInvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const qc = useQueryClient();
  const [entityDocNo, setEntityDocNo] = useState(invoice.entityDocNo);
  const [entityName, setEntityName] = useState(invoice.entityName);
  const [entityEmail, setEntityEmail] = useState(invoice.customer?.displayName || '');
  const [lines, setLines] = useState<LineItem[]>(invoice.lines || [{ ...BLANK_LINE }]);
  const [paymentDueDays, setPaymentDueDays] = useState(invoice.paymentDueDays || 0);
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);

  const { data: productsData } = useQuery<{ data: any[] }>({
    queryKey: ['products-catalog'],
    queryFn: () => api.get('/v1/products').then(r => r.data),
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

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const rawTotals = {
    sub: round2(lines.reduce((s, l) => s + calcLine(l).sub, 0)),
    igv: round2(lines.reduce((s, l) => s + calcLine(l).igv, 0)),
    total: round2(lines.reduce((s, l) => s + calcLine(l).total, 0)),
  };

  const editMutation = useMutation({
    mutationFn: (emitAfter: boolean) =>
      api.patch(`/v1/invoices/${invoice.id}`, {
        entityDocNo: entityDocNo.trim(),
        entityName: entityName.trim(),
        entityEmail: entityEmail.trim() || undefined,
        paymentDueDays: paymentDueDays > 0 ? paymentDueDays : undefined,
        items: lines.map(l => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, igvRate: l.igvRate })),
      }).then(async (r) => {
        if (emitAfter) await api.post(`/v1/invoices/${invoice.id}/emit`);
        return r.data.data;
      }),
    onSuccess: (_, emitAfter) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(emitAfter ? '✅ Factura emitida a SUNAT' : 'Cambios guardados');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? e?.message ?? 'Error'),
  });

  const linesValid = lines.every(l => l.description.trim() && l.qty > 0 && l.unitPrice >= 0);
  const canSave = linesValid && entityDocNo.trim().length === 11 && entityName.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
              <Receipt size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">Editar comprobante</h2>
              <p className="text-xs text-gray-400">{invoice.series}-{String(invoice.correlative).padStart(8, '0')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-brand-50/60 rounded-2xl p-5 space-y-4 border border-brand-100">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Datos del receptor</label>
            <div className="space-y-3">
              <input className="input w-full" placeholder="RUC" value={entityDocNo} onChange={e => setEntityDocNo(e.target.value)} />
              <input className="input w-full" placeholder="Razón social" value={entityName} onChange={e => setEntityName(e.target.value)} />
              <input className="input w-full" type="email" placeholder="Email" value={entityEmail} onChange={e => setEntityEmail(e.target.value)} />
            </div>
          </div>

          <div className="bg-blue-50/60 rounded-2xl p-5 border border-blue-100">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Plazo de pago (días)</label>
            <input type="number" min={0} step={1} className="input w-32" placeholder="0 (al contado)" value={paymentDueDays || ''} onChange={e => setPaymentDueDays(parseInt(e.target.value) || 0)} />
            <p className="text-xs text-gray-400 mt-1.5">Vencimiento: {paymentDueDays > 0 ? new Date(Date.now() + paymentDueDays * 86400000).toLocaleDateString('es-PE') : 'Al contado'}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Productos / Servicios</label>
              <button onClick={() => setLines(ls => [...ls, { ...BLANK_LINE }])} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium">
                <Plus size={13} /> Línea libre
              </button>
            </div>

            <div ref={productRef} className="relative mb-3">
              <div className="flex items-center gap-2 border border-brand-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-brand-300">
                <Search size={14} className="text-gray-400 flex-shrink-0" />
                <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400" placeholder="Buscar producto…" value={productSearch} onChange={e => { setProductSearch(e.target.value); setProductDropdownOpen(true); }} onFocus={() => setProductDropdownOpen(true)} />
                {productSearch && <button onClick={() => { setProductSearch(''); setProductDropdownOpen(false); }} className="text-gray-300 hover:text-gray-500"><X size={14} /></button>}
              </div>
              {productDropdownOpen && (filteredProducts.length > 0 || productSearch) && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-xl shadow-lg overflow-hidden">
                  {filteredProducts.map(p => (
                    <button key={p.id} className="w-full px-4 py-2.5 text-left hover:bg-brand-50 flex items-center gap-3 transition-colors" onClick={() => addProductLine(p)}>
                      <span className="text-xs text-gray-400 font-mono w-16 flex-shrink-0 truncate">{p.sku}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{p.name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">S/ {(parseFloat(p.basePricePen ?? '0') || 0).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_70px_110px_60px_80px_90px_30px] gap-2 px-1 text-xs text-gray-400 font-medium uppercase tracking-wide">
                <span>Descripción</span><span className="text-right">Cant.</span><span className="text-right">P. Unit</span><span className="text-right">Dsc.%</span><span className="text-right">IGV</span><span className="text-right">Total</span><span />
              </div>

              {lines.map((line, i) => {
                const { sub: _sub, igv, total } = calcLine(line);
                return (
                  <div key={i} className="grid grid-cols-[1fr_70px_110px_60px_80px_90px_30px] gap-2 items-center">
                    <input className="border border-brand-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-300 w-full" placeholder="Descripción" value={line.description} onChange={e => updateLine(i, { description: e.target.value })} />
                    <input type="number" min={0.01} step={0.01} className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full" value={line.qty} onChange={e => updateLine(i, { qty: parseFloat(e.target.value) || 0 })} />
                    <input type="number" min={0} step={0.01} className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full" value={line.unitPrice} onChange={e => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    <input type="number" min={0} max={100} step={0.5} className="border border-brand-200 rounded-lg px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-brand-300 w-full" placeholder="0" value={line.discountPct || ''} onChange={e => updateLine(i, { discountPct: Math.min(100, parseFloat(e.target.value) || 0) })} />
                    <p className="text-sm text-right text-gray-500 font-mono">S/{igv.toFixed(2)}</p>
                    <p className={`text-sm text-right font-semibold font-mono ${(line.discountPct ?? 0) > 0 ? 'text-brand-700' : 'text-gray-800'}`}>S/{total.toFixed(2)}</p>
                    <button onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} disabled={lines.length === 1} className="text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors flex items-center justify-center">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 ml-auto w-72 space-y-1.5 border-t border-gray-100 pt-3">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal (sin IGV)</span><span className="font-mono">S/ {rawTotals.sub.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>IGV (18%)</span><span className="font-mono">S/ {rawTotals.igv.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>Total</span><span className="font-mono">S/ {rawTotals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-200 transition-all">
            Cancelar
          </button>
          <div className="flex gap-2">
            <button onClick={() => editMutation.mutate(false)} disabled={!canSave || editMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-brand-300 text-brand-700 rounded-xl text-sm font-medium hover:bg-brand-50 disabled:opacity-50 transition-all">
              {editMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
              Guardar
            </button>
            <button onClick={() => editMutation.mutate(true)} disabled={!canSave || editMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all shadow-sm">
              {editMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Guardar y Emitir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Export modal ──────────────────────────────────────────────────────────────
function ExportModal({ invoices, onClose }: { invoices: Invoice[]; onClose: () => void }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [docType, setDocType] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const filtered = invoices.filter(inv => {
    if (dateFrom && new Date(inv.issueDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(inv.issueDate) > new Date(dateTo)) return false;
    if (docType && inv.docType !== docType) return false;
    if (status && inv.status !== status) return false;
    if (category && inv.customer?.category !== category) return false;
    return true;
  });

  async function handleExport() {
    setIsExporting(true);
    try {
      const XLSX = await import('xlsx');
      const rows = filtered.map(inv => ({
        'RUC': inv.entityDocNo,
        'Razón Social': inv.entityName,
        'Categoría': inv.customer ? CATEGORY_LABEL[inv.customer.category] || inv.customer.category : '—',
        'Número de pedido': inv.salesOrder?.orderNumber || '—',
        'Número de factura': `${inv.series}-${String(inv.correlative).padStart(8, '0')}`,
        'Subtotal': parseFloat(inv.subtotalPen || '0'),
        'IGV': parseFloat(inv.igvPen),
        'Total': parseFloat(inv.totalPen),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Facturacion');
      XLSX.writeFile(wb, `facturas-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Archivo exportado');
      onClose();
    } catch (err) {
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Download size={18} className="text-brand-600" />
            <h2 className="font-bold text-gray-900">Exportar facturación</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase">Rango de fechas</label>
            <div className="flex gap-2">
              <input type="date" className="input flex-1" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <input type="date" className="input flex-1" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase">Tipo de documento</label>
            <select className="input w-full" value={docType} onChange={e => setDocType(e.target.value)}>
              <option value="">Todos</option>
              <option value="FACTURA">Factura</option>
              <option value="BOLETA">Boleta</option>
              <option value="NOTA_CREDITO">Nota Crédito</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase">Estado</label>
            <select className="input w-full" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="DRAFT">Borrador</option>
              <option value="PENDING">Pendiente</option>
              <option value="ACCEPTED">Aceptado</option>
              <option value="REJECTED">Rechazado</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase">Categoría</label>
            <select className="input w-full" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Todas</option>
              <option value="SUPERMERCADO">Supermercado</option>
              <option value="TIENDA_NATURISTA">Tienda Naturista</option>
              <option value="CAFETERIA">Cafetería</option>
              <option value="RESTAURANTE">Restaurante</option>
              <option value="HOTEL">Hotel</option>
              <option value="EMPRESA">Empresa</option>
              <option value="OTROS">Otros</option>
            </select>
          </div>

          <p className="text-xs text-gray-400">{filtered.length} de {invoices.length} registros</p>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-200 transition-all">
            Cancelar
          </button>
          <button onClick={handleExport} disabled={filtered.length === 0 || isExporting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all">
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Descargar XLSX
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Invoices() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabType>('invoices');
  const [showCreate, setShowCreate] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{ data: Invoice[] }>({
    queryKey: ['invoices'],
    queryFn: () => api.get('/v1/invoices/').then(r => r.data),
    refetchInterval: 10_000,
  });

  const { data: pendingOrdersData, isLoading: pendingOrdersLoading } = useQuery<{ data: PendingOrder[] }>({
    queryKey: ['pending-orders'],
    queryFn: () => api.get('/v1/invoices/pending-orders').then(r => r.data),
    refetchInterval: 15_000,
  });

  const emitMutation = useMutation({
    mutationFn: (id: string) => api.post(`/v1/invoices/${id}/emit`).then(r => r.data),
    onMutate: () => toast.loading('Enviando a SUNAT…', { id: 'emit' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      res.accepted ? toast.success('✅ Comprobante aceptado por SUNAT', { id: 'emit' }) : toast.error('⚠️ Rechazado', { id: 'emit' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? 'Error al emitir', { id: 'emit' }),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (payload: { orderIds: string[]; emitAfter?: boolean }) => api.post('/v1/invoices/from-orders', payload),
    onMutate: () => toast.loading('Creando facturas…'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['pending-orders'] });
      toast.success('✅ Facturas creadas');
      setSelectedOrders(new Set());
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error'),
  });

  const invoices = invoicesData?.data ?? [];
  const pendingOrders = pendingOrdersData?.data ?? [];
  const accepted = invoices.filter(i => i.status === 'ACCEPTED').length;
  const pending = invoices.filter(i => i.status === 'PENDING').length;
  const rejected = invoices.filter(i => i.status === 'REJECTED').length;

  function toggleOrderSelection(orderId: string) {
    const newSet = new Set(selectedOrders);
    if (newSet.has(orderId)) newSet.delete(orderId);
    else newSet.add(orderId);
    setSelectedOrders(newSet);
  }

  function toggleAllOrders() {
    if (selectedOrders.size === pendingOrders.length) setSelectedOrders(new Set());
    else setSelectedOrders(new Set(pendingOrders.map(o => o.id)));
  }

  return (
    <div className="space-y-6">
      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} />}
      {showExport && <ExportModal invoices={invoices} onClose={() => setShowExport(false)} />}
      {editingInvoice && <EditInvoiceModal invoice={editingInvoice} onClose={() => setEditingInvoice(null)} />}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación electrónica</h1>
          <p className="text-gray-500 text-sm">Comprobantes SUNAT — vía Factpro · Plan gratuito · DEMO</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExport(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-brand-200 text-brand-600 rounded-xl text-sm font-medium hover:bg-brand-50 transition-all">
            <Download size={16} /> Exportar
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-all shadow-sm">
            <Plus size={16} /> Nuevo comprobante
          </button>
        </div>
      </div>

      <div className="flex gap-3 border-b border-gray-200">
        <button onClick={() => setTab('invoices')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'invoices' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>
          Comprobantes ({invoices.length})
        </button>
        <button onClick={() => setTab('pending-orders')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'pending-orders' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>
          Pedidos pendientes ({pendingOrders.length})
        </button>
      </div>

      {tab === 'invoices' && (
        <div className="grid grid-cols-4 gap-4">
          {[{ label: 'Total', value: invoices.length, color: 'text-blue-600', bg: 'bg-blue-50' }, { label: 'Aceptados', value: accepted, color: 'text-green-600', bg: 'bg-green-50' }, { label: 'Pendientes', value: pending, color: 'text-yellow-600', bg: 'bg-yellow-50' }, { label: 'Rechazados', value: rejected, color: 'text-red-600', bg: 'bg-red-50' }].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-2xl p-5 text-center ${bg}`}>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
              <p className="text-sm text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Receipt size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-800">Comprobantes</h2>
            <span className="ml-auto text-xs text-gray-400 bg-brand-50 px-2 py-0.5 rounded-full">PCGE · SUNAT · UBL 2.1</span>
          </div>

          {invoicesLoading ? (
            <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Nro Pedido</th>
                    <th className="px-5 py-3 text-left">Serie-Número</th>
                    <th className="px-5 py-3 text-left">Tipo</th>
                    <th className="px-5 py-3 text-left">Receptor</th>
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Plazo pago</th>
                    <th className="px-5 py-3 text-right">IGV</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-left">Estado SUNAT</th>
                    <th className="px-5 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-brand-50/30 transition-colors">
                      <td className="px-5 py-3 text-xs text-gray-600">{inv.salesOrder?.orderNumber || '—'}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-700">{inv.series}-{String(inv.correlative).padStart(8, '0')}</td>
                      <td className="px-5 py-3 text-gray-600 text-xs">{DOC_LABEL[inv.docType] ?? inv.docType}</td>
                      <td className="px-5 py-3"><p className="font-medium text-gray-800 truncate max-w-[160px]">{inv.entityName || <span className="italic text-gray-300">Anónimo</span>}</p><p className="text-xs text-gray-400 font-mono">{inv.entityDocNo}</p></td>
                      <td className="px-5 py-3 text-xs text-gray-500">{new Date(inv.issueDate).toLocaleDateString('es-PE')}</td>
                      <td className="px-5 py-3 text-xs text-gray-600">{inv.paymentDueDays ? `${inv.paymentDueDays}d` : inv.paymentDueDate ? new Date(inv.paymentDueDate).toLocaleDateString('es-PE') : 'Al contado'}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-gray-500">S/ {fmtNum(inv.igvPen)}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-gray-800">S/ {fmtNum(inv.totalPen)}</td>
                      <td className="px-5 py-3"><StatusBadge status={inv.status} reason={inv.rejectionReason ?? undefined} /></td>
                      <td className="px-5 py-3"><div className="flex items-center justify-center gap-2">{inv.status === 'DRAFT' && (<><button onClick={() => setEditingInvoice(inv)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-all">Edit</button><button onClick={() => emitMutation.mutate(inv.id)} disabled={emitMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-all">{emitMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}Emitir</button></>) } {inv.status === 'REJECTED' && (<button onClick={() => emitMutation.mutate(inv.id)} disabled={emitMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-all">{emitMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}Reintentar</button>)} {inv.status === 'ACCEPTED' && inv.pdfUrl && (<a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-all"><FileDown size={12} /> PDF</a>)} {inv.status === 'ACCEPTED' && !inv.pdfUrl && (<span className="text-xs text-gray-300 italic">Procesando…</span>)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!invoices.length && !invoicesLoading && (
            <div className="py-16 text-center">
              <Receipt size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Sin comprobantes</p>
              <p className="text-xs text-gray-300 mt-1 max-w-xs mx-auto">Crea tu primera factura o boleta con el botón de arriba.</p>
              <button onClick={() => setShowCreate(true)} className="mt-4 flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium mx-auto hover:bg-brand-700 transition-all">
                <Plus size={14} /> Nueva factura / boleta
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'pending-orders' && (
        <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-gray-400" />
              <h2 className="font-semibold text-gray-800">Pedidos sin facturación</h2>
            </div>
            {selectedOrders.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{selectedOrders.size} seleccionados</span>
                <button onClick={() => bulkCreateMutation.mutate({ orderIds: Array.from(selectedOrders), emitAfter: false })} disabled={bulkCreateMutation.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-brand-300 text-brand-700 rounded-lg text-xs font-medium hover:bg-brand-50 disabled:opacity-50 transition-all">
                  {bulkCreateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Receipt size={12} />}Facturar
                </button>
                <button onClick={() => bulkCreateMutation.mutate({ orderIds: Array.from(selectedOrders), emitAfter: true })} disabled={bulkCreateMutation.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-all">
                  {bulkCreateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}Facturar y emitir
                </button>
              </div>
            )}
          </div>

          {pendingOrdersLoading ? (
            <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-center w-10">
                      <input type="checkbox" checked={selectedOrders.size === pendingOrders.length && pendingOrders.length > 0} onChange={toggleAllOrders} className="rounded border-gray-300 cursor-pointer" />
                    </th>
                    <th className="px-5 py-3 text-left">Nro Pedido</th>
                    <th className="px-5 py-3 text-left">Cliente</th>
                    <th className="px-5 py-3 text-left">RUC</th>
                    <th className="px-5 py-3 text-left">Categoría</th>
                    <th className="px-5 py-3 text-right">Subtotal</th>
                    <th className="px-5 py-3 text-right">IGV</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingOrders.map((order) => {
                    const totals = calculateOrderTotals(order);
                    return (
                      <tr key={order.id} className="hover:bg-brand-50/30 transition-colors">
                        <td className="px-5 py-3 text-center">
                          <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleOrderSelection(order.id)} className="rounded border-gray-300 cursor-pointer" />
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-700">{order.orderNumber}</td>
                        <td className="px-5 py-3"><p className="font-medium text-gray-800 truncate max-w-[160px]">{order.customer.displayName}</p></td>
                        <td className="px-5 py-3 text-xs text-gray-500 font-mono">{order.customer.docNumber}</td>
                        <td className="px-5 py-3 text-xs text-gray-600">{CATEGORY_LABEL[order.customer.category] || order.customer.category}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-gray-500">S/ {totals.sub.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-gray-500">S/ {totals.igv.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-gray-800">S/ {totals.total.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!pendingOrders.length && !pendingOrdersLoading && (
            <div className="py-16 text-center">
              <CheckCircle2 size={40} className="text-green-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Todos los pedidos están facturados</p>
              <p className="text-xs text-gray-300 mt-1 max-w-xs mx-auto">Revisa la pestaña de Comprobantes para ver tus facturas.</p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
        <span>
          Integrado con <strong>Factpro</strong> · Búsqueda RUC/DNI vía <a href="https://apis.net.pe" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-600">apis.net.pe</a>
          Para producción cambia <code className="bg-gray-100 px-1 rounded">FACTPRO_BASE_URL</code> a <code className="bg-gray-100 px-1 rounded">https://api.factpro.la/api/v2</code>.
        </span>
      </div>
    </div>
  );
}
