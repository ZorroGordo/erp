import re

BASE = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/'

def add_import(src, imp):
    if imp.strip() in src:
        return src
    lines = src.split('\n')
    last_import = -1
    for i, l in enumerate(lines):
        if l.startswith('import '):
            last_import = i
    if last_import >= 0:
        lines.insert(last_import + 1, imp.rstrip())
    return '\n'.join(lines)

# Dashboard.tsx
path = BASE + 'Dashboard.tsx'
with open(path) as f: src = f.read()
src = re.sub(r'function fmt\(n: number\) \{[^}]+\}', 'const fmt = fmtNum;', src)
src = add_import(src, "import { fmtMoney, fmtNum, fmtInt } from '../lib/fmt';")
src = src.replace("S/ {fmt(total)}", "{fmtMoney(total)}")
src = src.replace("S/ {fmt(subtotal)}", "{fmtMoney(subtotal)}")
src = src.replace("S/ {fmt(igv)}", "{fmtMoney(igv)}")
src = src.replace("S/ {fmt(factura)}", "{fmtMoney(factura)}")
src = src.replace("S/ {fmt(boleta)}", "{fmtMoney(boleta)}")
src = src.replace("S/ —</p>", "—</p>")
src = src.replace("S/ {Number(o.totalAmountPen).toFixed(2)}", "{fmtMoney(o.totalAmountPen)}")
with open(path, 'w') as f: f.write(src)
print("Dashboard OK")

# Payroll.tsx
path = BASE + 'Payroll.tsx'
with open(path) as f: src = f.read()
src = src.replace(
    'function fmtS(n: any) { return "S/ " + Number(n ?? 0).toFixed(2); }',
    'const fmtS = fmtMoney;'
)
src = add_import(src, "import { fmtMoney } from '../lib/fmt';")
with open(path, 'w') as f: f.write(src)
print("Payroll OK")

# Invoices.tsx
path = BASE + 'Invoices.tsx'
with open(path) as f: src = f.read()
src = re.sub(r'Number\(([^)]+)\)\.toFixed\(2\)', lambda m: f'fmtNum({m.group(1)})', src)
src = add_import(src, "import { fmtMoney, fmtNum } from '../lib/fmt';")
with open(path, 'w') as f: f.write(src)
print("Invoices OK")

# SalesOrders.tsx
path = BASE + 'SalesOrders.tsx'
with open(path) as f: src = f.read()
src = re.sub(r'Number\(([^)]+)\)\.toFixed\(2\)', lambda m: f'fmtNum({m.group(1)})', src)
src = add_import(src, "import { fmtMoney, fmtNum } from '../lib/fmt';")
with open(path, 'w') as f: f.write(src)
print("SalesOrders OK")

# Procurement.tsx
path = BASE + 'Procurement.tsx'
with open(path) as f: src = f.read()
src = re.sub(r'Number\(([^)]+)\)\.toFixed\(2\)', lambda m: f'fmtNum({m.group(1)})', src)
src = add_import(src, "import { fmtMoney, fmtNum } from '../lib/fmt';")
with open(path, 'w') as f: f.write(src)
print("Procurement OK")

# Products.tsx
path = BASE + 'Products.tsx'
with open(path) as f: src = f.read()
src = re.sub(r'Number\(([^)]+)\)\.toFixed\(2\)', lambda m: f'fmtNum({m.group(1)})', src)
src = add_import(src, "import { fmtMoney, fmtNum } from '../lib/fmt';")
with open(path, 'w') as f: f.write(src)
print("Products OK")

# Inventory.tsx
path = BASE + 'Inventory.tsx'
with open(path) as f: src = f.read()
src = re.sub(r'Number\(([^)]+)\)\.toFixed\(2\)', lambda m: f'fmtNum({m.group(1)})', src)
src = add_import(src, "import { fmtMoney, fmtNum } from '../lib/fmt';")
with open(path, 'w') as f: f.write(src)
print("Inventory OK")

# Accounting.tsx - replace its local fmtS def
path = BASE + 'Accounting.tsx'
with open(path) as f: src = f.read()
# The fmtS in accounting is complex, just add a wrapper alias
src = re.sub(
    r"const fmtS = \(v: any, currency = 'PEN'\) =>[^\n]+",
    "const fmtS = (v: any, _currency = 'PEN') => fmtMoney(v);",
    src
)
src = add_import(src, "import { fmtMoney, fmtNum } from '../lib/fmt';")
with open(path, 'w') as f: f.write(src)
print("Accounting OK")

print("ALL DONE")
