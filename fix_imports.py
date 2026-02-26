
import re

BASE = '/tmp/erp-fix/victorsdou-frontend/src/pages'
IMPORT_LINE = "import { ExcelDownloadButton } from '../components/ExcelDownloadButton';"

files_needing_fix = {
    'Customers.tsx':  ('// ?? Types ??', False),
    'Invoices.tsx':   ('// ??? Customer search', False),
    'Inventory.tsx':  ('// ?? Main component ??', False),
}

for fname, (marker, _) in files_needing_fix.items():
    path = f'{BASE}/{fname}'
    with open(path) as f:
        src = f.read()
    
    if IMPORT_LINE in src:
        print(f'{fname}: import already present')
        continue
    
    if marker in src:
        src = src.replace(marker, IMPORT_LINE + '\n' + marker, 1)
        print(f'{fname}: import added OK')
    else:
        # Fallback: insert after last import line
        lines = src.split('\n')
        last_import_idx = -1
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import_idx = i
        if last_import_idx >= 0:
            lines.insert(last_import_idx + 1, IMPORT_LINE)
            src = '\n'.join(lines)
            print(f'{fname}: import added after last import (fallback)')
        else:
            print(f'{fname}: COULD NOT ADD IMPORT')
    
    with open(path, 'w') as f:
        f.write(src)
