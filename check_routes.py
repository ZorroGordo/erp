with open('/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/modules/customers/routes.ts') as f:
    c = f.read()
for i, l in enumerate(c.split('\n'), 1):
    if any(x in l for x in ['app.patch', 'app.put', 'app.delete', 'app.get(', 'app.post(']):
        print(f'{i}: {l.strip()[:120]}')

print('---PAYROLL---')
with open('/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/modules/payroll/routes.ts') as f:
    c = f.read()
for i, l in enumerate(c.split('\n'), 1):
    if any(x in l for x in ['app.patch', 'app.put', 'app.delete', 'app.get(', 'app.post(']):
        print(f'{i}: {l.strip()[:120]}')
