#!/usr/bin/env python3
"""
Comprobantes improvements:
1. Add proveedor (supplier) picker alongside the existing client picker
2. Add "Subir masivo" button + bulk upload modal (drag & drop multiple files)
"""
path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Comprobantes.tsx'
with open(path) as f:
    src = f.read()

# ── 1. Add Truck icon if not already imported ──────────────────────────────
# Truck is already imported per the existing imports check

# ── 2. Add proveedor state alongside customer state ────────────────────────
OLD_CUST_STATE = """  // ── Customer state ────────────────────────────────────────────────────
  const [newCustomerMode,  setNewCustomerMode]  = useState<'existing' | 'ruc' | null>(null);
  const [customerSearch,   setCustomerSearch]   = useState('');
  const [customerOptions,  setCustomerOptions]  = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string | null; displayName: string; ruc?: string } | null>(null);
  const [rucSearch,        setRucSearch]        = useState('');
  const [rucLoading,       setRucLoading]       = useState(false);
  const [rucResult,        setRucResult]        = useState<{ ruc: string; nombre: string } | null>(null);"""

NEW_CUST_STATE = """  // ── Customer state ────────────────────────────────────────────────────
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
  const massFileRef = useRef<HTMLInputElement>(null);"""

src = src.replace(OLD_CUST_STATE, NEW_CUST_STATE)

# ── 3. Add proveedor search to customer search useEffect ───────────────────
OLD_CUST_EFFECT = """  // Customer search typeahead
  useEffect(() => {"""

# Find the customer search effect and add proveedor search next to it
# The customer search effect is probably already there. Let's find it and add proveedor after.
# First let's find the actual customer search effect
import re
CUST_EFFECT_PATTERN = r"(  // Customer search typeahead\n  useEffect\(\(\) => \{[^}]+\}, \[customerSearch\]\);)"
match = re.search(CUST_EFFECT_PATTERN, src, re.DOTALL)
if match:
    old_effect = match.group(1)
    new_effect = old_effect + """

  // Proveedor search typeahead
  useEffect(() => {
    if (proveedorSearch.length < 2) { setProveedorOptions([]); return; }
    const t = setTimeout(async () => {
      try {
        // Search from customers list (suppliers can be registered as customers too)
        // Also search procurement suppliers
        const [custRes, suppRes] = await Promise.allSettled([
          api.get('/v1/customers/', { params: { search: proveedorSearch, limit: 6 } }),
          api.get('/v1/procurement/suppliers', { params: { search: proveedorSearch, limit: 6 } }).catch(() => ({ data: { data: [] } })),
        ]);
        const custs = custRes.status === 'fulfilled' ? (custRes.value.data.data ?? []).map((c: any) => ({ id: c.id, displayName: c.displayName ?? c.businessName, ruc: c.docNumber ?? c.ruc, source: 'customer' })) : [];
        const supps = suppRes.status === 'fulfilled' ? (suppRes.value.data.data ?? []).map((s: any) => ({ id: s.id, displayName: s.businessName ?? s.name, ruc: s.ruc ?? s.docNumber, source: 'supplier' })) : [];
        const merged = [...supps, ...custs.filter(c => !supps.find((s:any) => s.ruc === c.ruc))].slice(0, 8);
        setProveedorOptions(merged);
      } catch { setProveedorOptions([]); }
    }, 280);
    return () => clearTimeout(t);
  }, [proveedorSearch]);"""
    src = src.replace(old_effect, new_effect)
else:
    # Add a simpler proveedor search effect after the customer state block
    src = src.replace(
        "  // ── Line items state ──────────────────────────────────────────────────",
        """  // Proveedor search typeahead
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

  // ── Line items state ──────────────────────────────────────────────────""")

# ── 4. Reset proveedor state in resetNewModal ──────────────────────────────
OLD_RESET = """  const resetNewModal = () => {
    setNewTipoDoc(null); setNewDesc(''); setNewFecha(new Date().toISOString().slice(0, 10));
    setNewMoneda('PEN'); setNewNotas(''); setNewPoSearch(''); setNewPoSel(null);
    setPendingFiles([]); setPoOptions([]);
    setNewCustomerMode(null); setCustomerSearch(''); setCustomerOptions([]); setSelectedCustomer(null);
    setRucSearch(''); setRucResult(null);
    setLineItems([]); setProductSearch(''); setProductOptions([]); setMasterDiscountPct(0);
  };"""

NEW_RESET = """  const resetNewModal = () => {
    setNewTipoDoc(null); setNewDesc(''); setNewFecha(new Date().toISOString().slice(0, 10));
    setNewMoneda('PEN'); setNewNotas(''); setNewPoSearch(''); setNewPoSel(null);
    setPendingFiles([]); setPoOptions([]);
    setNewCustomerMode(null); setCustomerSearch(''); setCustomerOptions([]); setSelectedCustomer(null);
    setRucSearch(''); setRucResult(null);
    setProveedorMode(null); setProveedorSearch(''); setProveedorOptions([]); setSelectedProveedor(null);
    setProvRucSearch(''); setProvRucResult(null);
    setLineItems([]); setProductSearch(''); setProductOptions([]); setMasterDiscountPct(0);
  };"""

src = src.replace(OLD_RESET, NEW_RESET)

# ── 5. Add "Subir masivo" button next to "Nuevo comprobante" ──────────────
OLD_HEADER_BTN = """        <button className="btn-primary flex items-center gap-2" onClick={() => setNewModal(true)}>
          <Plus size={16} />
          Nuevo comprobante
        </button>"""

NEW_HEADER_BTN = """        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-2" onClick={() => setMassUploadModal(true)}>
            <Upload size={16} />
            Subir masivo
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setNewModal(true)}>
            <Plus size={16} />
            Nuevo comprobante
          </button>
        </div>"""

src = src.replace(OLD_HEADER_BTN, NEW_HEADER_BTN)

# ── 6. Insert proveedor picker section into the New Comprobante modal ─────
# Insert after the customer section (after the selectedCustomer block ends)
OLD_AFTER_CUST = """              {/* Basic fields */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Descripción *</label>"""

NEW_AFTER_CUST = """              {/* Proveedor selector */}
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
                            value={provRucSearch} onChange={e => setProvRucSearch(e.target.value.replace(/\\D/g, ''))} />
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
                <label className="text-xs font-medium text-gray-700 block mb-1">Descripción *</label>"""

src = src.replace(OLD_AFTER_CUST, NEW_AFTER_CUST)

# ── 7. Add mass upload modal before the closing return tag ────────────────
# Insert the mass upload modal before the new comprobante modal

OLD_NEW_MODAL_START = """        {/* ── New Comprobante Modal ─────────────────────────────────── */}"""

NEW_MASS_THEN_MODAL = """        {/* ── Mass Upload Modal ──────────────────────────────────────── */}
        {massUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { if (!massUploading) setMassUploadModal(false); }} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Upload size={18} className="text-brand-600" />
                  <h2 className="font-semibold text-gray-900">Subir comprobantes</h2>
                </div>
                <button onClick={() => { setMassUploadModal(false); setMassFiles([]); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                {/* Drag & drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setMassDragActive(true); }}
                  onDragLeave={() => setMassDragActive(false)}
                  onDrop={async e => {
                    e.preventDefault(); setMassDragActive(false);
                    const files = Array.from(e.dataTransfer.files);
                    const pending = await Promise.all(files.map(async f => {
                      const b64 = await new Promise<string>(res => {
                        const reader = new FileReader();
                        reader.onload = () => res((reader.result as string).split(',')[1]);
                        reader.readAsDataURL(f);
                      });
                      return { file: f, b64, size: f.size, docType: ('FACTURA' as DocType) };
                    }));
                    setMassFiles(prev => [...prev, ...pending]);
                  }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${massDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'}`}
                  onClick={() => massFileRef.current?.click()}
                >
                  <Upload size={28} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm font-medium text-gray-600">Arrastra archivos aquí o haz clic</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, XML, JPG, PNG — múltiples archivos</p>
                  <input ref={massFileRef} type="file" multiple accept=".pdf,.xml,.jpg,.jpeg,.png" className="hidden"
                    onChange={async e => {
                      if (!e.target.files) return;
                      const files = Array.from(e.target.files);
                      const pending = await Promise.all(files.map(async f => {
                        const b64 = await new Promise<string>(res => {
                          const reader = new FileReader();
                          reader.onload = () => res((reader.result as string).split(',')[1]);
                          reader.readAsDataURL(f);
                        });
                        return { file: f, b64, size: f.size, docType: ('FACTURA' as DocType) };
                      }));
                      setMassFiles(prev => [...prev, ...pending]);
                      e.target.value = '';
                    }} />
                </div>
                {/* File list */}
                {massFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{massFiles.length} archivo(s) listos para subir</p>
                    {massFiles.map((mf, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                        <FileText size={14} className="text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{mf.file.name}</p>
                          <p className="text-xs text-gray-400">{(mf.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <select value={mf.docType} onChange={e => setMassFiles(prev => prev.map((f, i) => i === idx ? { ...f, docType: e.target.value as DocType } : f))}
                          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
                          {(['FACTURA','BOLETA','GUIA_REMISION','ORDEN_COMPRA','OTRO'] as DocType[]).map(t => (
                            <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                        <button onClick={() => setMassFiles(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">Cada archivo crea un comprobante en estado Pendiente</p>
                <div className="flex gap-2">
                  <button className="btn-secondary text-sm" onClick={() => { setMassUploadModal(false); setMassFiles([]); }} disabled={massUploading}>Cancelar</button>
                  <button className="btn-primary text-sm flex items-center gap-1.5" disabled={massFiles.length === 0 || massUploading}
                    onClick={async () => {
                      setMassUploading(true);
                      let ok = 0; let fail = 0;
                      for (const mf of massFiles) {
                        try {
                          await api.post('/v1/comprobantes', {
                            descripcion: mf.file.name.replace(/\\.[^.]+$/, ''),
                            fecha: new Date().toISOString().slice(0, 10),
                            moneda: 'PEN',
                            tipoDoc: mf.docType,
                            archivos: [{ base64: mf.b64, mimeType: mf.file.type || 'application/pdf', nombreArchivo: mf.file.name, docType: mf.docType }],
                          });
                          ok++;
                        } catch { fail++; }
                      }
                      setMassUploading(false);
                      setMassUploadModal(false);
                      setMassFiles([]);
                      if (ok > 0) { toast.success(`${ok} comprobante(s) subidos`); loadItems(); loadStats(); }
                      if (fail > 0) toast.error(`${fail} archivo(s) fallaron`);
                    }}>
                    {massUploading ? <><Loader2 size={14} className="animate-spin" /> Subiendo...</> : <><Upload size={14} /> Subir {massFiles.length > 0 ? massFiles.length : ''} archivo(s)</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── New Comprobante Modal ─────────────────────────────────── */}"""

src = src.replace(OLD_NEW_MODAL_START, NEW_MASS_THEN_MODAL)

with open(path, 'w') as f:
    f.write(src)

print("Comprobantes proveedor picker + mass upload added")
