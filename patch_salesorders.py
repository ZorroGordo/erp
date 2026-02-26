
BASE = '/tmp/erp-fix/victorsdou-frontend/src/pages'
IMPORT = "import { ExcelDownloadButton } from '../components/ExcelDownloadButton';\n"

# ??? SALES ORDERS ?????????????????????????????????????????????????????????????
path = f'{BASE}/SalesOrders.tsx'
with open(path) as f:
    src = f.read()

if 'ExcelDownloadButton' not in src:
    src = src.replace(
        'export default function SalesOrders',
        IMPORT + 'export default function SalesOrders',
        1
    )

old = """        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
          <Plus size={16} /> Nuevo pedido
        </button>"""

new_str = """        <div className="flex items-center gap-2">
          <ExcelDownloadButton
            filename="pedidos-venta"
            sheetName="Pedidos"
            data={orders?.data ?? []}
            dateField="createdAt"
            dateLabel="Fecha del pedido"
            columns={[
              { header: 'N Pedido', key: 'orderNumber', width: 14 },
              { header: 'Cliente', key: 'customer.displayName', width: 28 },
              { header: 'Canal', key: 'channel', width: 12 },
              { header: 'Estado', key: 'status', width: 14 },
              { header: 'Total S/', key: 'totalAmount', width: 14, format: (v: any) => v != null ? Number(v) : 0 },
              { header: 'Fecha', key: 'createdAt', width: 18, format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
              { header: 'Notas', key: 'notes', width: 28 },
            ]}
            extraFilters={[
              { key: 'status', label: 'Estado', type: 'select', options: [
                { value: 'PENDING', label: 'Pendiente' },
                { value: 'CONFIRMED', label: 'Confirmado' },
                { value: 'DELIVERED', label: 'Entregado' },
                { value: 'CANCELLED', label: 'Cancelado' },
              ]},
              { key: 'channel', label: 'Canal', type: 'select', options: [
                { value: 'COUNTER', label: 'Mostrador' },
                { value: 'ONLINE', label: 'Online' },
                { value: 'WHOLESALE', label: 'Mayorista' },
              ]},
            ]}
          />
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> Nuevo pedido
          </button>
        </div>"""

if old in src:
    src = src.replace(old, new_str, 1)
    print('SalesOrders: patched OK')
else:
    print('SalesOrders: PATTERN NOT FOUND')

with open(path, 'w') as f:
    f.write(src)
