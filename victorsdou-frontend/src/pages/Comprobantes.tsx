// ─────────────────────────────────────────────────────────────────────────────
//  Comprobantes — Document Registry
//  Centralised register for all sustento: facturas, boletas, OC, guías, etc.
//  Follows Peruvian SUNAT / PCGE standards.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, type ElementType } from 'react';
import {
  FileText, Upload, Plus, Search, X, Eye, Trash2,
  CheckCircle2, AlertCircle, FileCheck, FileX,
  ChevronRight, Download, Loader2, Link2, Building2,
  Calendar, DollarSign, Tag, Paperclip, ClipboardList,
  ReceiptText, Truck, ArrowUpDown, Info, Mail, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
type DocType =
  | 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO' | 'NOTA_DEBITO'
  | 'GUIA_REMISION' | 'ORDEN_COMPRA' | 'RECIBO_HONORARIOS'
  | 'TICKET' | 'LIQUIDACION_COMPRA' | 'OTRO';

type ArchivoTipo = 'PDF' | 'IMAGEN' | 'XML';
type Estado      = 'PENDIENTE' | 'VALIDADO' | 'OBSERVADO' | 'ANULADO';

interface ComprobanteArchivo {
  id: string;
  docType: DocType;
  archivoTipo: ArchivoTipo;
  nombreArchivo: string;
  mimeType: string;
  tamanoBytes: number;
  serie: string | null;
  correlativo: string | null;
  numero: string | null;
  fechaEmision: string | null;
  emisorRuc: string | null;
  emisorNombre: string | null;
  receptorRuc: string | null;
  receptorNombre: string | null;
  monedaDoc: string | null;
  subtotal: number | null;
  igv: number | null;
  total: number | null;
  createdAt: string;
}

interface Comprobante {
  id: string;
  tipoDoc: DocType | null;
  descripcion: string;
  fecha: string;
  moneda: string;
  montoTotal: number | null;
  purchaseOrderId: string | null;
  invoiceId: string | null;
  consolidacionRef: string | null;
  estado: Estado;
  notas: string | null;
  tags: string[];
  source: 'MANUAL' | 'EMAIL';
  senderEmail: string | null;
  emailSubject: string | null;
  createdAt: string;
  archivos: ComprobanteArchivo[];
  purchaseOrder?: { id: string; poNumber: string; supplier?: { businessName: string } } | null;
  invoice?: { id: string; docType: string; series: string; correlative: string; entityName: string } | null;
}

interface Stats {
  total: number;
  pendientes: number;
  validados: number;
  mesActual: number;
  emailPendientes: number;
  montoTotalPen: number;
}

interface PendingFile {
  file: File;
  docType: DocType;
  b64: string;
  size: number;
}

interface PurchaseOrderOption {
  id: string;
  poNumber: string;
  supplier?: { businessName: string };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
const DOC_TYPE_LABELS: Record<DocType, string> = {
  FACTURA:           'Factura',
  BOLETA:            'Boleta de Venta',
  NOTA_CREDITO:      'Nota de Crédito',
  NOTA_DEBITO:       'Nota de Débito',
  GUIA_REMISION:     'Guía de Remisión',
  ORDEN_COMPRA:      'Orden de Compra',
  RECIBO_HONORARIOS: 'Recibo por Honorarios',
  TICKET:            'Ticket / Recibo',
  LIQUIDACION_COMPRA:'Liquidación de Compra',
  OTRO:              'Otro',
};

const DOC_TYPE_COLORS: Record<DocType, string> = {
  FACTURA:           'bg-blue-100 text-blue-700',
  BOLETA:            'bg-green-100 text-green-700',
  NOTA_CREDITO:      'bg-orange-100 text-orange-700',
  NOTA_DEBITO:       'bg-red-100 text-red-700',
  GUIA_REMISION:     'bg-purple-100 text-purple-700',
  ORDEN_COMPRA:      'bg-amber-100 text-amber-700',
  RECIBO_HONORARIOS: 'bg-teal-100 text-teal-700',
  TICKET:            'bg-gray-100 text-gray-600',
  LIQUIDACION_COMPRA:'bg-indigo-100 text-indigo-700',
  OTRO:              'bg-gray-100 text-gray-600',
};

const ESTADO_CONFIG: Record<Estado, { label: string; cls: string; icon: ElementType }> = {
  PENDIENTE: { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700',  icon: AlertCircle },
  VALIDADO:  { label: 'Validado',   cls: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  OBSERVADO: { label: 'Observado',  cls: 'bg-orange-100 text-orange-700',icon: Info },
  ANULADO:   { label: 'Anulado',    cls: 'bg-red-100 text-red-700',      icon: FileX },
};

const fmtMoney = (n: number | null | undefined, moneda = 'PEN') => {
  if (n == null) return '—';
  return `${moneda === 'USD' ? '$' : 'S/'} ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtBytes = (n: number) => {
  if (n < 1024)       return `${n} B`;
  if (n < 1048576)    return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

const fileToB64 = (f: File): Promise<string> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res((reader.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(f);
  });

const archivoTipoFromMime = (mime: string): ArchivoTipo => {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/'))  return 'IMAGEN';
  if (mime.includes('xml'))       return 'XML';
  return 'PDF';
};

const DocTypeBadge = ({ type }: { type: DocType }) => (
  <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${DOC_TYPE_COLORS[type]}`}>
    {DOC_TYPE_LABELS[type]}
  </span>
);

const EstadoBadge = ({ estado }: { estado: Estado }) => {
  const { label, cls, icon: Icon } = ESTADO_CONFIG[estado];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={11} />
      {label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Comprobantes() {
  // ── List State ──────────────────────────────────────────────────────────
  const [items,      setItems]      = useState<Comprobante[]>([]);
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page,       setPage]       = useState(1);
  const LIMIT = 30;

  // ── Filters ─────────────────────────────────────────────────────────────
  const [search,        setSearch]       = useState('');
  const [filterEstado,  setFilterEstado] = useState<Estado | ''>('');
  const [filterDoc,     setFilterDoc]    = useState<DocType | ''>('');
  const [filterSource,  setFilterSource] = useState<'EMAIL' | ''>('');
  const [fechaDesde,    setFechaDesde]   = useState('');
  const [fechaHasta,    setFechaHasta]   = useState('');

  // ── Detail Panel ─────────────────────────────────────────────────────────
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [detail,       setDetail]       = useState<Comprobante | null>(null);
  const [detailLoad,   setDetailLoad]   = useState(false);

  // ── New Comprobante Modal ─────────────────────────────────────────────────
  const [newModal,     setNewModal]     = useState(false);
  const [newTipoDoc,   setNewTipoDoc]   = useState<DocType | null>(null);
  const [newDesc,      setNewDesc]      = useState('');
  const [newFecha,     setNewFecha]     = useState(new Date().toISOString().slice(0, 10));
  const [newMoneda,    setNewMoneda]    = useState('PEN');
  const [newNotas,     setNewNotas]     = useState('');
  const [newPoSearch,  setNewPoSearch]  = useState('');
  const [newPoSel,     setNewPoSel]     = useState<PurchaseOrderOption | null>(null);
  const [poOptions,    setPoOptions]    = useState<PurchaseOrderOption[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [submitting,   setSubmitting]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Customer state ────────────────────────────────────────────────────
  const [newCustomerMode,  setNewCustomerMode]  = useState<'existing' | 'ruc' | null>(null);
  const [customerSearch,   setCustomerSearch]   = useState('');
  const [customerOptions,  setCustomerOptions]  = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string | null; displayName: string; ruc?: string } | null>(null);
  const [rucSearch,        setRucSearch]        = useState('');
  const [rucLoading,       setRucLoading]       = useState(false);
  const [rucResult,        setRucResult]        = useState<{ ruc: string; nombre: string } | null>(null);

  // ── Proveedor state ───────────────────────────────────────────────────
  const [proveedorMode,    setProveedorMode]    = useState<'existing' | 'ruc' | null>(null);
  const [proveedorSearch,  setProveedorSearch]  = useState('');
  const [proveedorOptions, setProveedorOptions] = useState<any[]>([]);
  const [selectedProveedor,setSelectedProveedor]= useState<{ id: string | null; displayName: string; ruc?: string } | null>(null);
  const [provRucSearch,    setProvRucSearch]    = useState('');
  const [provRucLoading,   setProvRucLoading]   = useState(false);
  const [provRucResult,    setProvRucResult]    = useState<{ ruc: string; nombre: string } | null>(null);

  // ── Mass Upload Modal ─────────────────────────────────────────────────
  const [massUploadModal,  setMassUploadModal]  = useState(false);
  const [massFiles,        setMassFiles]        = useState<PendingFile[]>([]);
  const [massUploading,    setMassUploading]    = useState(false);
  const [massDragActive,   setMassDragActive]   = useState(false);
  const massFileRef = useRef<HTMLInputElement>(null);

  // Proveedor search typeahead
  useEffect(() => {
    if (proveedorSearch.length < 2) { setProveedorOptions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/v1/customers/', { params: { search: proveedorSearch, limit: 8 } });
        setProveedorOptions((res.data.data ?? []).map((c: any) => ({ id: c.id, displayName: c.displayName ?? c.businessName, ruc: c.docNumber ?? c.ruc })));
      } catch { setProveedorOptions([]); }
    }, 280);
    return () => clearTimeout(t);
  }, [proveedorSearch]);

  // ── Line items state ──────────────────────────────────────────────────
  interface LineItem { id: string; productId: string | null; productName: string; sku: string; qty: number; unitPrice: number; discountPct: number; taxClass: string; }
  const [lineItems,          setLineItems]          = useState<LineItem[]>([]);
  const [productSearch,      setProductSearch]      = useState('');
  const [productOptions,     setProductOptions]     = useState<any[]>([]);
  const [masterDiscountPct,  setMasterDiscountPct]  = useState(0);

  // ── Add Archivo Modal (for existing comprobante) ──────────────────────────
  const [addArchModal,  setAddArchModal]  = useState(false);
  const [addArchFile,   setAddArchFile]   = useState<PendingFile | null>(null);
  const [addArchDocType,setAddArchDocType]= useState<DocType>('FACTURA');
  const [addArchLoading,setAddArchLoading]= useState(false);
  const addArchRef = useRef<HTMLInputElement>(null);

  // ── File Viewer Modal ─────────────────────────────────────────────────────
  const [viewer,      setViewer]      = useState<{ archivoId: string; mime: string; nombre: string } | null>(null);
  const [viewerData,  setViewerData]  = useState<string | null>(null);
  const [viewerLoad,  setViewerLoad]  = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  //  Data Loading
  // ─────────────────────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (search)        params.search       = search;
      if (filterEstado)  params.estado       = filterEstado;
      if (filterDoc)     params.docType      = filterDoc;
      if (filterSource)  params.source       = filterSource;
      if (fechaDesde)    params.fechaDesde   = fechaDesde;
      if (fechaHasta)    params.fechaHasta   = fechaHasta;

      const res = await api.get('/v1/comprobantes', { params });
      setItems(res.data.data);
      setTotalCount(res.data.meta.total);
    } catch {
      toast.error('Error al cargar comprobantes');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterEstado, filterDoc, filterSource, fechaDesde, fechaHasta]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/v1/comprobantes/stats/summary');
      setStats(res.data.data);
    } catch { /* silent */ }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoad(true);
    try {
      const res = await api.get(`/v1/comprobantes/${id}`);
      setDetail(res.data.data);
    } catch {
      toast.error('Error al cargar detalle');
    } finally {
      setDetailLoad(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // ─────────────────────────────────────────────────────────────────────────
  //  PO Search
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!newPoSearch) { setPoOptions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/v1/procurement/purchase-orders', {
          params: { search: newPoSearch, limit: 10 },
        });
        setPoOptions(res.data.data ?? []);
      } catch { setPoOptions([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [newPoSearch]);

  // ─────────────────────────────────────────────────────────────────────────
  //  Customer Search
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerSearch || newCustomerMode !== 'existing') { setCustomerOptions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/v1/customers', { params: { search: customerSearch } });
        setCustomerOptions(res.data.data ?? []);
      } catch { setCustomerOptions([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch, newCustomerMode]);

  // ─────────────────────────────────────────────────────────────────────────
  //  Product Search
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!productSearch) { setProductOptions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/v1/catalog', { params: { search: productSearch, limit: 10 } });
        setProductOptions(res.data.data ?? []);
      } catch { setProductOptions([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  // ── Line item helpers ────────────────────────────────────────────────────
  const addLineItem = (product: any | null) => {
    setLineItems(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      productId:   product?.id   ?? null,
      productName: product?.name ?? '',
      sku:         product?.sku  ?? '',
      qty:         1,
      unitPrice:   product?.basePricePen ?? 0,
      discountPct: 0,
      taxClass:    product?.taxClass ?? 'IGV',
    }]);
  };
  const updateLineItem = (idx: number, field: string, value: any) =>
    setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li));
  const removeLineItem = (idx: number) =>
    setLineItems(prev => prev.filter((_, i) => i !== idx));

  // ─────────────────────────────────────────────────────────────────────────
  //  File Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handlePickFiles = async (fileList: FileList | null, forcedDocType?: DocType) => {
    if (!fileList) return;
    const added: PendingFile[] = [];
    for (const f of Array.from(fileList)) {
      const b64 = await fileToB64(f);
      added.push({ file: f, b64, size: f.size, docType: forcedDocType ?? newTipoDoc ?? guessDocType(f.name) });
    }
    setPendingFiles(prev => [...prev, ...added]);
  };

  const guessDocType = (name: string): DocType => {
    const n = name.toLowerCase();
    if (n.includes('factura') || n.includes('fact'))         return 'FACTURA';
    if (n.includes('boleta') || n.includes('bol'))           return 'BOLETA';
    if (n.includes('guia') || n.includes('guía'))            return 'GUIA_REMISION';
    if (n.includes('orden') || n.includes('oc_'))            return 'ORDEN_COMPRA';
    if (n.includes('honorario') || n.includes('rh_'))        return 'RECIBO_HONORARIOS';
    if (n.includes('nota') && n.includes('cred'))            return 'NOTA_CREDITO';
    if (n.includes('nota') && n.includes('deb'))             return 'NOTA_DEBITO';
    return 'FACTURA';
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  Create New Comprobante
  // ─────────────────────────────────────────────────────────────────────────
  const handleNewSubmit = async () => {
    if (!newDesc.trim() || !newFecha) return toast.error('Descripción y fecha requeridas');
    setSubmitting(true);
    try {
      const firstFile = pendingFiles[0];
      const body: Record<string, unknown> = {
        tipoDoc:     newTipoDoc ?? undefined,
        descripcion: newDesc.trim(),
        fecha:       newFecha,
        moneda:      newMoneda,
        montoTotal:  computedTotal > 0 ? parseFloat(computedTotal.toFixed(2)) : undefined,
        notas:       [selectedCustomer ? `Cliente: ${selectedCustomer.displayName}${selectedCustomer.ruc ? ` (RUC ${selectedCustomer.ruc})` : ''}` : null, newNotas.trim() || null].filter(Boolean).join('\n') || null,
        purchaseOrderId: newPoSel?.id ?? null,
      };
      if (firstFile) {
        body.archivo = {
          docType: firstFile.docType,
          nombreArchivo: firstFile.file.name,
          mimeType: firstFile.file.type,
          dataBase64: firstFile.b64,
          tamanoBytes: firstFile.size,
        };
      }

      const res = await api.post('/v1/comprobantes', body);
      const newId = res.data.data.id;

      // Upload remaining files sequentially
      for (const pf of pendingFiles.slice(1)) {
        await api.post(`/v1/comprobantes/${newId}/archivos`, {
          docType: pf.docType,
          nombreArchivo: pf.file.name,
          mimeType: pf.file.type,
          dataBase64: pf.b64,
          tamanoBytes: pf.size,
        });
      }

      toast.success('Comprobante registrado');
      setNewModal(false);
      resetNewModal();
      await loadItems();
      await loadStats();
      setSelectedId(newId);
    } catch {
      toast.error('Error al crear comprobante');
    } finally {
      setSubmitting(false);
    }
  };

  const resetNewModal = () => {
    setNewTipoDoc(null); setNewDesc(''); setNewFecha(new Date().toISOString().slice(0, 10));
    setNewMoneda('PEN'); setNewNotas(''); setNewPoSearch(''); setNewPoSel(null);
    setPendingFiles([]); setPoOptions([]);
    setNewCustomerMode(null); setCustomerSearch(''); setCustomerOptions([]); setSelectedCustomer(null);
    setRucSearch(''); setRucResult(null);
    setProveedorMode(null); setProveedorSearch(''); setProveedorOptions([]); setSelectedProveedor(null);
    setProvRucSearch(''); setProvRucResult(null);
    setLineItems([]); setProductSearch(''); setProductOptions([]); setMasterDiscountPct(0);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  Add Archivo to Existing Comprobante
  // ─────────────────────────────────────────────────────────────────────────
  const handleAddArchivoFile = async (fileList: FileList | null) => {
    if (!fileList?.[0]) return;
    const f   = fileList[0];
    const b64 = await fileToB64(f);
    setAddArchFile({ file: f, b64, size: f.size, docType: guessDocType(f.name) });
    setAddArchDocType(guessDocType(f.name));
  };

  const handleAddArchivoSubmit = async () => {
    if (!addArchFile || !selectedId) return;
    setAddArchLoading(true);
    try {
      await api.post(`/v1/comprobantes/${selectedId}/archivos`, {
        docType: addArchDocType,
        nombreArchivo: addArchFile.file.name,
        mimeType: addArchFile.file.type,
        dataBase64: addArchFile.b64,
        tamanoBytes: addArchFile.size,
      });
      toast.success('Documento subido');
      setAddArchModal(false);
      setAddArchFile(null);
      await loadDetail(selectedId);
      await loadStats();
    } catch {
      toast.error('Error al subir documento');
    } finally {
      setAddArchLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  Status Actions
  // ─────────────────────────────────────────────────────────────────────────
  const updateEstado = async (id: string, estado: Estado) => {
    try {
      await api.patch(`/v1/comprobantes/${id}`, { estado });
      toast.success(`Estado → ${ESTADO_CONFIG[estado].label}`);
      await loadItems();
      await loadStats();
      if (selectedId === id) await loadDetail(id);
    } catch { toast.error('Error al actualizar estado'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este comprobante y todos sus archivos?')) return;
    try {
      await api.delete(`/v1/comprobantes/${id}`);
      toast.success('Comprobante eliminado');
      if (selectedId === id) { setSelectedId(null); setDetail(null); }
      await loadItems();
      await loadStats();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleDeleteArchivo = async (archivoId: string) => {
    if (!selectedId) return;
    if (!window.confirm('¿Eliminar este archivo?')) return;
    try {
      await api.delete(`/v1/comprobantes/${selectedId}/archivos/${archivoId}`);
      toast.success('Archivo eliminado');
      await loadDetail(selectedId);
    } catch { toast.error('Error al eliminar archivo'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  File Viewer
  // ─────────────────────────────────────────────────────────────────────────
  const openViewer = async (archivoId: string, mime: string, nombre: string) => {
    setViewer({ archivoId, mime, nombre });
    setViewerData(null);
    setViewerLoad(true);
    try {
      const res = await api.get(`/v1/comprobantes/archivos/${archivoId}/data`);
      setViewerData(res.data.data.dataBase64);
    } catch { toast.error('Error al cargar archivo'); setViewer(null); }
    finally { setViewerLoad(false); }
  };

  // ── Line items computed totals ───────────────────────────────────────────
  const lineSubtotals       = lineItems.map(li => li.qty * li.unitPrice * (1 - li.discountPct / 100));
  const subtotalBeforeMDisc = lineSubtotals.reduce((a, b) => a + b, 0);
  const masterDiscAmt       = subtotalBeforeMDisc * (masterDiscountPct / 100);
  const igvableBase         = lineItems.reduce((sum, li, i) => {
    const base = lineSubtotals[i] * (1 - masterDiscountPct / 100);
    return li.taxClass !== 'EXONERADO' && li.taxClass !== 'INAFECTO' ? sum + base : sum;
  }, 0);
  const nonIgvBase          = lineItems.reduce((sum, li, i) => {
    const base = lineSubtotals[i] * (1 - masterDiscountPct / 100);
    return (li.taxClass === 'EXONERADO' || li.taxClass === 'INAFECTO') ? sum + base : sum;
  }, 0);
  const igvAmt              = igvableBase * 0.18;
  const computedTotal       = igvableBase + igvAmt + nonIgvBase;

  const totalPages = Math.ceil(totalCount / LIMIT);

  // ─────────────────────────────────────────────────────────────────────────
  //  JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comprobantes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registro de documentos sustento — facturas, boletas, OC, guías y más
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-2" onClick={() => setMassUploadModal(true)}>
            <Upload size={16} />
            Subir masivo
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setNewModal(true)}>
            <Plus size={16} />
            Nuevo comprobante
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total',       value: stats.total,       cls: 'text-gray-900'  },
            { label: 'Pendientes',  value: stats.pendientes,  cls: 'text-amber-600' },
            { label: 'Validados',   value: stats.validados,   cls: 'text-green-600' },
            { label: 'Este mes',    value: stats.mesActual,   cls: 'text-blue-600'  },
            { label: 'Monto total', value: fmtMoney(stats.montoTotalPen), cls: 'text-gray-900' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-bold mt-0.5 ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 w-full text-sm"
            placeholder="Buscar por número, emisor, descripción…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input text-sm w-36" value={filterEstado}
          onChange={e => { setFilterEstado(e.target.value as Estado | ''); setPage(1); }}>
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_CONFIG) as Estado[]).map(k => (
            <option key={k} value={k}>{ESTADO_CONFIG[k].label}</option>
          ))}
        </select>
        <select className="input text-sm w-44" value={filterDoc}
          onChange={e => { setFilterDoc(e.target.value as DocType | ''); setPage(1); }}>
          <option value="">Todos los tipos</option>
          {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map(k => (
            <option key={k} value={k}>{DOC_TYPE_LABELS[k]}</option>
          ))}
        </select>
        <select className="input text-sm w-36" value={filterSource}
          onChange={e => { setFilterSource(e.target.value as 'EMAIL' | ''); setPage(1); }}>
          <option value="">Todos los orígenes</option>
          <option value="EMAIL">📧 Email</option>
        </select>
        <input type="date" className="input text-sm" value={fechaDesde}
          onChange={e => { setFechaDesde(e.target.value); setPage(1); }} />
        <span className="text-gray-400 text-xs">—</span>
        <input type="date" className="input text-sm" value={fechaHasta}
          onChange={e => { setFechaHasta(e.target.value); setPage(1); }} />
        {(search || filterEstado || filterDoc || filterSource || fechaDesde || fechaHasta) && (
          <button className="btn-secondary text-xs px-2 py-1.5"
            onClick={() => { setSearch(''); setFilterEstado(''); setFilterDoc(''); setFilterSource(''); setFechaDesde(''); setFechaHasta(''); setPage(1); }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Content: Table + Detail Panel */}
      <div className={`flex gap-4 items-start ${selectedId ? '' : ''}`}>

        {/* Table */}
        <div className={`flex-1 min-w-0 bg-white rounded-xl border border-gray-200 overflow-hidden`}>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Cargando…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <FileText size={40} className="mb-3 opacity-30" />
              <p className="font-medium text-gray-500">Sin comprobantes</p>
              <p className="text-sm mt-1">Crea el primero o ajusta los filtros</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Descripción</th>
                  <th className="text-left px-4 py-3">Documentos</th>
                  <th className="text-left px-4 py-3">Emisor</th>
                  <th className="text-right px-4 py-3">Monto</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const mainArchivo = item.archivos[0];
                  const emisor = mainArchivo?.emisorNombre ?? mainArchivo?.emisorRuc ?? '—';
                  const isSelected = selectedId === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(isSelected ? null : item.id)}
                      className={`border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50
                        ${isSelected ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''}`}
                    >
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        <div>{fmtDate(item.archivos[0]?.fechaEmision ?? item.fecha)}</div>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          {item.tipoDoc && <DocTypeBadge type={item.tipoDoc} />}
                          {item.source === 'EMAIL' && (
                            <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-600" title={item.senderEmail ?? 'Email'}>
                              <Mail size={10} />
                              Email
                            </span>
                          )}
                          <p className="font-medium text-gray-900 truncate">{item.descripcion}</p>
                        </div>
                        {item.purchaseOrder && (
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            <ClipboardList size={11} />
                            {item.purchaseOrder.poNumber}
                          </p>
                        )}
                        {item.source === 'EMAIL' && item.senderEmail && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Mail size={10} />
                            {item.senderEmail}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.archivos.slice(0, 3).map(a => (
                            <button
                              key={a.id}
                              title={`Ver ${a.nombreArchivo}`}
                              onClick={e => { e.stopPropagation(); openViewer(a.id, a.mimeType, a.nombreArchivo); }}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full hover:ring-2 hover:ring-offset-1 hover:ring-brand-400 transition-all cursor-pointer"
                              style={{ background: 'inherit' }}
                            >
                              <DocTypeBadge type={a.docType} />
                              <Eye size={10} className="text-gray-400 -ml-1" />
                            </button>
                          ))}
                          {item.archivos.length > 3 && (
                            <span className="text-xs text-gray-400">+{item.archivos.length - 3}</span>
                          )}
                          {item.archivos.length === 0 && (
                            <span className="text-xs text-gray-300 italic">Sin archivos</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{emisor}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                        {fmtMoney(
                          item.montoTotal ?? (item.archivos[0]?.total as number | null) ?? null,
                          (item.archivos[0]?.monedaDoc ?? item.moneda) as string,
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <EstadoBadge estado={item.estado} />
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight size={16} className={`text-gray-300 transition-transform ${isSelected ? 'rotate-90 text-brand-500' : ''}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
              <span className="text-gray-500">{totalCount} comprobantes</span>
              <div className="flex items-center gap-2">
                <button className="btn-secondary py-1 px-2 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
                <span className="text-gray-500">{page} / {totalPages}</span>
                <button className="btn-secondary py-1 px-2 text-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente ›</button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedId && (
          <div className="w-96 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col max-h-[calc(100vh-220px)] sticky top-0">
            {detailLoad ? (
              <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 size={20} className="animate-spin mr-2" /> Cargando…
              </div>
            ) : detail ? (
              <>
                {/* Panel Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <FileCheck size={18} className="text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{detail.descripcion}</p>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Calendar size={11} /> {fmtDate(detail.fecha)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <EstadoBadge estado={detail.estado} />
                    <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 p-1">
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {/* Info */}
                  <div className="px-4 py-3 space-y-1.5 text-xs border-b border-gray-100">
                    {detail.montoTotal != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 flex items-center gap-1"><DollarSign size={11}/> Monto</span>
                        <span className="font-semibold text-gray-900">{fmtMoney(detail.montoTotal, detail.moneda)}</span>
                      </div>
                    )}
                    {detail.purchaseOrder && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 flex items-center gap-1"><ClipboardList size={11}/> OC</span>
                        <span className="font-medium text-blue-600">{detail.purchaseOrder.poNumber}</span>
                      </div>
                    )}
                    {detail.consolidacionRef && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 flex items-center gap-1"><Link2 size={11}/> Consolidación</span>
                        <span className="font-medium text-purple-600">{detail.consolidacionRef}</span>
                      </div>
                    )}
                    {detail.notas && (
                      <div className="mt-1 p-2 bg-gray-50 rounded text-gray-600 text-xs">{detail.notas}</div>
                    )}
                  </div>

                  {/* Archivos */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1">
                        <Paperclip size={12}/> Documentos ({detail.archivos.length})
                      </h3>
                      <button
                        className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium"
                        onClick={() => setAddArchModal(true)}
                      >
                        <Plus size={12}/> Agregar
                      </button>
                    </div>

                    {detail.archivos.length === 0 ? (
                      <button
                        className="w-full border-2 border-dashed border-gray-200 rounded-lg py-6 text-center text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors text-sm"
                        onClick={() => setAddArchModal(true)}
                      >
                        <Upload size={20} className="mx-auto mb-1" />
                        Subir primer documento
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {detail.archivos.map(arch => (
                          <div key={arch.id} className="rounded-lg border border-gray-100 p-3 hover:border-gray-200 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <DocTypeBadge type={arch.docType} />
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${arch.archivoTipo === 'XML' ? 'bg-purple-50 text-purple-600' : arch.archivoTipo === 'IMAGEN' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                                    {arch.archivoTipo}
                                  </span>
                                </div>
                                {arch.numero && (
                                  <p className="text-xs font-mono font-semibold text-gray-800">{arch.numero}</p>
                                )}
                                {arch.emisorNombre && (
                                  <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                                    <Building2 size={10}/> {arch.emisorNombre}
                                  </p>
                                )}
                                {arch.emisorRuc && !arch.emisorNombre && (
                                  <p className="text-xs text-gray-500">RUC {arch.emisorRuc}</p>
                                )}
                                {arch.fechaEmision && (
                                  <p className="text-xs text-gray-400">{fmtDate(arch.fechaEmision)}</p>
                                )}
                                {arch.total != null && (
                                  <p className="text-xs font-semibold text-gray-700 mt-0.5">{fmtMoney(arch.total, arch.monedaDoc ?? 'PEN')}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  title="Ver archivo"
                                  className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                                  onClick={() => openViewer(arch.id, arch.mimeType, arch.nombreArchivo)}
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  title="Eliminar archivo"
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  onClick={() => handleDeleteArchivo(arch.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-300 mt-1.5 truncate">{arch.nombreArchivo} · {fmtBytes(arch.tamanoBytes)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              {/* Panel Actions */}
                <div className="border-t border-gray-100 px-4 py-3 space-y-2.5">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Estado</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(ESTADO_CONFIG) as Estado[]).map(e => {
                        const { label, cls, icon: Icon } = ESTADO_CONFIG[e];
                        const isActive = detail.estado === e;
                        return (
                          <button
                            key={e}
                            disabled={isActive}
                            onClick={() => !isActive && updateEstado(detail.id, e)}
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full transition-all ${
                              isActive
                                ? `${cls} ring-2 ring-offset-1 ring-current`
                                : 'border border-gray-200 text-gray-500 bg-white hover:border-gray-300 hover:text-gray-700'
                            }`}
                          >
                            <Icon size={11} />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    className="w-full text-xs py-1.5 flex items-center justify-center gap-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    onClick={() => handleDelete(detail.id)}
                  >
                    <Trash2 size={13} /> Eliminar comprobante
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* ─── NEW COMPROBANTE MODAL ─────────────────────────────────────────── */}
      {newModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { if (!submitting) { setNewModal(false); resetNewModal(); } }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-brand-600" />
                <h2 className="font-semibold text-gray-900">Nuevo comprobante</h2>
              </div>
              <button onClick={() => { setNewModal(false); resetNewModal(); }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Tipo de comprobante — segmented selector */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2">Tipo de comprobante</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['FACTURA',       'Factura'],
                    ['BOLETA',        'Boleta'],
                    ['NOTA_CREDITO',  'Nota de Crédito'],
                    ['NOTA_DEBITO',   'Nota de Débito'],
                    ['GUIA_REMISION', 'Guía de Remisión'],
                    ['ORDEN_COMPRA',  'Orden de Compra'],
                    ['OTRO',          'Otro'],
                  ] as [DocType, string][]).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setNewTipoDoc(prev => prev === val ? null : val);
                        // Update all already-picked pending files
                        setPendingFiles(prev => prev.map(pf => ({ ...pf, docType: val })));
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        newTipoDoc === val
                          ? `${DOC_TYPE_COLORS[val]} border-transparent ring-2 ring-offset-1 ring-brand-400`
                          : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer selector */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2 flex items-center gap-1">
                  <Users size={11} /> Cliente (opcional)
                </label>
                {selectedCustomer ? (
                  <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <Building2 size={14} className="text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-medium text-blue-700">{selectedCustomer.displayName}</span>
                      {selectedCustomer.ruc && <span className="text-blue-500 ml-2 text-xs font-mono">RUC {selectedCustomer.ruc}</span>}
                    </div>
                    <button type="button" onClick={() => { setSelectedCustomer(null); setNewCustomerMode(null); }} className="text-blue-400 hover:text-blue-600"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setNewCustomerMode(m => m === 'existing' ? null : 'existing')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${newCustomerMode === 'existing' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                        Cliente existente
                      </button>
                      <button type="button" onClick={() => setNewCustomerMode(m => m === 'ruc' ? null : 'ruc')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${newCustomerMode === 'ruc' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                        Nuevo por RUC
                      </button>
                    </div>
                    {newCustomerMode === 'existing' && (
                      <div className="relative">
                        <input className="input w-full" placeholder="Buscar por nombre de cliente…"
                          value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                        {customerOptions.length > 0 && (
                          <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-auto">
                            {customerOptions.map((c: any) => (
                              <button key={c.id} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => { setSelectedCustomer({ id: c.id, displayName: c.displayName, ruc: c.ruc }); setCustomerSearch(''); setCustomerOptions([]); }}>
                                <Building2 size={12} className="text-gray-400 flex-shrink-0" />
                                <span className="font-medium truncate">{c.displayName}</span>
                                {c.ruc && <span className="text-gray-400 text-xs font-mono flex-shrink-0">{c.ruc}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {newCustomerMode === 'ruc' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input className="input flex-1" placeholder="RUC (11 dígitos)" maxLength={11}
                            value={rucSearch} onChange={e => setRucSearch(e.target.value.replace(/\D/g, ''))} />
                          <button type="button" className="btn-secondary text-xs px-3 flex items-center gap-1" disabled={rucSearch.length !== 11 || rucLoading}
                            onClick={async () => {
                              setRucLoading(true);
                              try {
                                const res = await api.get(`/v1/lookup/ruc?n=${rucSearch}`);
                                const d = res.data.data;
                                setRucResult({ ruc: rucSearch, nombre: d.razonSocial ?? d.nombre ?? rucSearch });
                              } catch { toast.error('RUC no encontrado'); } finally { setRucLoading(false); }
                            }}>
                            {rucLoading ? <Loader2 size={12} className="animate-spin" /> : 'Buscar'}
                          </button>
                        </div>
                        {rucResult && (
                          <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg text-sm">
                            <Building2 size={14} className="text-green-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-green-700 truncate block">{rucResult.nombre}</span>
                              <span className="text-green-500 text-xs font-mono">RUC {rucResult.ruc}</span>
                            </div>
                            <button type="button" className="btn-primary text-xs py-1 px-2.5 flex-shrink-0" onClick={() => {
                              setSelectedCustomer({ id: null, displayName: rucResult!.nombre, ruc: rucResult!.ruc });
                              setRucResult(null); setRucSearch('');
                            }}>Usar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Proveedor selector */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2 flex items-center gap-1">
                  <Truck size={11} /> Proveedor / Emisor (opcional)
                </label>
                {selectedProveedor ? (
                  <div className="flex items-center gap-2 p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                    <Truck size={14} className="text-orange-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-medium text-orange-700">{selectedProveedor.displayName}</span>
                      {selectedProveedor.ruc && <span className="text-orange-500 ml-2 text-xs font-mono">RUC {selectedProveedor.ruc}</span>}
                    </div>
                    <button type="button" onClick={() => { setSelectedProveedor(null); setProveedorMode(null); }} className="text-orange-400 hover:text-orange-600"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setProveedorMode(m => m === 'existing' ? null : 'existing')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${proveedorMode === 'existing' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-orange-300'}`}>
                        Proveedor existente
                      </button>
                      <button type="button" onClick={() => setProveedorMode(m => m === 'ruc' ? null : 'ruc')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${proveedorMode === 'ruc' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-orange-300'}`}>
                        Nuevo por RUC
                      </button>
                    </div>
                    {proveedorMode === 'existing' && (
                      <div className="relative">
                        <input className="input w-full" placeholder="Buscar por nombre de proveedor…"
                          value={proveedorSearch} onChange={e => setProveedorSearch(e.target.value)} />
                        {proveedorOptions.length > 0 && (
                          <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-auto">
                            {proveedorOptions.map((p: any) => (
                              <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => { setSelectedProveedor({ id: p.id, displayName: p.displayName, ruc: p.ruc }); setProveedorSearch(''); setProveedorOptions([]); }}>
                                <Truck size={12} className="text-gray-400 flex-shrink-0" />
                                <span className="font-medium truncate">{p.displayName}</span>
                                {p.ruc && <span className="text-gray-400 text-xs font-mono flex-shrink-0">{p.ruc}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {proveedorMode === 'ruc' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input className="input flex-1" placeholder="RUC del proveedor (11 dígitos)" maxLength={11}
                            value={provRucSearch} onChange={e => setProvRucSearch(e.target.value.replace(/\D/g, ''))} />
                          <button type="button" className="btn-secondary text-xs px-3 flex items-center gap-1" disabled={provRucSearch.length !== 11 || provRucLoading}
                            onClick={async () => {
                              setProvRucLoading(true);
                              try {
                                const res = await api.get(`/v1/lookup/ruc?n=${provRucSearch}`);
                                const d = res.data.data;
                                setProvRucResult({ ruc: provRucSearch, nombre: d.razonSocial ?? d.nombre ?? provRucSearch });
                              } catch { toast.error('RUC no encontrado'); } finally { setProvRucLoading(false); }
                            }}>
                            {provRucLoading ? <Loader2 size={12} className="animate-spin" /> : 'Buscar'}
                          </button>
                        </div>
                        {provRucResult && (
                          <div className="flex items-center gap-2 p-2.5 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                            <Truck size={14} className="text-orange-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-orange-700 truncate block">{provRucResult.nombre}</span>
                              <span className="text-orange-500 text-xs font-mono">RUC {provRucResult.ruc}</span>
                            </div>
                            <button type="button" className="btn-primary text-xs py-1 px-2.5 flex-shrink-0" onClick={() => {
                              setSelectedProveedor({ id: null, displayName: provRucResult!.nombre, ruc: provRucResult!.ruc });
                              setProvRucResult(null); setProvRucSearch('');
                            }}>Usar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Basic fields */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Descripción *</label>
                <input className="input w-full" placeholder="Ej: Compra insumos harina San Jorge junio 2024"
                  value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Fecha *</label>
                  <input type="date" className="input w-full" value={newFecha} onChange={e => setNewFecha(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Moneda</label>
                  <select className="input w-full" value={newMoneda} onChange={e => setNewMoneda(e.target.value)}>
                    <option value="PEN">PEN — Soles</option>
                    <option value="USD">USD — Dólares</option>
                  </select>
                </div>
              </div>

              {/* PO Link */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  <ClipboardList size={11} className="inline mr-1" />
                  Vincular a Orden de Compra (opcional)
                </label>
                {newPoSel ? (
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <ClipboardList size={14} className="text-amber-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-medium text-amber-700">{newPoSel.poNumber}</span>
                      {newPoSel.supplier && <span className="text-amber-600 ml-2 text-xs">{newPoSel.supplier.businessName}</span>}
                    </div>
                    <button onClick={() => { setNewPoSel(null); setNewPoSearch(''); }} className="text-amber-400 hover:text-amber-600">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input className="input w-full" placeholder="Buscar número de OC…"
                      value={newPoSearch} onChange={e => setNewPoSearch(e.target.value)} />
                    {poOptions.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-auto">
                        {poOptions.map(po => (
                          <button key={po.id} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                            onClick={() => { setNewPoSel(po); setNewPoSearch(''); setPoOptions([]); }}>
                            <ClipboardList size={12} className="text-gray-400" />
                            <span className="font-medium">{po.poNumber}</span>
                            {po.supplier && <span className="text-gray-400 text-xs">{po.supplier.businessName}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Notas</label>
                <textarea className="input w-full resize-none" rows={2} placeholder="Observaciones opcionales…"
                  value={newNotas} onChange={e => setNewNotas(e.target.value)} />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => { setNewModal(false); resetNewModal(); }} disabled={submitting}>Cancelar</button>
              <button className="btn-primary flex items-center gap-2" onClick={handleNewSubmit} disabled={submitting || !newDesc.trim()}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Guardar comprobante
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD ARCHIVO MODAL ─────────────────────────────────────────────── */}
      {addArchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => { if (!addArchLoading) { setAddArchModal(false); setAddArchFile(null); } }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Upload size={16} className="text-brand-600" /> Agregar documento
              </h3>
              <button onClick={() => { setAddArchModal(false); setAddArchFile(null); }} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Tipo de documento</label>
              <select className="input w-full" value={addArchDocType} onChange={e => setAddArchDocType(e.target.value as DocType)}>
                {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map(k => (
                  <option key={k} value={k}>{DOC_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>

            <div
              className="border-2 border-dashed border-gray-200 rounded-xl py-8 text-center hover:border-brand-300 transition-colors cursor-pointer"
              onClick={() => addArchRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleAddArchivoFile(e.dataTransfer.files); }}
            >
              {addArchFile ? (
                <div className="space-y-1">
                  <FileText size={24} className="mx-auto text-brand-500" />
                  <p className="text-sm font-medium text-gray-700">{addArchFile.file.name}</p>
                  <p className="text-xs text-gray-400">{fmtBytes(addArchFile.size)}</p>
                </div>
              ) : (
                <>
                  <Upload size={20} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Elige o arrastra un archivo</p>
                  <p className="text-xs text-gray-400">PDF · XML · JPG · PNG</p>
                </>
              )}
              <input ref={addArchRef} type="file" className="hidden"
                accept=".pdf,.xml,.jpg,.jpeg,.png,.heic,.webp"
                onChange={e => handleAddArchivoFile(e.target.files)} />
            </div>

            <div className="flex gap-2">
              <button className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={!addArchFile || addArchLoading} onClick={handleAddArchivoSubmit}>
                {addArchLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Subir documento
              </button>
              <button className="btn-secondary" disabled={addArchLoading}
                onClick={() => { setAddArchModal(false); setAddArchFile(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FILE VIEWER MODAL ─────────────────────────────────────────────── */}
      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setViewer(null); setViewerData(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700 flex items-center gap-2 truncate">
                <Eye size={14} className="text-brand-500 flex-shrink-0" />
                {viewer.nombre}
              </p>
              <button onClick={() => { setViewer(null); setViewerData(null); }} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-64">
              {viewerLoad ? (
                <div className="text-center text-gray-400">
                  <Loader2 size={32} className="animate-spin mx-auto mb-3" />
                  <p className="text-sm">Cargando archivo…</p>
                </div>
              ) : viewerData ? (
                viewer.mime === 'application/pdf' ? (
                  <object
                    data={`data:application/pdf;base64,${viewerData}`}
                    type="application/pdf"
                    className="w-full rounded"
                    style={{ height: '70vh' }}
                  >
                    <p className="text-gray-500 text-sm text-center">
                      Tu navegador no puede mostrar el PDF.{' '}
                      <a
                        href={`data:application/pdf;base64,${viewerData}`}
                        download={viewer.nombre}
                        className="text-brand-600 underline"
                      >
                        Descargar
                      </a>
                    </p>
                  </object>
                ) : viewer.mime.startsWith('image/') ? (
                  <img
                    src={`data:${viewer.mime};base64,${viewerData}`}
                    alt={viewer.nombre}
                    className="max-w-full max-h-[65vh] rounded shadow object-contain"
                  />
                ) : viewer.mime.includes('xml') ? (
                  <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-4 overflow-auto w-full max-h-[65vh] font-mono">
                    {Buffer_atob(viewerData)}
                  </pre>
                ) : (
                  <p className="text-gray-400 text-sm">Tipo de archivo no previsualizable.</p>
                )
              ) : null}
            </div>
            {viewerData && (
              <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                <a
                  href={`data:${viewer.mime};base64,${viewerData}`}
                  download={viewer.nombre}
                  className="btn-secondary text-xs flex items-center gap-2"
                >
                  <Download size={13} /> Descargar
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Browser-safe base64 decode (for XML display)
function Buffer_atob(b64: string): string {
  try { return atob(b64); } catch { return b64; }
}
