"""
Patch Payroll.tsx EmployeeModal:
1. Split fullName into nombres + apellido paterno + apellido materno
2. Add birthDate field (already in schema, just missing from form)
3. Add Seguro dropdown (ESSALUD, EPS, ESSALUD_EPS, SIS, SCTR)
"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Payroll.tsx'
with open(path) as f:
    src = f.read()

# ── 1. Add SEGURO_OPTIONS + extend EMPTY_EMP_FORM ───────────────────────────
src = src.replace(
    'const AFP_OPTIONS   = ["AFP Integra", "Prima AFP", "Profuturo AFP", "Habitat AFP"];',
    '''const AFP_OPTIONS    = ["AFP Integra", "Prima AFP", "Profuturo AFP", "Habitat AFP"];
const SEGURO_OPTIONS = [
  { value: "ESSALUD",      label: "EsSalud (9%)"              },
  { value: "EPS",          label: "EPS (privado)"             },
  { value: "ESSALUD_EPS",  label: "EsSalud + EPS"             },
  { value: "SIS",          label: "SIS"                       },
  { value: "SCTR",         label: "SCTR (trabajo de riesgo)"  },
];'''
)

# ── 2. Extend EMPTY_EMP_FORM with new fields ─────────────────────────────────
src = src.replace(
    '''const EMPTY_EMP_FORM = {
  fullName: "", dni: "", position: "", department: "",
  employmentType: "PLANILLA", contractType: "INDEFINIDO",
  hireDate: "", baseSalary: "", pensionSystem: "AFP", afpName: "",
  cuspp: "", email: "", bankAccount: "", bankName: "",
};''',
    '''const EMPTY_EMP_FORM = {
  fullName: "", nombres: "", apellidoPaterno: "", apellidoMaterno: "",
  dni: "", birthDate: "", position: "", department: "",
  employmentType: "PLANILLA", contractType: "INDEFINIDO",
  hireDate: "", baseSalary: "", pensionSystem: "AFP", afpName: "",
  seguroSalud: "ESSALUD",
  cuspp: "", email: "", bankAccount: "", bankName: "",
};'''
)

# ── 3. Replace name field + add new name fields in the modal form ─────────────
src = src.replace(
    '''          <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
              <input className="input" value={form.fullName} onChange={e => set("fullName", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI *</label>
              <input className="input" value={form.dni} onChange={e => set("dni", e.target.value)} maxLength={8} />
            </div>''',
    '''          <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombres *</label>
              <input className="input" placeholder="Ej: María del Carmen" value={form.nombres}
                onChange={e => { set("nombres", e.target.value); set("fullName", [e.target.value, form.apellidoPaterno, form.apellidoMaterno].filter(Boolean).join(" ")); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Apellido Paterno *</label>
              <input className="input" placeholder="Ej: García" value={form.apellidoPaterno}
                onChange={e => { set("apellidoPaterno", e.target.value); set("fullName", [form.nombres, e.target.value, form.apellidoMaterno].filter(Boolean).join(" ")); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Apellido Materno</label>
              <input className="input" placeholder="Ej: López" value={form.apellidoMaterno}
                onChange={e => { set("apellidoMaterno", e.target.value); set("fullName", [form.nombres, form.apellidoPaterno, e.target.value].filter(Boolean).join(" ")); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI *</label>
              <input className="input" value={form.dni} onChange={e => set("dni", e.target.value)} maxLength={8} />
            </div>'''
)

# ── 4. Add birthDate field after DNI ─────────────────────────────────────────
src = src.replace(
    '''            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI *</label>
              <input className="input" value={form.dni} onChange={e => set("dni", e.target.value)} maxLength={8} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>''',
    '''            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI *</label>
              <input className="input" value={form.dni} onChange={e => set("dni", e.target.value)} maxLength={8} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de nacimiento</label>
              <input className="input" type="date" value={form.birthDate} onChange={e => set("birthDate", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>'''
)

# ── 5. Add Seguro dropdown after the AFP section ─────────────────────────────
src = src.replace(
    '''              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CUSPP (codigo AFP)</label>
                <input className="input" value={form.cuspp} onChange={e => set("cuspp", e.target.value)} placeholder="Opcional" />
              </div>
            </>)}''',
    '''              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CUSPP (codigo AFP)</label>
                <input className="input" value={form.cuspp} onChange={e => set("cuspp", e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Seguro de salud</label>
                <select className="input" value={form.seguroSalud} onChange={e => set("seguroSalud", e.target.value)}>
                  {SEGURO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </>)}'''
)

# ── 6. Update the save button to include new fields ───────────────────────────
src = src.replace(
    "          <button className=\"btn-primary\" onClick={() => onSave({ ...form, baseSalary: parseFloat(form.baseSalary) || 0 })}>",
    "          <button className=\"btn-primary\" onClick={() => onSave({ ...form, baseSalary: parseFloat(form.baseSalary) || 0, birthDate: form.birthDate || undefined })}>",
)

# ── 7. Pre-populate name fields when editing existing employee ─────────────────
# The EmployeeModal receives `initial` which has fullName but not nombres/apellidoPaterno etc
# Add fallback: if nombres is empty but fullName exists, split it
src = src.replace(
    'function EmployeeModal({ initial, onSave, onClose }: { initial: any; onSave: (data: any) => void; onClose: () => void }) {\n  const [form, setForm] = useState<any>(initial);',
    '''function EmployeeModal({ initial, onSave, onClose }: { initial: any; onSave: (data: any) => void; onClose: () => void }) {
  const [form, setForm] = useState<any>(() => {
    // Back-fill name parts from fullName if not separately stored
    const f = { ...initial };
    if (!f.nombres && !f.apellidoPaterno && f.fullName) {
      const parts = f.fullName.trim().split(/\s+/);
      if (parts.length >= 3) {
        f.apellidoMaterno = parts[parts.length - 1];
        f.apellidoPaterno = parts[parts.length - 2];
        f.nombres         = parts.slice(0, parts.length - 2).join(' ');
      } else if (parts.length === 2) {
        f.apellidoPaterno = parts[1];
        f.nombres         = parts[0];
        f.apellidoMaterno = '';
      } else {
        f.nombres = f.fullName;
        f.apellidoPaterno = '';
        f.apellidoMaterno = '';
      }
    }
    if (!f.seguroSalud) f.seguroSalud = 'ESSALUD';
    if (!f.birthDate && f.birthDate !== '') {
      const bd = initial.birthDate;
      f.birthDate = bd ? new Date(bd).toISOString().split('T')[0] : '';
    }
    return f;
  });'''
)

with open(path, 'w') as f:
    f.write(src)
print("Payroll.tsx EmployeeModal updated")
