"""
Enhances the Nuevo Comprobante modal with:
1. Customer picker (existing search OR new by RUC)
2. Product line items (catalog search + "Otro" free text)
3. Per-item discount % + master bill discount
4. Auto-calculated subtotal / IGV / total
5. Email info banner: docs@victorsdou.pe
"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Comprobantes.tsx'
with open(path) as f:
    src = f.read()

# ── 1. Add 'Users' to lucide-react imports ──────────────────────────────────
src = src.replace(
    '  ReceiptText, Truck, ArrowUpDown, Info, Mail,',
    '  ReceiptText, Truck, ArrowUpDown, Info, Mail, Users,'
)

# ── 2. Add new state variables after fileInputRef ───────────────────────────
src = src.replace(
    '  const fileInputRef = useRef<HTMLInputElement>(null);',
    '''  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Customer state ────────────────────────────────────────────────────
  const [newCustomerMode,  setNewCustomerMode]  = useState<'existing' | 'ruc' | null>(null);
  const [customerSearch,   setCustomerSearch]   = useState('');
  const [customerOptions,  setCustomerOptions]  = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string | null; displayName: string; ruc?: string } | null>(null);
  const [rucSearch,        setRucSearch]        = useState('');
  const [rucLoading,       setRucLoading]       = useState(false);
  const [rucResult,        setRucResult]        = useState<{ ruc: string; nombre: string } | null>(null);

  // ── Line items state ──────────────────────────────────────────────────
  interface LineItem { id: string; productId: string | null; productName: string; sku: string; qty: number; unitPrice: number; discountPct: number; taxClass: string; }
  const [lineItems,          setLineItems]          = useState<LineItem[]>([]);
  const [productSearch,      setProductSearch]      = useState('');
  const [productOptions,     setProductOptions]     = useState<any[]>([]);
  const [masterDiscountPct,  setMasterDiscountPct]  = useState(0);'''
)

# ── 3. Add customer + product search effects after the PO search effect ──────
src = src.replace(
    '  // ─────────────────────────────────────────────────────────────────────────\n  //  File Handlers',
    '''  // ─────────────────────────────────────────────────────────────────────────
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
  //  File Handlers'''
)

# ── 4. Add computed totals before totalPages ─────────────────────────────────
src = src.replace(
    '  const totalPages = Math.ceil(totalCount / LIMIT);',
    '''  // ── Line items computed totals ───────────────────────────────────────────
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

  const totalPages = Math.ceil(totalCount / LIMIT);'''
)

# ── 5. Extend resetNewModal to clear new state ───────────────────────────────
src = src.replace(
    "  const resetNewModal = () => {\n    setNewTipoDoc(null); setNewDesc(''); setNewFecha(new Date().toISOString().slice(0, 10));\n    setNewMoneda('PEN'); setNewNotas(''); setNewPoSearch(''); setNewPoSel(null);\n    setPendingFiles([]); setPoOptions([]);\n  };",
    "  const resetNewModal = () => {\n    setNewTipoDoc(null); setNewDesc(''); setNewFecha(new Date().toISOString().slice(0, 10));\n    setNewMoneda('PEN'); setNewNotas(''); setNewPoSearch(''); setNewPoSel(null);\n    setPendingFiles([]); setPoOptions([]);\n    setNewCustomerMode(null); setCustomerSearch(''); setCustomerOptions([]); setSelectedCustomer(null);\n    setRucSearch(''); setRucResult(null);\n    setLineItems([]); setProductSearch(''); setProductOptions([]); setMasterDiscountPct(0);\n  };"
)

# ── 6. Extend handleNewSubmit to include montoTotal + customer in notas ──────
src = src.replace(
    "        notas:       newNotas.trim() || null,\n        purchaseOrderId: newPoSel?.id ?? null,",
    "        montoTotal:  computedTotal > 0 ? parseFloat(computedTotal.toFixed(2)) : undefined,\n        notas:       [selectedCustomer ? `Cliente: ${selectedCustomer.displayName}${selectedCustomer.ruc ? ` (RUC ${selectedCustomer.ruc})` : ''}` : null, newNotas.trim() || null].filter(Boolean).join('\\n') || null,\n        purchaseOrderId: newPoSel?.id ?? null,"
)

# ── 7. Add email info banner in the page header ──────────────────────────────
src = src.replace(
    "          Registro de documentos sustento — facturas, boletas, OC, guías y más\n        </p>\n      </div>",
    """          Registro de documentos sustento — facturas, boletas, OC, guías y más
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 w-fit">
          <Mail size={13} className="flex-shrink-0 text-sky-500" />
          <span>Reenvía tus facturas a <strong>docs@victorsdou.pe</strong> para registrarlas automáticamente</span>
        </div>
      </div>"""
)

# ── 8. Add customer section to modal (before Descripción field) ──────────────
src = src.replace(
    '''              {/* Basic fields */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Descripción *</label>''',
    '''              {/* Customer selector */}
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
                            value={rucSearch} onChange={e => setRucSearch(e.target.value.replace(/\\D/g, ''))} />
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

              {/* Basic fields */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Descripción *</label>'''
)

# ── 9. Add products/line items section (insert after PO Link section) ─────────
src = src.replace(
    "              {/* File Upload Area */}",
    '''              {/* Products / Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                    <Tag size={11} /> Productos / Servicios
                  </label>
                  <button type="button" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                    onClick={() => addLineItem(null)}>
                    <Plus size={11} /> Línea libre
                  </button>
                </div>
                {/* Catalog search */}
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input w-full pl-8 text-sm" placeholder="Buscar producto del catálogo y agregar…"
                    value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                  {productOptions.length > 0 && (
                    <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-44 overflow-auto">
                      {productOptions.map((p: any) => (
                        <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => { addLineItem(p); setProductSearch(''); setProductOptions([]); }}>
                          <span className="text-xs text-gray-400 font-mono w-16 flex-shrink-0 truncate">{p.sku}</span>
                          <span className="font-medium flex-1 truncate">{p.name}</span>
                          <span className="text-gray-500 text-xs flex-shrink-0">{fmtMoney(p.basePricePen)}</span>
                        </button>
                      ))}
                      <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-400 italic border-t border-gray-100"
                        onClick={() => { addLineItem(null); setProductSearch(''); setProductOptions([]); }}>
                        + Otro (texto libre)
                      </button>
                    </div>
                  )}
                </div>
                {/* Line items table */}
                {lineItems.length > 0 && (
                  <>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Descripción</th>
                            <th className="text-right px-2 py-1.5 text-gray-500 font-medium w-14">Cant.</th>
                            <th className="text-right px-2 py-1.5 text-gray-500 font-medium w-20">P.Unit.</th>
                            <th className="text-right px-2 py-1.5 text-gray-500 font-medium w-14">Desc%</th>
                            <th className="text-right px-2 py-1.5 text-gray-500 font-medium w-20">Total</th>
                            <th className="w-7 px-1"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {lineItems.map((li, i) => {
                            const lineTotal = li.qty * li.unitPrice * (1 - li.discountPct / 100);
                            return (
                              <tr key={li.id} className="hover:bg-gray-50">
                                <td className="px-2 py-1">
                                  <input className="input text-xs py-0.5 px-2 w-full min-w-0" value={li.productName}
                                    onChange={e => updateLineItem(i, 'productName', e.target.value)}
                                    placeholder="Descripción…" />
                                </td>
                                <td className="px-1 py-1">
                                  <input type="number" min="0.01" step="0.01" className="input text-xs py-0.5 px-1 w-14 text-right"
                                    value={li.qty} onChange={e => updateLineItem(i, 'qty', parseFloat(e.target.value) || 0)} />
                                </td>
                                <td className="px-1 py-1">
                                  <input type="number" min="0" step="0.01" className="input text-xs py-0.5 px-1 w-20 text-right"
                                    value={li.unitPrice} onChange={e => updateLineItem(i, 'unitPrice', parseFloat(e.target.value) || 0)} />
                                </td>
                                <td className="px-1 py-1">
                                  <input type="number" min="0" max="100" step="1" className="input text-xs py-0.5 px-1 w-14 text-right"
                                    value={li.discountPct} onChange={e => updateLineItem(i, 'discountPct', parseFloat(e.target.value) || 0)} />
                                </td>
                                <td className="px-2 py-1 text-right font-medium text-gray-900">{fmtMoney(lineTotal)}</td>
                                <td className="px-1 py-1 text-center">
                                  <button type="button" onClick={() => removeLineItem(i)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Totals summary */}
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-1 text-xs">
                      <div className="flex justify-between text-gray-500">
                        <span>Subtotal bruto</span>
                        <span>{fmtMoney(subtotalBeforeMDisc)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <span>Descuento global</span>
                        <div className="flex items-center gap-1 ml-auto">
                          <input type="number" min="0" max="100" step="0.5"
                            className="input text-xs py-0.5 px-2 w-14 text-right"
                            value={masterDiscountPct}
                            onChange={e => setMasterDiscountPct(parseFloat(e.target.value) || 0)} />
                          <span className="text-gray-500">%</span>
                        </div>
                      </div>
                      {masterDiscountPct > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>Descuento ({masterDiscountPct}%)</span>
                          <span>− {fmtMoney(masterDiscAmt)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-gray-500">
                        <span>Base imponible</span>
                        <span>{fmtMoney(igvableBase)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>IGV (18%)</span>
                        <span>{fmtMoney(igvAmt)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5 mt-0.5 text-sm">
                        <span>Total</span>
                        <span className="text-brand-700">{fmtMoney(computedTotal)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* File Upload Area */}'''
)

with open(path, 'w') as f:
    f.write(src)

print("Comprobantes.tsx updated with enhanced new-comprobante modal")
