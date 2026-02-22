"""
Patch Customers.tsx EditCustomerModal:
1. Add address section (uses CustomerAddress relation)
2. Add contacts section with roles: REP_LEGAL, CONTABILIDAD, OTRO
3. Contact: fullName, role, email, phone, receivesFacturas checkbox
"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Customers.tsx'
with open(path) as f:
    src = f.read()

# ── 1. Add Save, UserPlus to imports ─────────────────────────────────────────
src = src.replace(
    '  Edit2, Trash2, Store, CheckSquare, Square,',
    '  Edit2, Trash2, Store, CheckSquare, Square, Save, UserPlus,'
)

# ── 2. Add contact role labels before FREQ_LABELS ────────────────────────────
if 'CONTACT_ROLES' not in src:
    src = src.replace(
        'const FREQ_LABELS: Record<string, string> = {',
        '''const CONTACT_ROLES = [
  { value: 'REP_LEGAL',    label: 'Representante Legal' },
  { value: 'CONTABILIDAD', label: 'Contabilidad' },
  { value: 'OTRO',         label: 'Otro' },
];

const FREQ_LABELS: Record<string, string> = {'''
    )

# ── 3. Replace only the EditCustomerModal content (form + state) ──────────────
# We keep the function signature, just replace its internals
OLD_FORM_STATE = '''  const [form, setForm] = useState({
    displayName: customer.displayName ?? '',
    email:       customer.email       ?? '',
    phone:       customer.phone       ?? '',
    notes:       customer.notes       ?? '',
    category:    customer.category    ?? '' as string,
    isActive:    customer.isActive    ?? true,
  });

  function handleSubmit() {
    const body: Record<string, any> = {
      displayName: form.displayName.trim(),
      email:       form.email.trim()  || null,
      phone:       form.phone.trim()  || null,
      notes:       form.notes.trim()  || null,
      isActive:    form.isActive,
    };
    if (customer.type === 'B2B' && form.category) body.category = form.category;
    onSave(body);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Editar cliente</h2>
            <p className="text-xs text-gray-400 mt-0.5">{customer.docType} {customer.docNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {customer.type === 'B2B' ? 'Razón social' : 'Nombre'} <span className="text-red-500">*</span>
            </label>
            <input className="input" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
          </div>
          {customer.type === 'B2B' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Categoría</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(CATEGORY_LABELS) as CustomerCategory[]).map(cat => (
                  <button key={cat} type="button" onClick={() => setForm(f => ({ ...f, category: cat }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.category === cat ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                    }`}>{CATEGORY_LABELS[cat]}</button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
              <input className="input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-600">Estado:</span>
            <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${form.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {form.isActive ? 'Activo' : 'Inactivo'}
            </button>
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button className="btn-primary disabled:opacity-50 flex items-center gap-2" disabled={!form.displayName.trim() || isPending} onClick={handleSubmit}>
            {isPending ? <><Loader2 size={14} className="animate-spin" />Guardando...</> : 'Guardar cambios'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );'''

NEW_FORM_STATE = '''  const qc = useQueryClient();
  const [form, setForm] = useState({
    displayName: customer.displayName ?? '',
    email:       customer.email       ?? '',
    phone:       customer.phone       ?? '',
    notes:       customer.notes       ?? '',
    category:    customer.category    ?? '' as string,
    isActive:    customer.isActive    ?? true,
  });

  // ── Address ────────────────────────────────────────────────────────────────
  const existingAddr = (customer.addresses ?? []).find((a: any) => a.isDefault) ?? customer.addresses?.[0] ?? null;
  const [addr, setAddr] = useState({
    id:           existingAddr?.id           ?? null as string | null,
    label:        existingAddr?.label        ?? 'Principal',
    addressLine1: existingAddr?.addressLine1 ?? '',
    addressLine2: existingAddr?.addressLine2 ?? '',
    district:     existingAddr?.district     ?? '',
    province:     existingAddr?.province     ?? 'Lima',
    department:   existingAddr?.department   ?? 'Lima',
    deliveryNotes: existingAddr?.deliveryNotes ?? '',
  });
  const [addrDirty,  setAddrDirty]  = useState(false);
  const [addrSaving, setAddrSaving] = useState(false);

  // ── Contacts ───────────────────────────────────────────────────────────────
  interface CDraft { id: string | null; fullName: string; role: string; email: string; phone: string; receivesFacturas: boolean; _del?: boolean; }
  const [contacts, setContacts] = useState<CDraft[]>(() =>
    (customer.contacts ?? []).map((c: any) => ({
      id: c.id, fullName: c.fullName ?? '', role: c.role ?? 'OTRO',
      email: c.email ?? '', phone: c.phone ?? '',
      receivesFacturas: c.receivesFacturas ?? false,
    }))
  );
  const [ctSaving, setCtSaving] = useState(false);

  function setA(k: string, v: string) { setAddr(a => ({ ...a, [k]: v })); setAddrDirty(true); }
  function addCt() { setContacts(cs => [...cs, { id: null, fullName: '', role: 'OTRO', email: '', phone: '', receivesFacturas: false }]); }
  function updCt(i: number, k: keyof CDraft, v: any) { setContacts(cs => cs.map((c, j) => j === i ? { ...c, [k]: v } : c)); }
  function delCt(i: number) { setContacts(cs => cs.map((c, j) => j === i ? { ...c, _del: true } : c)); }

  async function saveAddr() {
    if (!addr.addressLine1.trim() || !addr.district.trim()) return toast.error('Dirección y distrito requeridos');
    setAddrSaving(true);
    try {
      const payload = { label: addr.label || 'Principal', addressLine1: addr.addressLine1, addressLine2: addr.addressLine2 || undefined, district: addr.district, province: addr.province || 'Lima', department: addr.department || 'Lima', deliveryNotes: addr.deliveryNotes || undefined, isDefault: true };
      if (addr.id) {
        await api.patch(`/v1/customers/${customer.id}/addresses/${addr.id}`, payload);
      } else {
        const res = await api.post(`/v1/customers/${customer.id}/addresses`, payload);
        setAddr(a => ({ ...a, id: res.data.data.id }));
      }
      setAddrDirty(false);
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Dirección guardada');
    } catch { toast.error('Error al guardar dirección'); } finally { setAddrSaving(false); }
  }

  async function saveCts() {
    setCtSaving(true);
    try {
      for (const c of contacts) {
        if (c._del && c.id) { await api.delete(`/v1/customers/${customer.id}/contacts/${c.id}`); continue; }
        if (!c._del && c.fullName.trim()) {
          const p = { fullName: c.fullName, role: c.role, email: c.email || null, phone: c.phone || null, receivesFacturas: c.receivesFacturas };
          if (c.id) await api.patch(`/v1/customers/${customer.id}/contacts/${c.id}`, p);
          else      await api.post(`/v1/customers/${customer.id}/contacts`, p);
        }
      }
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Contactos guardados');
    } catch { toast.error('Error al guardar contactos'); } finally { setCtSaving(false); }
  }

  function handleSubmit() {
    const body: Record<string, any> = {
      displayName: form.displayName.trim(),
      email:       form.email.trim()  || null,
      phone:       form.phone.trim()  || null,
      notes:       form.notes.trim()  || null,
      isActive:    form.isActive,
    };
    if (customer.type === 'B2B' && form.category) body.category = form.category;
    onSave(body);
  }

  const visCts = contacts.filter(c => !c._del);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-gray-900">Editar cliente</h2>
            <p className="text-xs text-gray-400 mt-0.5">{customer.docType} {customer.docNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-6">

          {/* ── Info general ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Información general</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {customer.type === 'B2B' ? 'Razón social' : 'Nombre'} <span className="text-red-500">*</span>
              </label>
              <input className="input" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            {customer.type === 'B2B' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Categoría</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CATEGORY_LABELS) as CustomerCategory[]).map(cat => (
                    <button key={cat} type="button" onClick={() => setForm(f => ({ ...f, category: cat }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        form.category === cat ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                      }`}>{CATEGORY_LABELS[cat]}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                <input className="input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-600">Estado:</span>
              <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${form.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {form.isActive ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          </section>

          {/* ── Dirección principal ──────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <MapPin size={11} /> Dirección principal
              </p>
              {addrDirty && (
                <button type="button" disabled={addrSaving}
                  className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1" onClick={saveAddr}>
                  {addrSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                </button>
              )}
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Calle / Av. <span className="text-red-500">*</span></label>
              <input className="input" placeholder="Av. La Marina 2345" value={addr.addressLine1}
                onChange={e => setA('addressLine1', e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Ofc. / Piso / Referencia</label>
              <input className="input" placeholder="Piso 3, Of. 301" value={addr.addressLine2}
                onChange={e => setA('addressLine2', e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Distrito <span className="text-red-500">*</span></label>
                <input className="input" placeholder="San Miguel" value={addr.district} onChange={e => setA('district', e.target.value)} /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Provincia</label>
                <input className="input" placeholder="Lima" value={addr.province} onChange={e => setA('province', e.target.value)} /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Departamento</label>
                <input className="input" placeholder="Lima" value={addr.department} onChange={e => setA('department', e.target.value)} /></div>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Instrucciones de entrega</label>
              <input className="input" placeholder="Ingresar por muelle trasero…" value={addr.deliveryNotes}
                onChange={e => setA('deliveryNotes', e.target.value)} /></div>
          </section>

          {/* ── Contactos ────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <User size={11} /> Contactos
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1" onClick={addCt}>
                  <UserPlus size={12} /> Agregar
                </button>
                {visCts.some(c => c.fullName.trim()) && (
                  <button type="button" disabled={ctSaving}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1" onClick={saveCts}>
                    {ctSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                  </button>
                )}
              </div>
            </div>
            {visCts.length === 0 && (
              <p className="text-xs text-gray-400 py-4 text-center border-2 border-dashed border-gray-200 rounded-xl">
                Sin contactos — agrega representante legal, contabilidad u otros.
              </p>
            )}
            {contacts.map((c, i) => c._del ? null : (
              <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                    <input className="input" placeholder="Juan Pérez" value={c.fullName}
                      onChange={e => updCt(i, 'fullName', e.target.value)} /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
                    <select className="input" value={c.role} onChange={e => updCt(i, 'role', e.target.value)}>
                      {CONTACT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input className="input" type="email" placeholder="contacto@empresa.com" value={c.email}
                      onChange={e => updCt(i, 'email', e.target.value)} /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                    <input className="input" placeholder="+51 9xx xxx xxx" value={c.phone}
                      onChange={e => updCt(i, 'phone', e.target.value)} /></div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" checked={c.receivesFacturas}
                      onChange={e => updCt(i, 'receivesFacturas', e.target.checked)} />
                    <span className="text-xs text-gray-700">Recibe <strong>facturas / comprobantes</strong> por email</span>
                  </label>
                  <button type="button" onClick={() => delCt(i)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button className="btn-primary disabled:opacity-50 flex items-center gap-2" disabled={!form.displayName.trim() || isPending} onClick={handleSubmit}>
            {isPending ? <><Loader2 size={14} className="animate-spin" />Guardando...</> : 'Guardar cambios'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );'''

if OLD_FORM_STATE in src:
    src = src.replace(OLD_FORM_STATE, NEW_FORM_STATE)
    print("EditCustomerModal replaced successfully")
else:
    print("ERROR: Could not find old modal content to replace")

with open(path, 'w') as f:
    f.write(src)
