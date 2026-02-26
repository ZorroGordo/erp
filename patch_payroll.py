
BASE = '/tmp/erp-fix/victorsdou-frontend/src/pages'
IMPORT = "import { ExcelDownloadButton } from '../components/ExcelDownloadButton';\n"

# ??? PAYROLL ?????????????????????????????????????????????????????????????????
path = f'{BASE}/Payroll.tsx'
with open(path) as f:
    src = f.read()

if 'ExcelDownloadButton' not in src:
    # Insert before the export default
    src = src.replace(
        'export default function',
        IMPORT + 'export default function',
        1
    )

old = """        {tab === "employees" && (
          <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingEmp(null); setShowEmpModal(true); }}>
            <Plus size={16} /> Nuevo empleado
          </button>
        )}"""

new_str = """        {tab === "employees" && (
          <div className="flex items-center gap-2">
            <ExcelDownloadButton
              filename="empleados"
              sheetName="Empleados"
              data={employees}
              columns={[
                { header: 'Nombre completo', key: 'fullName', width: 28 },
                { header: 'Documento', key: 'docNumber', width: 14 },
                { header: 'Cargo', key: 'position', width: 22 },
                { header: 'Departamento', key: 'department', width: 20 },
                { header: 'Sueldo base S/', key: 'baseSalary', width: 16, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Pension', key: 'pensionSystem', width: 10 },
                { header: 'Fecha ingreso', key: 'startDate', width: 16, format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
                { header: 'Email', key: 'email', width: 28 },
                { header: 'Telefono', key: 'phone', width: 14 },
              ]}
              extraFilters={[
                { key: 'pensionSystem', label: 'Sistema pension', type: 'select', options: [{ value: 'AFP', label: 'AFP' }, { value: 'ONP', label: 'ONP' }] },
                { key: 'department', label: 'Departamento', type: 'text' },
              ]}
            />
            <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingEmp(null); setShowEmpModal(true); }}>
              <Plus size={16} /> Nuevo empleado
            </button>
          </div>
        )}"""

if old in src:
    src = src.replace(old, new_str, 1)
    print('Payroll: patched OK')
else:
    print('Payroll: PATTERN NOT FOUND')
    idx = src.find('Nuevo empleado')
    print(repr(src[max(0,idx-300):idx+100]))

with open(path, 'w') as f:
    f.write(src)
