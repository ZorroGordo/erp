
BASE = '/tmp/erp-fix/victorsdou-frontend/src/pages'
IMPORT = "import { ExcelDownloadButton } from '../components/ExcelDownloadButton';\n"

# ??? PROCUREMENT ?????????????????????????????????????????????????????????????
path = f'{BASE}/Procurement.tsx'
with open(path) as f:
    src = f.read()

if 'ExcelDownloadButton' not in src:
    # Add import after last import line
    src = src.replace(
        'export default function Procurement',
        IMPORT + 'export default function Procurement',
        1
    )

# Replace both action buttons with wrapped versions including Excel
old_header = """        {tab === 'po' && <button className="btn-primary flex items-center gap-2" onClick={() => setShowPOForm(v => !v)}><Plus size={16} /> Nueva OC</button>}
        {tab === 'suppliers' && <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingSup(null); setShowSupForm(true); }}><Plus size={16} /> Nuevo proveedor</button>}"""

new_header = """        {tab === 'po' && (
          <div className="flex items-center gap-2">
            <ExcelDownloadButton
              filename="ordenes-de-compra"
              sheetName="OC"
              data={pos?.data ?? []}
              dateField="orderedAt"
              dateLabel="Fecha de OC"
              columns={[
                { header: 'N OC', key: 'poNumber', width: 12 },
                { header: 'Proveedor', key: 'supplier.businessName', width: 28 },
                { header: 'Estado', key: 'status', width: 12 },
                { header: 'Total S/', key: 'totalAmountPen', width: 12, format: (v: any) => v != null ? Number(v) : '' },
                { header: 'Total USD', key: 'totalAmountUsd', width: 12, format: (v: any) => v != null ? Number(v) : '' },
                { header: 'F. entrega', key: 'expectedDeliveryDate', width: 16, format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
                { header: 'F. creacion', key: 'orderedAt', width: 18, format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
                { header: 'Notas', key: 'notes', width: 28 },
              ]}
              extraFilters={[
                { key: 'status', label: 'Estado', type: 'select', options: [
                  { value: 'DRAFT', label: 'Borrador' },
                  { value: 'APPROVED', label: 'Aprobada' },
                  { value: 'RECEIVED', label: 'Recibida' },
                  { value: 'CANCELLED', label: 'Cancelada' },
                ]},
              ]}
            />
            <button className="btn-primary flex items-center gap-2" onClick={() => setShowPOForm(v => !v)}><Plus size={16} /> Nueva OC</button>
          </div>
        )}
        {tab === 'suppliers' && (
          <div className="flex items-center gap-2">
            <ExcelDownloadButton
              filename="proveedores"
              sheetName="Proveedores"
              data={suppliers?.data ?? []}
              columns={[
                { header: 'Razon Social', key: 'businessName', width: 30 },
                { header: 'RUC', key: 'ruc', width: 14 },
                { header: 'Contacto', key: 'contactName', width: 22 },
                { header: 'Email', key: 'contactEmail', width: 28 },
                { header: 'Telefono', key: 'contactPhone', width: 14 },
                { header: 'Plazo pago (dias)', key: 'paymentTermsDays', width: 18 },
                { header: 'Metodo pago', key: 'paymentMethod', width: 16 },
                { header: 'Moneda', key: 'currency', width: 10 },
                { header: 'Banco', key: 'bankName', width: 20 },
                { header: 'Cuenta', key: 'bankAccount', width: 20 },
              ]}
            />
            <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingSup(null); setShowSupForm(true); }}><Plus size={16} /> Nuevo proveedor</button>
          </div>
        )}"""

if old_header in src:
    src = src.replace(old_header, new_header, 1)
    print('Procurement: patched OK')
else:
    print('Procurement: PATTERN NOT FOUND')
    # Show what we found around that area
    idx = src.find("Nueva OC")
    print(repr(src[max(0,idx-200):idx+200]))

with open(path, 'w') as f:
    f.write(src)
