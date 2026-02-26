
BASE = '/tmp/erp-fix/victorsdou-frontend/src/pages'
IMPORT = "import { ExcelDownloadButton } from '../components/ExcelDownloadButton';\n"

# ??? INVENTORY ?????????????????????????????????????????????????????????????????
path = f'{BASE}/Inventory.tsx'
with open(path) as f:
    src = f.read()

if 'ExcelDownloadButton' not in src:
    src = src.replace(
        '// ?? Main component',
        IMPORT + '// ?? Main component',
        1
    )

old = """          <button onClick={() => { setReceiveItem(undefined); setShowReceive(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={15} /> Registrar entrada
          </button>"""

new_str = """          <ExcelDownloadButton
              filename="inventario"
              sheetName="Inventario"
              data={ingredients}
              columns={[
                { header: 'Ingrediente', key: 'name', width: 28 },
                { header: 'Unidad', key: 'unit', width: 10 },
                { header: 'Stock actual', key: 'currentStock', width: 14, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Stock minimo', key: 'minStock', width: 14, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Punto reorden', key: 'reorderPoint', width: 16, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Costo unit. S/', key: 'averageCost', width: 14, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Estado', key: 'status', width: 12 },
              ]}
              extraFilters={[
                { key: 'status', label: 'Estado', type: 'select', options: [
                  { value: 'ok', label: 'OK' },
                  { value: 'alert', label: 'Alerta' },
                  { value: 'critical', label: 'Critico' },
                ]},
              ]}
            />
          <button onClick={() => { setReceiveItem(undefined); setShowReceive(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={15} /> Registrar entrada
          </button>"""

if old in src:
    src = src.replace(old, new_str, 1)
    print('Inventory: patched OK')
else:
    print('Inventory: PATTERN NOT FOUND')
    idx = src.find('Registrar entrada')
    print(repr(src[max(0,idx-200):idx+100]))

with open(path, 'w') as f:
    f.write(src)
