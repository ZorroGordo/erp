with open('/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/modules/customers/routes.ts') as f:
    c = f.read()
# Print lines 120-200
lines = c.split('\n')
for i, l in enumerate(lines[120:200], 121):
    print(f'{i}: {l}')
