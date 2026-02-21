"""
Adds edit-customer functionality to Customers.tsx:
- EditCustomerModal component (edit displayName, email, phone, notes, category, isActive)
- updateCustomer mutation
- Edit (pencil) button on each row
"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Customers.tsx'
with open(path) as f: src = f.read()

# 1. Add edit state + mutation just before the `create` mutation definition
edit_state = '''  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.patch(`/v1/customers/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Cliente actualizado'); setEditingCustomer(null); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? e.response?.data?.error ?? 'Error al actualizar cliente'),
  });

'''

src = src.replace(
    "  const create = useMutation({",
    edit_state + "  const create = useMutation({"
)

# 2. Add Edit button to each row — insert after the existing row Actions column header
# The table has no Actions column yet — we add one
src = src.replace(
    '<th className="px-5 py-3 text-left">Estado</th>',
    '<th className="px-5 py-3 text-left">Estado</th>\n                  <th className="px-5 py-3 text-right">Acciones</th>'
)

# 3. Add edit button cell in the data rows — after the isActive badge cell
src = src.replace(
    '''                        <td className="px-5 py-3">
                          <span className={`badge ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {c.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                      </tr>''',
    '''                        <td className="px-5 py-3">
                          <span className={`badge ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {c.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={e => { e.stopPropagation(); setEditingCustomer(c); }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
                            title="Editar cliente"
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>'''
)

# 4. Add EditCustomerModal before the Sucursal modal closing section
edit_modal = '''
      {/* Edit customer modal */}
      {editingCustomer && (
        <EditCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSave={(body: any) => update.mutate({ id: editingCustomer.id, body })}
          isPending={update.isPending}
        />
      )}
'''

src = src.replace(
    "      {/* Sucursal modal */}",
    edit_modal + "      {/* Sucursal modal */}"
)

# 5. Add EditCustomerModal component before the main Customers() function
edit_component = '''
// ── EditCustomerModal ──────────────────────────────────────────────────────────
function EditCustomerModal({
  customer, onClose, onSave, isPending,
}: {
  customer: any;
  onClose: () => void;
  onSave: (body: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
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
  );
}

'''

src = src.replace(
    "// ── Main component ─────────────────────────────────────────────────────────",
    edit_component + "// ── Main component ─────────────────────────────────────────────────────────"
)

with open(path, 'w') as f: f.write(src)
print("Customers.tsx updated with edit functionality")
