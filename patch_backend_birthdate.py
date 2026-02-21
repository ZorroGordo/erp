import re

# ── 1. prisma/schema.prisma ───────────────────────────────────────────────────
schema_path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/prisma/schema.prisma'
with open(schema_path) as f: schema = f.read()

# Add birthDate field after hireDate
if 'birthDate' not in schema:
    schema = schema.replace(
        'hireDate        DateTime       @default(now())',
        'hireDate        DateTime       @default(now())\n  birthDate       DateTime?'
    )
    with open(schema_path, 'w') as f: f.write(schema)
    print("schema.prisma updated")
else:
    print("schema.prisma: birthDate already present")

# ── 2. Migration SQL ──────────────────────────────────────────────────────────
import os
mig_dir = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/prisma/migrations/20260221000001_employee_birthdate'
os.makedirs(mig_dir, exist_ok=True)
sql = 'ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);\n'
with open(f'{mig_dir}/migration.sql', 'w') as f: f.write(sql)
print("migration created")

# ── 3. payroll/routes.ts — accept birthDate in POST + PATCH ──────────────────
routes_path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/modules/payroll/routes.ts'
with open(routes_path) as f: routes = f.read()

# POST body type — add birthDate
routes = routes.replace(
    'email?:          String?',
    'email?:          String?\n      birthDate?:      string;'
)
# POST prisma create — add birthDate mapping
routes = routes.replace(
    '...(body.email         !== undefined ? { email:         body.email }         : {}),',
    '...(body.email         !== undefined ? { email:         body.email }         : {}),\n        ...(body.birthDate     !== undefined ? { birthDate:     body.birthDate ? new Date(body.birthDate) : null } : {}),'
)
# PATCH body type — add birthDate
routes = routes.replace(
    "email?:       string;\n      afpName?:",
    "email?:       string;\n      birthDate?:   string;\n      afpName?:"
)
# PATCH prisma update — add birthDate mapping
routes = routes.replace(
    "...(body.email       !== undefined ? { email:       body.email }       : {}),",
    "...(body.email       !== undefined ? { email:       body.email }       : {}),\n        ...(body.birthDate   !== undefined ? { birthDate:   body.birthDate ? new Date(body.birthDate) : null } : {}),"
)

with open(routes_path, 'w') as f: f.write(routes)
print("payroll routes updated")
print("ALL BACKEND DONE")
