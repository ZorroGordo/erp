"""Adds birthDate field to the EmployeeModal in Payroll.tsx"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Payroll.tsx'
with open(path) as f: src = f.read()

# 1. Add birthDate to the EmployeeModal form initial state
src = src.replace(
    "  const [form, setForm] = useState(initial ? {",
    "  const [form, setForm] = useState<any>(initial ? {"
)

# Add birthDate in initial form mapping (after email field)
src = src.replace(
    "    email:          initial.email          ?? '',",
    "    email:          initial.email          ?? '',\n    birthDate:      initial.birthDate ? new Date(initial.birthDate).toISOString().split('T')[0] : '',"
)

# Add birthDate in empty form (the else branch — needs to find the closing of the else)
src = src.replace(
    "    email:          '',\n    isActive:",
    "    email:          '',\n    birthDate:      '',\n    isActive:"
)

# 2. Add birthDate field in the form JSX — insert after the email field
birthdate_field = '''
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de nacimiento</label>
            <input className="input" type="date" value={form.birthDate ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, birthDate: e.target.value }))} />
          </div>'''

# Find a good insertion point — after the email input block in EmployeeModal
src = src.replace(
    '''            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input className="input" type="email" placeholder="empleado@empresa.pe" value={form.email}
                onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
            </div>''',
    '''            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input className="input" type="email" placeholder="empleado@empresa.pe" value={form.email}
                onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
            </div>''' + birthdate_field
)

# 3. Make sure birthDate is included in the onSave call
# The form submit passes { ...form, baseSalary: ... } so birthDate is automatically included

with open(path, 'w') as f: f.write(src)
print("Payroll.tsx updated with birthDate")
