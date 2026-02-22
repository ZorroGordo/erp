import subprocess
result = subprocess.run(
    ['grep', '-n', 'pensionSystem\|fullName\|birthDate\|hireDate\|cuspp\|seguro\|insurance',
     '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/prisma/schema.prisma'],
    capture_output=True, text=True
)
print(result.stdout[:3000])

# Also find the employee-like model
with open('/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/prisma/schema.prisma') as f:
    content = f.read()

# Find the model that has pensionSystem
idx = content.find('pensionSystem')
if idx >= 0:
    start = content.rfind('model ', 0, idx)
    end = content.find('\n}', idx) + 2
    print("=== Employee-like model ===")
    print(content[start:end])
else:
    print("pensionSystem not found in schema")
    # Print all model names
    import re
    models = re.findall(r'^model (\w+)', content, re.MULTILINE)
    print("Models:", models)
