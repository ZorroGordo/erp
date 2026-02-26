
path = '/tmp/erp-fix/victorsdou-frontend/src/pages/Invoices.tsx'
with open(path) as f:
    src = f.read()

# Remove the leftover setLookupMsg(null) call - it was replaced by RucLookupInput which manages its own state
src = src.replace('setEntityEmail(\'\'); setEntityAddr(\'\'); setLookupMsg(null);', 'setEntityEmail(\'\'); setEntityAddr(\'\');', 1)
print('Fixed setLookupMsg')

with open(path, 'w') as f:
    f.write(src)
