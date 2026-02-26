
BASE = '/tmp/erp-fix/victorsdou-frontend/src/pages'
IMPORT = "import { ExcelDownloadButton } from '../components/ExcelDownloadButton';\n"

# ??? PRODUCTS ?????????????????????????????????????????????????????????????????
path = f'{BASE}/Products.tsx'
with open(path) as f:
    src = f.read()

if 'ExcelDownloadButton' not in src:
    src = src.replace(
        'export default function',
        IMPORT + 'export default function',
        1
    )

old = """        <button onClick={() => setShowCreate(s => !s)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> Nuevo producto
        </button>"""

new_str = """        <div className="flex items-center gap-2">
          <ExcelDownloadButton
            filename="productos"
            sheetName="Productos"
            data={productsData?.data ?? []}
            columns={[
              { header: 'Nombre', key: 'name', width: 28 },
              { header: 'Categoria', key: 'category', width: 18 },
              { header: 'SKU', key: 'sku', width: 14 },
              { header: 'Precio venta S/', key: 'price', width: 16, format: (v: any) => v != null ? Number(v) : 0 },
              { header: 'Costo S/', key: 'cost', width: 14, format: (v: any) => v != null ? Number(v) : 0 },
              { header: 'Unidad', key: 'unit', width: 10 },
              { header: 'Activo', key: 'isActive', width: 8, format: (v: any) => v ? 'Si' : 'No' },
            ]}
            extraFilters={[
              { key: 'category', label: 'Categoria', type: 'text' },
            ]}
          />
          <button onClick={() => setShowCreate(s => !s)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> Nuevo producto
          </button>
        </div>"""

if old in src:
    src = src.replace(old, new_str, 1)
    print('Products: patched OK')
else:
    print('Products: PATTERN NOT FOUND')
    idx = src.find('Nuevo producto')
    print(repr(src[max(0,idx-250):idx+100]))

with open(path, 'w') as f:
    f.write(src)
