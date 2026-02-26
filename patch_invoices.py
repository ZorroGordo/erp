
BASE = '/tmp/erp-fix/victorsdou-frontend/src/pages'
IMPORT = "import { ExcelDownloadButton } from '../components/ExcelDownloadButton';\n"

# ??? INVOICES ?????????????????????????????????????????????????????????????????
path = f'{BASE}/Invoices.tsx'
with open(path) as f:
    src = f.read()

# Add import before first comment or function
if 'ExcelDownloadButton' not in src:
    src = src.replace(
        '// ??? Customer search',
        IMPORT + '// ??? Customer search',
        1
    )

# Add button near header
old = """        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-all shadow-sm"
        >
          <Plus size={16} /> Nuevo comprobante
        </button>"""

new_str = """        <div className="flex items-center gap-2">
          <ExcelDownloadButton
            filename="facturas"
            sheetName="Facturacion"
            data={invoices}
            dateField="issuedAt"
            dateLabel="Fecha de emision"
            columns={[
              { header: 'Serie-Numero', key: 'serieNumero', width: 14 },
              { header: 'Tipo', key: 'type', width: 12 },
              { header: 'RUC/DNI', key: 'entityDocNumber', width: 14 },
              { header: 'Cliente', key: 'entityName', width: 30 },
              { header: 'Moneda', key: 'currency', width: 8 },
              { header: 'Subtotal', key: 'subtotal', width: 12, format: (v: any) => v != null ? Number(v) : '' },
              { header: 'IGV', key: 'igv', width: 10, format: (v: any) => v != null ? Number(v) : '' },
              { header: 'Total', key: 'total', width: 12, format: (v: any) => v != null ? Number(v) : '' },
              { header: 'Estado', key: 'status', width: 12 },
              { header: 'Fecha emision', key: 'issuedAt', width: 18, format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
            ]}
            extraFilters={[
              { key: 'type', label: 'Tipo', type: 'select', options: [{ value: 'FACTURA', label: 'Factura' }, { value: 'BOLETA', label: 'Boleta' }] },
              { key: 'status', label: 'Estado', type: 'select', options: [{ value: 'ACCEPTED', label: 'Aceptado' }, { value: 'PENDING', label: 'Pendiente' }, { value: 'REJECTED', label: 'Rechazado' }] },
            ]}
          />
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-all shadow-sm"
          >
            <Plus size={16} /> Nuevo comprobante
          </button>
        </div>"""

if old in src:
    src = src.replace(old, new_str, 1)
    print('Invoices: patched OK')
else:
    print('Invoices: button pattern not found')

with open(path, 'w') as f:
    f.write(src)
