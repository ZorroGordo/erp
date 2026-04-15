import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Plus, ShoppingCart, Check, X, Globe, Package, Truck, RotateCcw,
  MapPin, Phone, Mail, StickyNote, ChevronDown, ChevronUp, Search,
  Upload, FileSpreadsheet, Download, DollarSign, CreditCard, Receipt,
  UserPlus, Percent, Settings2, Eye, EyeOff, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtMoney, fmtNum } from '../lib/fmt';


// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  CART:             'Carrito',
  DRAFT:            'Borrador',
  PENDING_PAYMENT:  'Pendiente',
  PAID:             'Pagado',
  CONFIRMED:        'Confirmado',
  ACCEPTED:         'Aceptado',
  READY:            'Listo',
  IN_DELIVERY:      'En camino',
  DELIVERED:        'Entregado',
  CANCELLED:        'Cancelado',
  RETURNED:         'Devuelto',
  COMPLETED:        'Completado',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:            'bg-gray-100 text-gray-500',
  PENDING_PAYMENT:  'bg-yellow-100 text-yellow-800',
  CONFIRMED:        'bg-blue-100 text-blue-800',
  ACCEPTED:         'bg-indigo-100 text-indigo-800',
  READY:            'bg-purple-100 text-purple-800',
  IN_DELIVERY:      'bg-orange-100 text-orange-800',
  DELIVERED:        'bg-green-100 text-green-800',
  CANCELLED:        'bg-red-100 text-red-800',
  RETURNED:         'bg-gray-100 text-gray-600',
  PAID:             'bg-teal-100 text-teal-800',
  CART:             'bg-gray-100 text-gray-500',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID:  'Sin pagar',
  PARTIAL: 'Parcial',
  PAID:    'Pagado',
};
const PAYMENT_STATUS_COLOR: Record<string, string> = {
  UNPAID:  'bg-red-100 text-red-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
  PAID:    'bg-green-100 text-green-700',
};

const PAYMENT_METHODS = [
  { value: 'YAPE',          label: 'Yape' },
  { value: 'PLIN',          label: 'Plin' },
  { value: 'CASH',          label: 'Efectivo' },
  { value: 'CARD_CULQI',    label: 'Culqi (web)' },
  { value: 'CARD_NIUBIZ',   label: 'POS Niubiz' },
  { value: 'BANK_TRANSFER', label: 'Transferencia' },
  { value: 'CREDIT',        label: 'Credito' },
];

const CHANNEL_LABEL: Record<string, string> = {
  ECOMMERCE:     'Ecommerce',
  B2B_PORTAL:    'B2B Portal',
  SALES_AGENT:   'Agente',
  IN_STORE:      'Tienda',
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const color = STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{label}</span>;
}

function PaymentBadge({ status }: { status: string }) {
  const label = PAYMENT_STATUS_LABEL[status] ?? status;
  const color = PAYMENT_STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{label}</span>;
}

// Ecommerce flow: which action buttons to show per status
const ECOMMERCE_ACTIONS: Record<string, { label: string; endpoint: string; icon: any; color: string }[]> = {
  PENDING_PAYMENT: [
    { label: 'Aceptar',   endpoint: 'accept',   icon: Check,        color: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
    { label: 'Cancelar',  endpoint: 'cancel',   icon: X,            color: 'bg-red-100 text-red-700 hover:bg-red-200' },
  ],
  ACCEPTED: [
    { label: 'Listo',     endpoint: 'ready',    icon: Package,      color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
    { label: 'Cancelar',  endpoint: 'cancel',   icon: X,            color: 'bg-red-100 text-red-700 hover:bg-red-200' },
  ],
  READY: [
    { label: 'En camino', endpoint: 'dispatch', icon: Truck,        color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  ],
  IN_DELIVERY: [
    { label: 'Entregado', endpoint: 'deliver',  icon: Check,        color: 'bg-green-100 text-green-700 hover:bg-green-200' },
    { label: 'Devolver',  endpoint: 'return',   icon: RotateCcw,    color: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  ],
};

// ── Searchable Client Combobox ────────────────────────────────────────────────

function ClientCombobox({
  customers,
  value,
  onChange,
  onCreateNew,
}: {
  customers: any[];
  value: string;
  onChange: (id: string) => void;
  onCreateNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter((c: any) =>
      (c.displayName ?? c.businessName ?? c.fullName ?? '').toLowerCase().includes(q) ||
      (c.docNumber ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q)
    );
  }, [customers, search]);

  const selected = customers.find((c: any) => c.id === value);

  return (
    <div ref={ref} className="relative">
      <div
        className="input flex items-center gap-2 cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Search size={14} className="text-gray-400 flex-shrink-0" />
        {open ? (
          <input
            autoFocus
            className="w-full outline-none bg-transparent text-sm"
            placeholder="Buscar por nombre, DNI, RUC, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`text-sm truncate ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
            {selected ? (selected.displayName ?? selected.businessName ?? selected.fullName) : 'Seleccionar cliente...'}
          </span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {/* Create new button */}
          <button
            onClick={() => { onCreateNew(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-brand-600 hover:bg-brand-50 font-medium border-b border-gray-100"
          >
            <UserPlus size={14} /> Crear nuevo cliente
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">No se encontraron clientes</div>
          ) : (
            filtered.map((c: any) => (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                  c.id === value ? 'bg-brand-50 text-brand-700' : 'text-gray-700'
                }`}
              >
                <div>
                  <div className="font-medium">{c.displayName ?? c.businessName ?? c.fullName}</div>
                  <div className="text-xs text-gray-400">
                    {c.type === 'B2B' ? 'B2B' : 'B2C'} · {c.docType}: {c.docNumber ?? '—'}
                    {c.email ? ` · ${c.email}` : ''}
                  </div>
                </div>
                {c.id === value && <Check size={14} className="text-brand-600" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Customer Modal ─────────────────────────────────────────────────────

function CreateCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (customer: any) => void;
}) {
  const [type, setType] = useState<'B2C' | 'B2B'>('B2C');
  const [displayName, setDisplayName] = useState('');
  const [docType, setDocType] = useState('DNI');
  const [docNumber, setDocNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('OTROS');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!displayName.trim()) return toast.error('Nombre es requerido');
    setSaving(true);
    try {
      const body: any = { type, displayName, docType, docNumber: docNumber || undefined, email: email || undefined, phone: phone || undefined };
      if (type === 'B2B') body.category = category;
      const res = await api.post('/v1/customers/', body);
      toast.success('Cliente creado');
      onCreated(res.data.data ?? res.data);
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Error al crear cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Crear nuevo cliente</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        {/* Type selector */}
        <div className="flex gap-2">
          {(['B2C', 'B2B'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setType(t); setDocType(t === 'B2B' ? 'RUC' : 'DNI'); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                type === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t === 'B2C' ? 'Persona (B2C)' : 'Empresa (B2B)'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / Razon social *</label>
            <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={type === 'B2B' ? 'Razon social...' : 'Nombre completo...'} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo doc.</label>
            <select className="input" value={docType} onChange={e => setDocType(e.target.value)}>
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">CE</option>
              <option value="PASSPORT">Pasaporte</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">N doc.</label>
            <input className="input" value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder={docType === 'RUC' ? '20xxxxxxxxx' : '7xxxxxxx'} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefono</label>
            <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9xx xxx xxx" />
          </div>
          {type === 'B2B' && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
              <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {['SUPERMERCADO', 'TIENDA_NATURISTA', 'CAFETERIA', 'RESTAURANTE', 'HOTEL', 'EMPRESA', 'OTROS'].map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creando...' : 'Crear cliente'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Payment Confirmation Modal ────────────────────────────────────────────────

function PaymentModal({
  order,
  onClose,
  onConfirmed,
}: {
  order: any;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [method, setMethod] = useState('YAPE');
  const [amount, setAmount] = useState(Number(order.totalPen ?? 0).toFixed(2));
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      const reader = new FileReader();
      reader.onload = () => setProofPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = async () => {
    if (!amount || Number(amount) <= 0) return toast.error('Monto invalido');
    setSaving(true);
    try {
      // Record payment
      await api.post(`/v1/sales-orders/${order.id}/payments`, {
        method,
        amountPen: Number(amount),
        referenceNo: referenceNo || undefined,
        notes: proofFile ? `[Comprobante adjunto: ${proofFile.name}] ${notes}` : notes || undefined,
      });
      toast.success('Pago registrado');
      onConfirmed();
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Error al registrar pago');
    } finally {
      setSaving(false);
    }
  };

  const name = order.ecommerceCustomerName ?? order.customer?.displayName ?? 'Cliente';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Confirmar pago</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <div className="font-medium text-gray-800">{name}</div>
          <div className="text-gray-500">Pedido #{order.orderNumber} · Total: S/ {fmtNum(order.totalPen)}</div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Metodo de pago</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_METHODS.filter(m => m.value !== 'CREDIT').map(m => (
                <button
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={`px-2 py-1.5 rounded text-xs font-medium border transition-all ${
                    method === m.value
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto (S/)</label>
              <input className="input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">N referencia</label>
              <input className="input" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Ej: N operacion" />
            </div>
          </div>

          {/* Screenshot upload — especially for Yape/Plin */}
          {['YAPE', 'PLIN', 'BANK_TRANSFER'].includes(method) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comprobante (captura)</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center">
                {proofPreview ? (
                  <div className="relative">
                    <img src={proofPreview} alt="Comprobante" className="max-h-40 mx-auto rounded" />
                    <button
                      onClick={() => { setProofFile(null); setProofPreview(null); }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600">
                    <Upload size={20} />
                    <span className="text-xs">Subir captura de pantalla</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional..." />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1" onClick={handleConfirm} disabled={saving}>
            <DollarSign size={14} className="inline mr-1" />
            {saving ? 'Registrando...' : 'Registrar pago y aceptar'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Import Modal ─────────────────────────────────────────────────────────

function BulkImportModal({
  products,
  customers,
  onClose,
  onImported,
}: {
  products: any[];
  customers: any[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const downloadTemplate = () => {
    // Dynamic import for XLSX
    import('xlsx').then(XLSX => {
      const headers = ['cliente_id', 'cliente_nombre', 'canal', 'producto_id', 'producto_nombre', 'cantidad', 'precio_unitario', 'descuento_pct', 'tipo_comprobante', 'notas'];
      const exampleRow = [
        customers[0]?.id ?? '',
        customers[0]?.displayName ?? 'Ejemplo S.A.C.',
        'SALES_AGENT',
        products[0]?.id ?? '',
        products[0]?.name ?? 'Pan de masa madre',
        '10',
        products[0]?.basePricePen ?? '15.00',
        '0',
        'BOLETA',
        '',
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
      ws['!cols'] = headers.map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
      XLSX.writeFile(wb, 'plantilla-pedidos-masivos.xlsx');
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setErrors([]);

    const XLSX = await import('xlsx');
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws) as any[];
    setPreview(rows);
  };

  const handleImport = async () => {
    if (!preview?.length) return;
    setImporting(true);
    const errs: string[] = [];
    let successCount = 0;

    // Group rows by cliente_id to create one order per customer
    const grouped = new Map<string, any[]>();
    for (const row of preview) {
      const key = row.cliente_id || row.cliente_nombre || 'unknown';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    for (const [clientKey, rows] of grouped) {
      try {
        const customerId = rows[0].cliente_id;
        if (!customerId) { errs.push(`Fila con cliente "${clientKey}": falta cliente_id`); continue; }

        const lines = rows.map(r => ({
          productId: r.producto_id,
          qty: Number(r.cantidad) || 1,
          unitPriceOverride: r.precio_unitario ? Number(r.precio_unitario) : undefined,
          discountPct: r.descuento_pct ? Number(r.descuento_pct) : undefined,
        })).filter(l => l.productId);

        if (lines.length === 0) { errs.push(`Pedido "${clientKey}": sin productos validos`); continue; }

        await api.post('/v1/sales-orders/', {
          customerId,
          channel: rows[0].canal || 'SALES_AGENT',
          lines,
          invoiceType: rows[0].tipo_comprobante || null,
          notes: rows[0].notas || undefined,
        });
        successCount++;
      } catch (e: any) {
        errs.push(`Pedido "${clientKey}": ${e.response?.data?.message ?? e.message}`);
      }
    }

    setErrors(errs);
    if (successCount > 0) {
      toast.success(`${successCount} pedido(s) importados`);
      onImported();
    }
    setImporting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2"><FileSpreadsheet size={20} /> Importar pedidos masivos</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="flex gap-3">
          <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 text-sm">
            <Download size={14} /> Descargar plantilla Excel
          </button>
          <label className="btn-secondary flex items-center gap-2 text-sm cursor-pointer">
            <Upload size={14} /> {file ? file.name : 'Subir archivo Excel'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>
        </div>

        {preview && (
          <div className="text-sm">
            <p className="text-gray-600 mb-2">{preview.length} fila(s) encontradas · {new Set(preview.map(r => r.cliente_id)).size} pedido(s)</p>
            <div className="max-h-48 overflow-auto border rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Cliente</th>
                    <th className="px-2 py-1.5 text-left">Producto</th>
                    <th className="px-2 py-1.5 text-right">Cant.</th>
                    <th className="px-2 py-1.5 text-right">Precio</th>
                    <th className="px-2 py-1.5 text-right">Desc %</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">{r.cliente_nombre || r.cliente_id?.slice(-6)}</td>
                      <td className="px-2 py-1">{r.producto_nombre || r.producto_id?.slice(-6)}</td>
                      <td className="px-2 py-1 text-right">{r.cantidad}</td>
                      <td className="px-2 py-1 text-right">{r.precio_unitario ?? '—'}</td>
                      <td className="px-2 py-1 text-right">{r.descuento_pct ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 max-h-32 overflow-auto">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            className="btn-primary flex-1"
            onClick={handleImport}
            disabled={!preview?.length || importing}
          >
            {importing ? 'Importando...' : `Importar ${preview?.length ?? 0} fila(s)`}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Column configuration ──────────────────────────────────────────────────────

const STORAGE_KEY = 'ventas-visible-columns';

interface ColumnDef {
  id: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  render: (o: any) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  SUPERMERCADO:     'Supermercado',
  TIENDA_NATURISTA: 'Tienda Naturista',
  CAFETERIA:        'Cafeteria',
  RESTAURANTE:      'Restaurante',
  HOTEL:            'Hotel',
  EMPRESA:          'Empresa',
  OTROS:            'Otros',
};

function buildColumns(paymentMethods: typeof PAYMENT_METHODS): ColumnDef[] {
  return [
    // ── Pedido
    { id: 'orderNumber', label: 'Nro. Pedido', group: 'Pedido', defaultVisible: true,
      render: (o) => <div className="flex items-center gap-1.5 font-mono text-gray-700">{o.channel === 'ECOMMERCE' && <Globe size={12} className="text-indigo-500 flex-shrink-0" />}{o.orderNumber}</div> },
    { id: 'createdAt', label: 'Fecha', group: 'Pedido', defaultVisible: false,
      render: (o) => <span className="text-gray-500 text-xs">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-PE') : '—'}</span> },
    { id: 'channel', label: 'Canal', group: 'Pedido', defaultVisible: true,
      render: (o) => <span className="text-gray-500 text-xs">{CHANNEL_LABEL[o.channel] ?? o.channel}</span> },
    { id: 'status', label: 'Estado', group: 'Pedido', defaultVisible: true,
      render: (o) => <StatusBadge status={o.status} /> },
    { id: 'invoiceNumber', label: 'N° Factura', group: 'Pedido', defaultVisible: false,
      render: (o) => <span className="text-xs text-gray-500 font-mono">{o.invoiceId ?? '—'}</span> },
    { id: 'invoiceType', label: 'Comprobante', group: 'Pedido', defaultVisible: true,
      render: (o) => o.invoiceType
        ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${o.invoiceType === 'FACTURA' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{o.invoiceType}</span>
        : <span className="text-gray-300">—</span> },
    { id: 'notes', label: 'Notas', group: 'Pedido', defaultVisible: false,
      render: (o) => <span className="text-xs text-gray-500 truncate max-w-[120px] inline-block">{o.notes || '—'}</span> },

    // ── Cliente
    { id: 'clientName', label: 'Cliente', group: 'Cliente', defaultVisible: true,
      render: (o) => {
        const isEcom = o.channel === 'ECOMMERCE';
        const name = isEcom ? (o.ecommerceCustomerName ?? 'Cliente web') : (o.customer?.displayName ?? '—');
        return (<div><div className="font-medium text-gray-800">{name}</div>
          {isEcom && o.ecommerceCustomerEmail && <div className="text-xs text-gray-400">{o.ecommerceCustomerEmail}</div>}
        </div>);
      }},
    { id: 'ruc', label: 'RUC / DNI', group: 'Cliente', defaultVisible: false,
      render: (o) => <span className="text-xs font-mono text-gray-600">{o.customer?.docNumber ?? '—'}</span> },
    { id: 'razonSocial', label: 'Razon Social', group: 'Cliente', defaultVisible: false,
      render: (o) => <span className="text-xs text-gray-600">{o.customer?.displayName ?? o.customer?.businessName ?? '—'}</span> },
    { id: 'category', label: 'Categoria', group: 'Cliente', defaultVisible: false,
      render: (o) => {
        const cat = o.customer?.category;
        return cat ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{CATEGORY_LABEL[cat] ?? cat}</span> : <span className="text-gray-300">—</span>;
      }},
    { id: 'clientEmail', label: 'Email', group: 'Cliente', defaultVisible: false,
      render: (o) => <span className="text-xs text-gray-500">{o.ecommerceCustomerEmail ?? o.customer?.email ?? '—'}</span> },
    { id: 'clientPhone', label: 'Telefono', group: 'Cliente', defaultVisible: false,
      render: (o) => <span className="text-xs text-gray-500">{o.ecommerceCustomerPhone ?? o.customer?.phone ?? '—'}</span> },

    // ── Productos (summary)
    { id: 'skus', label: 'SKUs', group: 'Productos', defaultVisible: false,
      render: (o) => <span className="text-xs font-mono text-gray-500">{(o.lines ?? []).map((l: any) => l.product?.sku ?? '').filter(Boolean).join(', ') || '—'}</span> },
    { id: 'products', label: 'Productos', group: 'Productos', defaultVisible: false,
      render: (o) => <span className="text-xs text-gray-600 truncate max-w-[180px] inline-block">{(o.lines ?? []).map((l: any) => l.product?.name ?? '').filter(Boolean).join(', ') || '—'}</span> },
    { id: 'itemCount', label: 'Items', group: 'Productos', defaultVisible: false, align: 'center',
      render: (o) => <span className="text-xs text-gray-500">{(o.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty), 0)}</span> },

    // ── Entrega
    { id: 'deliveryDate', label: 'Entrega', group: 'Entrega', defaultVisible: true,
      render: (o) => {
        const addr = o.addressSnap ?? {};
        return (<div className="text-xs text-gray-500">
          {o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '—'}
          {o.channel === 'ECOMMERCE' && addr.district && <div className="text-gray-400">{addr.district}</div>}
        </div>);
      }},

    // ── Montos
    { id: 'subtotal', label: 'Subtotal', group: 'Montos', defaultVisible: false, align: 'right',
      render: (o) => <span className="font-mono text-xs">S/ {fmtNum(o.subtotalPen)}</span> },
    { id: 'igv', label: 'IGV', group: 'Montos', defaultVisible: false, align: 'right',
      render: (o) => <span className="font-mono text-xs">S/ {fmtNum(o.igvPen)}</span> },
    { id: 'total', label: 'Total', group: 'Montos', defaultVisible: true, align: 'right',
      render: (o) => <span className="font-mono font-semibold">S/ {fmtNum(o.totalPen ?? o.totalAmountPen)}</span> },

    // ── Pago
    { id: 'paymentStatus', label: 'Estado pago', group: 'Pago', defaultVisible: true,
      render: (o) => <PaymentBadge status={o.paymentStatus ?? 'UNPAID'} /> },
    { id: 'paymentMethod', label: 'Forma pago', group: 'Pago', defaultVisible: true,
      render: (o) => {
        const methods = (o.payments ?? []).map((p: any) => paymentMethods.find(m => m.value === p.method)?.label ?? p.method);
        return <span className="text-xs text-gray-500">{methods.length > 0 ? methods.join(', ') : '—'}</span>;
      }},
  ];
}

function ColumnPicker({
  columns,
  visibleIds,
  onChange,
  onClose,
}: {
  columns: ColumnDef[];
  visibleIds: Set<string>;
  onChange: (ids: Set<string>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const groups = useMemo(() => {
    const map = new Map<string, ColumnDef[]>();
    columns.forEach(c => {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    });
    return map;
  }, [columns]);

  const toggle = (id: string) => {
    const next = new Set(visibleIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(columns.map(c => c.id)));
  const selectDefaults = () => onChange(new Set(columns.filter(c => c.defaultVisible).map(c => c.id)));

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-72 max-h-96 overflow-y-auto">
      <div className="p-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Columnas visibles</span>
        <div className="flex gap-1">
          <button onClick={selectAll} className="text-xs text-brand-600 hover:underline">Todas</button>
          <span className="text-gray-300">|</span>
          <button onClick={selectDefaults} className="text-xs text-brand-600 hover:underline">Default</button>
        </div>
      </div>
      {Array.from(groups.entries()).map(([group, cols]) => (
        <div key={group} className="px-3 py-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{group}</p>
          {cols.map(c => (
            <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1">
              <input
                type="checkbox"
                checked={visibleIds.has(c.id)}
                onChange={() => toggle(c.id)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">{c.label}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Reporte de Ventas Export Modal ─────────────────────────────────────────────

function SalesReportExportModal({
  orders,
  onClose,
}: {
  orders: any[];
  onClose: () => void;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterPayStatus, setFilterPayStatus] = useState('');
  const [filterPayMethod, setFilterPayMethod] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterInvoiceType, setFilterInvoiceType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [reportType, setReportType] = useState<'orders' | 'lines'>('lines');

  const filtered = useMemo(() => {
    return orders.filter((o: any) => {
      if (dateFrom && new Date(o.createdAt) < new Date(dateFrom)) return false;
      if (dateTo) { const to = new Date(dateTo); to.setHours(23, 59, 59); if (new Date(o.createdAt) > to) return false; }
      if (filterChannel && o.channel !== filterChannel) return false;
      if (filterStatus && o.status !== filterStatus) return false;
      if (filterPayStatus && o.paymentStatus !== filterPayStatus) return false;
      if (filterPayMethod) {
        const methods = (o.payments ?? []).map((p: any) => p.method);
        if (!methods.includes(filterPayMethod)) return false;
      }
      if (filterCategory && o.customer?.category !== filterCategory) return false;
      if (filterInvoiceType && o.invoiceType !== filterInvoiceType) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo, filterChannel, filterStatus, filterPayStatus, filterPayMethod, filterCategory, filterInvoiceType]);

  const lineCount = filtered.reduce((s: number, o: any) => s + (o.lines?.length ?? 0), 0);

  const handleExport = async () => {
    const XLSX = await import('xlsx');

    if (reportType === 'lines') {
      // Line-item level report (Reporte de Ventas)
      const rows = filtered.flatMap((o: any) =>
        (o.lines ?? []).map((line: any) => {
          const unitPrice = Number(line.unitPrice ?? 0);
          const qty = Number(line.qty ?? 0);
          const lineSubtotal = unitPrice * qty;
          const lineIgv = lineSubtotal * 0.18;
          const lineTotal = lineSubtotal + lineIgv;
          const methods = (o.payments ?? []).map((p: any) => PAYMENT_METHODS.find(m => m.value === p.method)?.label ?? p.method);
          return {
            'RUC': o.customer?.docNumber ?? '',
            'Razon Social': o.customer?.displayName ?? o.ecommerceCustomerName ?? '',
            'Categoria': CATEGORY_LABEL[o.customer?.category] ?? o.customer?.category ?? '',
            'N° Pedido': o.orderNumber,
            'Fecha': o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-PE') : '',
            'Canal': CHANNEL_LABEL[o.channel] ?? o.channel,
            'Estado': STATUS_LABEL[o.status] ?? o.status,
            'N° Factura': o.invoiceId ?? '',
            'Comprobante': o.invoiceType ?? '',
            'SKU': line.product?.sku ?? '',
            'Producto': line.product?.name ?? '',
            'Cantidad': qty,
            'Precio Venta Unitario': Number(unitPrice.toFixed(2)),
            'Subtotal': Number(lineSubtotal.toFixed(2)),
            'IGV (18%)': Number(lineIgv.toFixed(2)),
            'Total': Number(lineTotal.toFixed(2)),
            'Estado Pago': PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus ?? '',
            'Forma de Pago': methods.join(', '),
            'Descuento %': line.discountPct ? Number(line.discountPct) : '',
          };
        })
      );
      const ws = XLSX.utils.json_to_sheet(rows);
      // Column widths
      ws['!cols'] = [
        { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 },
        { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Ventas');

      // Add meta sheet
      const metaRows = [
        ['Reporte de Ventas — Victorsdou'],
        ['Exportado', new Date().toLocaleString('es-PE')],
        ['Periodo', dateFrom || 'Inicio', dateTo || 'Hoy'],
        ['Pedidos', filtered.length],
        ['Lineas', lineCount],
      ];
      const metaWs = XLSX.utils.aoa_to_sheet(metaRows);
      XLSX.utils.book_append_sheet(wb, metaWs, 'Info');

      XLSX.writeFile(wb, `reporte-ventas-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      // Order-level summary report
      const rows = filtered.map((o: any) => {
        const methods = (o.payments ?? []).map((p: any) => PAYMENT_METHODS.find(m => m.value === p.method)?.label ?? p.method);
        const skus = (o.lines ?? []).map((l: any) => l.product?.sku).filter(Boolean).join(', ');
        const products = (o.lines ?? []).map((l: any) => l.product?.name).filter(Boolean).join(', ');
        return {
          'N° Pedido': o.orderNumber,
          'Fecha': o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-PE') : '',
          'RUC': o.customer?.docNumber ?? '',
          'Razon Social': o.customer?.displayName ?? o.ecommerceCustomerName ?? '',
          'Categoria': CATEGORY_LABEL[o.customer?.category] ?? '',
          'Canal': CHANNEL_LABEL[o.channel] ?? o.channel,
          'Estado': STATUS_LABEL[o.status] ?? o.status,
          'SKUs': skus,
          'Productos': products,
          'Subtotal': Number(Number(o.subtotalPen ?? 0).toFixed(2)),
          'IGV': Number(Number(o.igvPen ?? 0).toFixed(2)),
          'Total': Number(Number(o.totalPen ?? 0).toFixed(2)),
          'Estado Pago': PAYMENT_STATUS_LABEL[o.paymentStatus] ?? '',
          'Forma de Pago': methods.join(', '),
          'Comprobante': o.invoiceType ?? '',
          'N° Factura': o.invoiceId ?? '',
          'Email': o.ecommerceCustomerEmail ?? o.customer?.email ?? '',
          'Telefono': o.ecommerceCustomerPhone ?? o.customer?.phone ?? '',
          'Notas': o.notes ?? '',
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Array(19).fill({ wch: 16 });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
      XLSX.writeFile(wb, `pedidos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
    toast.success('Reporte exportado');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2"><FileSpreadsheet size={20} /> Exportar Reporte de Ventas</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        {/* Report type */}
        <div className="flex gap-2">
          {([
            { value: 'lines' as const, label: 'Por producto (detallado)', desc: 'Una fila por SKU — ideal para contabilidad' },
            { value: 'orders' as const, label: 'Por pedido (resumen)', desc: 'Una fila por pedido — resumen general' },
          ]).map(t => (
            <button
              key={t.value}
              onClick={() => setReportType(t.value)}
              className={`flex-1 text-left px-3 py-2.5 rounded-lg border transition-all ${
                reportType === t.value ? 'bg-brand-50 border-brand-300 ring-1 ring-brand-200' : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs text-gray-400">{t.desc}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input type="date" className="input text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input type="date" className="input text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Canal</label>
            <select className="input text-sm" value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
            <select className="input text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Estado pago</label>
            <select className="input text-sm" value={filterPayStatus} onChange={e => setFilterPayStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(PAYMENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Forma pago</label>
            <select className="input text-sm" value={filterPayMethod} onChange={e => setFilterPayMethod(e.target.value)}>
              <option value="">Todas</option>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
            <select className="input text-sm" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Comprobante</label>
            <select className="input text-sm" value={filterInvoiceType} onChange={e => setFilterInvoiceType(e.target.value)}>
              <option value="">Todos</option>
              <option value="BOLETA">Boleta</option>
              <option value="FACTURA">Factura</option>
            </select>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-800">{filtered.length}</span> pedidos
            {reportType === 'lines' && <> · <span className="font-semibold text-gray-800">{lineCount}</span> lineas de producto</>}
          </div>
          <div className="text-xs text-gray-400">
            Total: S/ {fmtNum(filtered.reduce((s: number, o: any) => s + Number(o.totalPen ?? 0), 0))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleExport} disabled={filtered.length === 0}>
            <Download size={14} /> Exportar Excel
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SalesOrders() {
  const qc = useQueryClient();

  // Filters
  const [filterEcommerce, setFilterEcommerce] = useState(false);
  const [filterStatus, setFilterStatus]       = useState('');

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toggleDetail = (id: string) => setSelectedId(prev => prev === id ? null : id);

  // New order form
  const [showForm,    setShowForm]    = useState(false);
  const [customerId,  setCustomerId]  = useState('');
  const [channel,     setChannel]     = useState('SALES_AGENT');
  const [invoiceType, setInvoiceType] = useState('');
  const [masterDiscount, setMasterDiscount] = useState(0);
  const [orderNotes,  setOrderNotes]  = useState('');
  const [lines, setLines] = useState<{ productId: string; qty: number; unitPrice: string; discountPct: number }[]>([
    { productId: '', qty: 1, unitPrice: '', discountPct: 0 },
  ]);

  // Modals
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState<any>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showExportReport, setShowExportReport] = useState(false);

  // Column configuration
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const allColumns = useMemo(() => buildColumns(PAYMENT_METHODS), []);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set(allColumns.filter(c => c.defaultVisible).map(c => c.id));
  });
  const saveColumns = useCallback((ids: Set<string>) => {
    setVisibleColumnIds(ids);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  }, []);
  const visibleColumns = useMemo(() => allColumns.filter(c => visibleColumnIds.has(c.id)), [allColumns, visibleColumnIds]);

  // Build query params
  const queryParams = new URLSearchParams();
  if (filterEcommerce)          queryParams.set('channel', 'ECOMMERCE');
  if (filterStatus)             queryParams.set('status', filterStatus);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['sales-orders', filterEcommerce, filterStatus],
    queryFn: () => api.get(`/v1/sales-orders/?${queryParams}`).then(r => r.data),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn:  () => api.get('/v1/customers/').then(r => r.data),
  });
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn:  () => api.get('/v1/products/').then(r => r.data),
  });

  const customerList = customers?.data ?? [];
  const productList  = products?.data ?? [];

  // When product selected, fill in base price
  const handleProductChange = (index: number, productId: string) => {
    const product = productList.find((p: any) => p.id === productId);
    setLines(ls => ls.map((x, j) =>
      j === index
        ? { ...x, productId, unitPrice: product ? String(Number(product.basePricePen)) : '' }
        : x
    ));
  };

  // Compute order totals for preview
  const orderPreview = useMemo(() => {
    const validLines = lines.filter(l => l.productId && Number(l.unitPrice) > 0);
    const masterFactor = masterDiscount > 0 ? (100 - masterDiscount) / 100 : 1;
    const lineDetails = validLines.map(l => {
      const basePrice = Number(l.unitPrice);
      const afterLineDisc = l.discountPct > 0 ? basePrice * (100 - l.discountPct) / 100 : basePrice;
      const finalPrice = afterLineDisc * masterFactor;
      const lineTotal = finalPrice * l.qty;
      return { ...l, finalPrice, lineTotal };
    });
    const subtotal = lineDetails.reduce((s, l) => s + l.lineTotal, 0);
    const igv = subtotal * 0.18;
    return { lineDetails, subtotal, igv, total: subtotal + igv };
  }, [lines, masterDiscount]);

  // Mutations
  const createOrder = useMutation({
    mutationFn: (body: any) => api.post('/v1/sales-orders/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success('Pedido creado');
      setShowForm(false);
      setCustomerId('');
      setLines([{ productId: '', qty: 1, unitPrice: '', discountPct: 0 }]);
      setMasterDiscount(0);
      setInvoiceType('');
      setOrderNotes('');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error al crear pedido'),
  });

  const statusAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.patch(`/v1/sales-orders/${id}/${action}`),
    onSuccess: (_d, { action }) => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      const labels: Record<string, string> = {
        accept: 'Pedido aceptado', ready: 'Pedido listo', dispatch: 'En camino',
        deliver: 'Entregado', return: 'Marcado como devuelto', cancel: 'Cancelado',
      };
      toast.success(labels[action] ?? 'Actualizado');
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message ?? 'Error al actualizar estado';
      // If payment required, show payment modal
      if (e.response?.data?.error === 'PAYMENT_REQUIRED') {
        toast.error('Debe registrar pago primero');
      } else {
        toast.error(msg);
      }
    },
  });

  const handleAcceptClick = (order: any) => {
    // If unpaid, show payment modal first
    if (order.paymentStatus === 'UNPAID' && (!order.payments || order.payments.length === 0)) {
      setPaymentModalOrder(order);
    } else {
      statusAction.mutate({ id: order.id, action: 'accept' });
    }
  };

  const ecommerceOrderCount = (orders?.data ?? []).filter((o: any) => o.channel === 'ECOMMERCE').length;

  const handleCreateOrder = () => {
    const validLines = lines.filter(l => l.productId);
    if (!customerId) return toast.error('Selecciona un cliente');
    if (validLines.length === 0) return toast.error('Agrega al menos un producto');

    createOrder.mutate({
      customerId,
      channel,
      invoiceType: invoiceType || undefined,
      masterDiscountPct: masterDiscount > 0 ? masterDiscount : undefined,
      notes: orderNotes || undefined,
      lines: validLines.map(l => ({
        productId: l.productId,
        qty: l.qty,
        unitPriceOverride: l.unitPrice ? Number(l.unitPrice) : undefined,
        discountPct: l.discountPct > 0 ? l.discountPct : undefined,
      })),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ventas</h1>
          <p className="text-gray-500 text-sm">Pedidos B2B, B2C y ecommerce</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={() => setShowBulkImport(true)}
          >
            <Upload size={14} /> Importar
          </button>
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={() => setShowExportReport(true)}
          >
            <Download size={14} /> Exportar
          </button>
          <div className="relative">
            <button
              className="btn-secondary flex items-center gap-2 text-sm"
              onClick={() => setShowColumnPicker(v => !v)}
              title="Configurar columnas"
            >
              <Settings2 size={14} /> Columnas
            </button>
            {showColumnPicker && (
              <ColumnPicker
                columns={allColumns}
                visibleIds={visibleColumnIds}
                onChange={saveColumns}
                onClose={() => setShowColumnPicker(false)}
              />
            )}
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> Nuevo pedido
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterEcommerce(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
            filterEcommerce
              ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Globe size={14} />
          Ecommerce
          {filterEcommerce && ecommerceOrderCount > 0 && (
            <span className="ml-1 bg-white/20 text-xs px-1.5 py-0.5 rounded-full font-bold">{ecommerceOrderCount}</span>
          )}
        </button>

        <div className="flex items-center gap-1">
          {[
            { value: '',                label: 'Todos' },
            { value: 'PENDING_PAYMENT', label: 'Pendiente' },
            { value: 'ACCEPTED',        label: 'Aceptado' },
            { value: 'READY',           label: 'Listo' },
            { value: 'IN_DELIVERY',     label: 'En camino' },
            { value: 'DELIVERED',       label: 'Entregado' },
            { value: 'RETURNED',        label: 'Devuelto' },
            { value: 'CANCELLED',       label: 'Cancelado' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filterStatus === opt.value
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── New order form ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo pedido</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Client selector with search */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
              <ClientCombobox
                customers={customerList}
                value={customerId}
                onChange={setCustomerId}
                onCreateNew={() => setShowCreateCustomer(true)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Canal</label>
              <select className="input" value={channel} onChange={e => setChannel(e.target.value)}>
                {Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comprobante</label>
              <select className="input" value={invoiceType} onChange={e => setInvoiceType(e.target.value)}>
                <option value="">Sin comprobante</option>
                <option value="BOLETA">Boleta</option>
                <option value="FACTURA">Factura</option>
              </select>
            </div>
          </div>

          {/* Order lines with editable pricing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-600">Lineas de pedido</label>
              <div className="flex items-center gap-2">
                <Percent size={12} className="text-gray-400" />
                <label className="text-xs text-gray-500">Desc. global:</label>
                <input
                  type="number"
                  className="input w-20 text-center text-sm"
                  min={0} max={100} step={1}
                  value={masterDiscount}
                  onChange={e => setMasterDiscount(Number(e.target.value) || 0)}
                  placeholder="0"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
            </div>

            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 mb-1 text-xs font-medium text-gray-500 px-1">
              <div className="col-span-4">Producto</div>
              <div className="col-span-2 text-right">Precio base</div>
              <div className="col-span-1 text-center">Desc %</div>
              <div className="col-span-2 text-right">Precio final</div>
              <div className="col-span-1 text-center">Cant.</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>

            {lines.map((l, i) => {
              const product = productList.find((p: any) => p.id === l.productId);
              const basePrice = Number(l.unitPrice) || 0;
              const afterLineDisc = l.discountPct > 0 ? basePrice * (100 - l.discountPct) / 100 : basePrice;
              const masterFactor = masterDiscount > 0 ? (100 - masterDiscount) / 100 : 1;
              const finalPrice = afterLineDisc * masterFactor;
              const lineTotal = finalPrice * l.qty;

              return (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-center">
                  {/* Product selector */}
                  <div className="col-span-4">
                    <select
                      className="input text-sm"
                      value={l.productId}
                      onChange={e => handleProductChange(i, e.target.value)}
                    >
                      <option value="">Producto...</option>
                      {productList.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name} (S/ {fmtNum(p.basePricePen)})</option>
                      ))}
                    </select>
                  </div>
                  {/* Editable unit price */}
                  <div className="col-span-2">
                    <input
                      type="number"
                      className="input text-sm text-right"
                      step="0.01"
                      value={l.unitPrice}
                      onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))}
                      placeholder="0.00"
                    />
                  </div>
                  {/* Line discount */}
                  <div className="col-span-1">
                    <input
                      type="number"
                      className="input text-sm text-center"
                      min={0} max={100} step={1}
                      value={l.discountPct}
                      onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, discountPct: Number(e.target.value) || 0 } : x))}
                    />
                  </div>
                  {/* Final price (read-only) */}
                  <div className="col-span-2 text-right text-sm font-mono text-gray-600 pr-2">
                    {l.productId ? `S/ ${finalPrice.toFixed(2)}` : '—'}
                  </div>
                  {/* Quantity */}
                  <div className="col-span-1">
                    <input
                      type="number"
                      className="input text-sm text-center"
                      min={1}
                      value={l.qty}
                      onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, qty: parseInt(e.target.value) || 1 } : x))}
                    />
                  </div>
                  {/* Line total */}
                  <div className="col-span-1 text-right text-sm font-mono font-semibold pr-1">
                    {l.productId ? `S/ ${lineTotal.toFixed(2)}` : ''}
                  </div>
                  {/* Remove */}
                  <div className="col-span-1 text-center">
                    {lines.length > 1 && (
                      <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              className="text-sm text-brand-600 hover:underline"
              onClick={() => setLines(ls => [...ls, { productId: '', qty: 1, unitPrice: '', discountPct: 0 }])}
            >
              + Agregar linea
            </button>
          </div>

          {/* Totals preview */}
          {orderPreview.lineDetails.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 max-w-xs ml-auto">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal (sin IGV)</span>
                <span className="font-mono">S/ {orderPreview.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>IGV (18%)</span>
                <span className="font-mono">S/ {orderPreview.igv.toFixed(2)}</span>
              </div>
              {masterDiscount > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>Desc. global: {masterDiscount}%</span>
                  <span className="font-mono">aplicado</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1">
                <span>Total</span>
                <span className="font-mono">S/ {orderPreview.total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Notes + submit */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <input className="input" value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Notas del pedido (opcional)..." />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!customerId || createOrder.isPending} onClick={handleCreateOrder}>
              {createOrder.isPending ? 'Creando...' : 'Crear pedido'}
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Orders table ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShoppingCart size={18} className="text-gray-400" />
          <h2 className="font-semibold">Pedidos</h2>
          <span className="ml-auto text-sm text-gray-400">{orders?.data?.length ?? 0}</span>
        </div>
        {isLoading ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
          <div className="table-container overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                <tr>
                  {visibleColumns.map(col => (
                    <th key={col.id} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`} style={col.width ? { minWidth: col.width } : undefined}>
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(orders?.data ?? []).map((o: any) => {
                  const isEcom     = o.channel === 'ECOMMERCE';
                  const actions    = ECOMMERCE_ACTIONS[o.status] ?? [];
                  const isExpanded = selectedId === o.id;

                  return (
                    <React.Fragment key={o.id}>
                      <tr
                        className={`cursor-pointer transition-colors ${isEcom ? 'bg-indigo-50/30' : ''} ${isExpanded ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                        onClick={() => toggleDetail(o.id)}
                      >
                        {visibleColumns.map(col => (
                          <td key={col.id} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}>
                            {col.render(o)}
                          </td>
                        ))}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {isEcom && actions.map(act => (
                              <button
                                key={act.endpoint}
                                onClick={() => {
                                  if (act.endpoint === 'accept') {
                                    handleAcceptClick(o);
                                  } else {
                                    statusAction.mutate({ id: o.id, action: act.endpoint });
                                  }
                                }}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${act.color}`}
                                title={act.label}
                              >
                                <act.icon size={12} />
                                {act.label}
                              </button>
                            ))}
                            {!isEcom && ['DRAFT', 'PENDING_PAYMENT'].includes(o.status) && (
                              <button
                                onClick={() => handleAcceptClick(o)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                                title="Aceptar"
                              >
                                <Check size={12} /> Aceptar
                              </button>
                            )}
                            {!isEcom && ['DRAFT', 'PENDING_PAYMENT', 'CONFIRMED'].includes(o.status) && (
                              <button onClick={() => statusAction.mutate({ id: o.id, action: 'cancel' })} className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200" title="Cancelar">
                                <X size={14} />
                              </button>
                            )}
                            <span className="ml-1 text-gray-300">
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded detail row ─────────────────────────────── */}
                      {isExpanded && (
                        <tr key={`${o.id}-detail`} className="bg-indigo-50/60">
                          <td colSpan={visibleColumns.length + 1} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">

                              {/* Customer info */}
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Cliente</p>
                                <div className="flex items-center gap-2 text-gray-700">
                                  <Mail size={13} className="text-gray-400 flex-shrink-0" />
                                  {o.ecommerceCustomerEmail ?? o.customer?.email ?? '—'}
                                </div>
                                {(o.ecommerceCustomerPhone ?? o.customer?.phone) && (
                                  <div className="flex items-center gap-2 text-gray-700">
                                    <Phone size={13} className="text-gray-400 flex-shrink-0" />
                                    {o.ecommerceCustomerPhone ?? o.customer?.phone}
                                  </div>
                                )}
                                {(() => {
                                  const name = isEcom ? (o.ecommerceCustomerName ?? 'Cliente web') : (o.customer?.displayName ?? '—');
                                  return name && <div className="font-medium text-gray-800">{name}</div>;
                                })()}
                              </div>

                              {/* Delivery address */}
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Entrega</p>
                                {(() => {
                                  const addr = o.addressSnap ?? {};
                                  return addr.street ? (
                                    <div className="flex items-start gap-2 text-gray-700">
                                      <MapPin size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <div>{addr.street}</div>
                                        {addr.district && <div className="text-gray-500">{addr.district}{addr.city ? `, ${addr.city}` : ''}</div>}
                                        {addr.reference && <div className="text-xs text-gray-400 mt-0.5">Ref: {addr.reference}</div>}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">Sin direccion</span>
                                  );
                                })()}
                                {o.deliveryDate && (
                                  <div className="text-gray-600 text-xs mt-1">
                                    {new Date(o.deliveryDate).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
                                  </div>
                                )}
                              </div>

                              {/* Order lines + payments */}
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Productos</p>
                                {(o.lines ?? []).length > 0 ? (
                                  <div className="space-y-1">
                                    {(o.lines ?? []).map((line: any) => (
                                      <div key={line.id} className="flex justify-between text-gray-700 text-xs">
                                        <span>
                                          {line.product?.name ?? `Producto ${line.productId?.slice(-6)}`} x {line.qty}
                                          {line.discountPct && Number(line.discountPct) > 0 ? ` (-${Number(line.discountPct)}%)` : ''}
                                        </span>
                                        <span className="font-mono ml-2">S/ {fmtNum(line.lineTotalPen)}</span>
                                      </div>
                                    ))}
                                    <div className="border-t border-indigo-200 mt-2 pt-2 flex justify-between font-semibold text-gray-800 text-xs">
                                      <span>Total</span>
                                      <span className="font-mono">S/ {fmtNum(o.totalPen ?? o.totalAmountPen)}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">Sin lineas</span>
                                )}

                                {(o.payments ?? []).length > 0 && (
                                  <div className="mt-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pagos</p>
                                    {(o.payments ?? []).map((p: any) => (
                                      <div key={p.id} className="flex justify-between text-xs text-gray-600">
                                        <span>{PAYMENT_METHODS.find(m => m.value === p.method)?.label ?? p.method} {p.referenceNo ? `#${p.referenceNo}` : ''}</span>
                                        <span className="font-mono">S/ {fmtNum(p.amountPen)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {o.notes && (
                                  <div className="flex items-start gap-1.5 text-gray-500 text-xs mt-2">
                                    <StickyNote size={12} className="flex-shrink-0 mt-0.5" />
                                    {o.notes}
                                  </div>
                                )}
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!orders?.data?.length && !isLoading && (
          <p className="text-center text-gray-400 py-8">Sin pedidos aun</p>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showCreateCustomer && (
        <CreateCustomerModal
          onClose={() => setShowCreateCustomer(false)}
          onCreated={(customer) => {
            qc.invalidateQueries({ queryKey: ['customers'] });
            setCustomerId(customer.id);
            setShowCreateCustomer(false);
          }}
        />
      )}

      {paymentModalOrder && (
        <PaymentModal
          order={paymentModalOrder}
          onClose={() => setPaymentModalOrder(null)}
          onConfirmed={() => {
            // After payment recorded, proceed to accept
            statusAction.mutate({ id: paymentModalOrder.id, action: 'accept' });
            setPaymentModalOrder(null);
          }}
        />
      )}

      {showBulkImport && (
        <BulkImportModal
          products={productList}
          customers={customerList}
          onClose={() => setShowBulkImport(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['sales-orders'] });
            setShowBulkImport(false);
          }}
        />
      )}

      {showExportReport && (
        <SalesReportExportModal
          orders={orders?.data ?? []}
          onClose={() => setShowExportReport(false)}
        />
      )}
    </div>
  );
}
