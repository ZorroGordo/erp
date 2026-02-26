import re

BASE = '/tmp/erp-fix/victorsdou-frontend/src/pages'

def patch_customers():
    path = f'{BASE}/Customers.tsx'
    with open(path) as f:
        src = f.read()
    import_line = "import { ExcelDownloadButton } from '../components/ExcelDownloadButton';\n"
    src = src.replace('// ?? Types ??', import_line + '// ?? Types ??', 1)
    old_btn = """        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>"""
    new_btn = """        <div className="flex items-center gap-2">
          <ExcelDownloadButton
            filename="clientes"
            sheetName="Clientes"
            data={allCustomers}
            dateField="createdAt"
            dateLabel="Fecha de creacion"
            columns={[
              { header: 'Tipo', key: 'type', width: 8 },
              { header: 'Categoria', key: 'category', width: 18 },
              { header: 'Doc. Tipo', key: 'docType', width: 10 },
              { header: 'Doc. Numero', key: 'docNumber', width: 14 },
              { header: 'Nombre / Razon Social', key: 'displayName', width: 30 },
              { header: 'Email', key: 'email', width: 28 },
              { header: 'Telefono', key: 'phone', width: 14 },
              { header: 'Notas', key: 'notes', width: 30 },
            ]}
            extraFilters={[
              { key: 'type', label: 'Tipo de cliente', type: 'select', options: [{ value: 'B2B', label: 'B2B' }, { value: 'B2C', label: 'B2C' }] },
            ]}
          />
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </div>"""
    if old_btn in src:
        src = src.replace(old_btn, new_btn, 1)
        print('Customers: patched OK')
    else:
        print('Customers: PATTERN NOT FOUND')
    with open(path, 'w') as f:
        f.write(src)

patch_customers()
print('Done')
