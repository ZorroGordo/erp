with open('/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/prisma/schema.prisma') as f:
    content = f.read()

import re
# CustomerAddress model
idx = content.find('model CustomerAddress {')
if idx >= 0:
    end = content.find('\n}', idx) + 2
    print("=== CustomerAddress model ===")
    print(content[idx:end])
    print()

# Check customer routes for contact/address endpoints
with open('/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/modules/customers/routes.ts') as f:
    routes = f.read()

# Find all route registrations
endpoints = re.findall(r"app\.(get|post|patch|delete)\('([^']+)'", routes)
for method, path in endpoints:
    print(f"  {method.upper():6} /v1/customers{path}")
