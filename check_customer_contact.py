with open('/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/prisma/schema.prisma') as f:
    content = f.read()

import re
# Find Contact-related models
models = re.findall(r'(model \w+Contact\w* \{[^}]+\})', content, re.DOTALL)
for m in models:
    print(m)
    print()

# Also find Customer model
idx = content.find('model Customer {')
if idx >= 0:
    end = content.find('\n}', idx) + 2
    print("=== Customer model ===")
    print(content[idx:end])
    print()

# Find CustomerContact or Contact
for keyword in ['CustomerContact', 'Contact {', 'Address {']:
    idx2 = content.find(f'model {keyword}')
    if idx2 >= 0:
        end2 = content.find('\n}', idx2) + 2
        print(f"=== model {keyword} ===")
        print(content[idx2:end2])
        print()
