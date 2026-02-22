"""
Backend changes for payroll manual adjustments:
1. Add manualBonuses/manualDeductions to Payslip schema
2. Create migration
3. Update service.ts to include adjustments in calculation
4. Update routes.ts: PATCH accepts adjustments, process loop preserves them
"""
import os, re

# ── 1. Schema ──────────────────────────────────────────────────────────────────
schema_path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/prisma/schema.prisma'
with open(schema_path) as f: schema = f.read()
if 'manualBonuses' not in schema:
    schema = schema.replace(
        '  notes       String?',
        '  notes           String?\n  manualBonuses   Decimal  @default(0)\n  manualDeductions Decimal  @default(0)'
    )
    with open(schema_path, 'w') as f: f.write(schema)
    print("schema updated")
else:
    print("schema: already has manualBonuses")

# ── 2. Migration ───────────────────────────────────────────────────────────────
mig_dir = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/prisma/migrations/20260221000002_payslip_manual_adj'
os.makedirs(mig_dir, exist_ok=True)
sql = (
    'ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "manualBonuses" DECIMAL(10,2) NOT NULL DEFAULT 0;\n'
    'ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "manualDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0;\n'
)
with open(f'{mig_dir}/migration.sql', 'w') as f: f.write(sql)
print("migration created")

# ── 3. service.ts ─────────────────────────────────────────────────────────────
svc_path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/modules/payroll/service.ts'
with open(svc_path) as f: svc = f.read()

# Change function signature to accept optional manual adjustments
svc = svc.replace(
    'export async function calculatePayslip(employeeId: string, periodId: string): Promise<PayrollCalculation> {',
    'export async function calculatePayslip(\n  employeeId: string,\n  periodId: string,\n  manualBonuses = 0,\n  manualDeductions = 0,\n): Promise<PayrollCalculation> {'
)

# Find the return statement at the end of calculatePayslip and insert adjustment logic before it
# The function ends with a return statement. We insert adjustment logic just before `return {`
insert_adj = '''
  // ── Manual adjustments (persist across regenerations) ──────────────────────
  if (manualBonuses > 0) {
    calc.additions.bonuses = (calc.additions.bonuses || 0) + manualBonuses;
    calc.grossSalary       = parseFloat((calc.grossSalary + manualBonuses).toFixed(2));
    calc.netSalary         = parseFloat((calc.netSalary   + manualBonuses).toFixed(2));
  }
  if (manualDeductions > 0) {
    calc.deductions.otherDeductions = (calc.deductions.otherDeductions || 0) + manualDeductions;
    calc.netSalary                  = parseFloat((calc.netSalary - manualDeductions).toFixed(2));
  }

  return calc;
}'''

# The function builds and returns `calc`. We need to find where it's assembled.
# Replace the final `return calc;` with our injected block
svc = svc.replace(
    '  return calc;\n}',
    '  // ── Manual adjustments ──────────────────────────────────────────────────────\n'
    '  if (manualBonuses > 0) {\n'
    '    calc.additions.bonuses     = (calc.additions.bonuses || 0) + manualBonuses;\n'
    '    calc.grossSalary           = parseFloat((calc.grossSalary + manualBonuses).toFixed(2));\n'
    '    calc.netSalary             = parseFloat((calc.netSalary   + manualBonuses).toFixed(2));\n'
    '  }\n'
    '  if (manualDeductions > 0) {\n'
    '    calc.deductions.otherDeductions = (calc.deductions.otherDeductions || 0) + manualDeductions;\n'
    '    calc.netSalary                  = parseFloat((calc.netSalary - manualDeductions).toFixed(2));\n'
    '  }\n\n'
    '  return calc;\n}'
)

with open(svc_path, 'w') as f: f.write(svc)
print("service.ts updated")

# ── 4. routes.ts — update PATCH and process loop ──────────────────────────────
routes_path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp/src/modules/payroll/routes.ts'
with open(routes_path) as f: routes = f.read()

# PATCH /payslips/:id — accept manualBonuses, manualDeductions
routes = routes.replace(
    '    const body = req.body as {\n      notes?:     string;\n      netSalary?: number;  // manual override\n      additions?: Record<string, number>;\n      deductions?: Record<string, number>;\n    };',
    '    const body = req.body as {\n      notes?:            string;\n      netSalary?:        number;\n      additions?:        Record<string, number>;\n      deductions?:       Record<string, number>;\n      manualBonuses?:    number;\n      manualDeductions?: number;\n    };'
)

routes = routes.replace(
    '        ...(body.notes      !== undefined ? { notes:      body.notes }      : {}),\n        ...(body.netSalary  !== undefined ? { netSalary:  body.netSalary }  : {}),\n        ...(body.additions  !== undefined ? { additions:  body.additions }  : {}),\n        ...(body.deductions !== undefined ? { deductions: body.deductions } : {}),',
    '        ...(body.notes            !== undefined ? { notes:            body.notes }            : {}),\n        ...(body.netSalary        !== undefined ? { netSalary:        body.netSalary }        : {}),\n        ...(body.additions        !== undefined ? { additions:        body.additions }        : {}),\n        ...(body.deductions       !== undefined ? { deductions:       body.deductions }       : {}),\n        ...(body.manualBonuses    !== undefined ? { manualBonuses:    body.manualBonuses }    : {}),\n        ...(body.manualDeductions !== undefined ? { manualDeductions: body.manualDeductions } : {}),'
)

# Process loop — preserve existing manualBonuses/manualDeductions
# Find the calculatePayslip call in the process endpoint
routes = routes.replace(
    'const calc = await calculatePayslip(employee.id, period.id);',
    '// Preserve manual adjustments from any existing payslip\n'
    '      const existingForCalc = await prisma.payslip.findFirst({ where: { periodId: period.id, employeeId: employee.id } });\n'
    '      const savedBonuses    = Number(existingForCalc?.manualBonuses    ?? 0);\n'
    '      const savedDeductions = Number(existingForCalc?.manualDeductions ?? 0);\n'
    '      const calc = await calculatePayslip(employee.id, period.id, savedBonuses, savedDeductions);'
)

# Also store manualBonuses/manualDeductions in upsert
routes = routes.replace(
    '          grossSalary:        calc.grossSalary,\n          netSalary:          calc.netSalary,',
    '          grossSalary:        calc.grossSalary,\n          netSalary:          calc.netSalary,\n          manualBonuses:      savedBonuses,\n          manualDeductions:   savedDeductions,'
)

with open(routes_path, 'w') as f: f.write(routes)
print("routes.ts updated")
print("ALL BACKEND DONE")
