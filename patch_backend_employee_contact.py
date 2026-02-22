"""
Backend patches:
1. schema.prisma – add nombres/apellidoPaterno/apellidoMaterno/seguroSalud to Employee
2. schema.prisma – add receivesFacturas to CustomerContact
3. Create migration SQL
4. customers/routes.ts – add contact CRUD + address CRUD
5. payroll/routes.ts – accept new employee fields
"""
import os

BASE = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-erp'

# ── 1. Patch schema.prisma ────────────────────────────────────────────────────
schema_path = f'{BASE}/prisma/schema.prisma'
with open(schema_path) as f:
    schema = f.read()

# Employee – add new fields after fullName
schema = schema.replace(
    '  fullName        String\n  dni             String         @unique',
    '  fullName        String\n  nombres         String?\n  apellidoPaterno String?\n  apellidoMaterno String?\n  seguroSalud     String?        // ESSALUD | EPS | ESSALUD_EPS | SIS | SCTR\n  dni             String         @unique'
)

# CustomerContact – add receivesFacturas
schema = schema.replace(
    '  isPrimary  Boolean  @default(false)\n  @@map("customer_contacts")',
    '  isPrimary       Boolean  @default(false)\n  receivesFacturas Boolean  @default(false)\n  @@map("customer_contacts")'
)

with open(schema_path, 'w') as f:
    f.write(schema)
print("schema.prisma updated")

# ── 2. Create migration ───────────────────────────────────────────────────────
migration_dir = f'{BASE}/prisma/migrations/20260221000003_employee_name_seguro_contact'
os.makedirs(migration_dir, exist_ok=True)
migration_sql = '''\
-- Employee name split + seguro
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "nombres"         TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "apellidoPaterno" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "apellidoMaterno" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "seguroSalud"     TEXT DEFAULT 'ESSALUD';

-- Customer contact receives facturas
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "receivesFacturas" BOOLEAN NOT NULL DEFAULT false;
'''
with open(f'{migration_dir}/migration.sql', 'w') as f:
    f.write(migration_sql)
print("Migration SQL created")

# ── 3. Patch customers/routes.ts – add contact + address endpoints ────────────
cust_routes = f'{BASE}/src/modules/customers/routes.ts'
with open(cust_routes) as f:
    cr = f.read()

contact_routes = '''
  // ── POST /v1/customers/:id/contacts ────────────────────────────────────────
  app.post('/:id/contacts', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      fullName: string;
      role?: string;
      email?: string;
      phone?: string;
      isPrimary?: boolean;
      receivesFacturas?: boolean;
    };
    if (!body.fullName?.trim()) return reply.code(400).send({ error: 'fullName required' });
    const contact = await prisma.customerContact.create({
      data: {
        customerId:      id,
        fullName:        body.fullName.trim(),
        role:            body.role            ?? null,
        email:           body.email?.trim()   ?? null,
        phone:           body.phone?.trim()   ?? null,
        isPrimary:       body.isPrimary       ?? false,
        receivesFacturas: body.receivesFacturas ?? false,
      },
    });
    return reply.code(201).send({ data: contact });
  });

  // ── PATCH /v1/customers/:id/contacts/:contactId ─────────────────────────────
  app.patch('/:id/contacts/:contactId', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { contactId } = req.params as { id: string; contactId: string };
    const body = req.body as {
      fullName?: string; role?: string; email?: string;
      phone?: string; isPrimary?: boolean; receivesFacturas?: boolean;
    };
    const contact = await prisma.customerContact.update({
      where: { id: contactId },
      data: {
        ...(body.fullName  !== undefined ? { fullName:  body.fullName.trim() } : {}),
        ...(body.role      !== undefined ? { role:      body.role ?? null }    : {}),
        ...(body.email     !== undefined ? { email:     body.email?.trim() ?? null } : {}),
        ...(body.phone     !== undefined ? { phone:     body.phone?.trim() ?? null } : {}),
        ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary }        : {}),
        ...(body.receivesFacturas !== undefined ? { receivesFacturas: body.receivesFacturas } : {}),
      },
    });
    return reply.send({ data: contact });
  });

  // ── DELETE /v1/customers/:id/contacts/:contactId ────────────────────────────
  app.delete('/:id/contacts/:contactId', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { contactId } = req.params as { id: string; contactId: string };
    await prisma.customerContact.delete({ where: { id: contactId } });
    return reply.send({ success: true });
  });

  // ── POST /v1/customers/:id/addresses ───────────────────────────────────────
  app.post('/:id/addresses', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      label: string; addressLine1: string; addressLine2?: string;
      district: string; province?: string; department?: string;
      isDefault?: boolean; deliveryNotes?: string;
    };
    if (body.isDefault) {
      await prisma.customerAddress.updateMany({ where: { customerId: id }, data: { isDefault: false } });
    }
    const addr = await prisma.customerAddress.create({
      data: {
        customerId:   id,
        label:        body.label?.trim() || 'Principal',
        addressLine1: body.addressLine1.trim(),
        addressLine2: body.addressLine2?.trim() ?? null,
        district:     body.district.trim(),
        province:     body.province?.trim() || 'Lima',
        department:   body.department?.trim() || 'Lima',
        isDefault:    body.isDefault ?? false,
        deliveryNotes: body.deliveryNotes?.trim() ?? null,
      },
    });
    return reply.code(201).send({ data: addr });
  });

  // ── PATCH /v1/customers/:id/addresses/:addressId ────────────────────────────
  app.patch('/:id/addresses/:addressId', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id, addressId } = req.params as { id: string; addressId: string };
    const body = req.body as {
      label?: string; addressLine1?: string; addressLine2?: string;
      district?: string; province?: string; department?: string;
      isDefault?: boolean; deliveryNotes?: string;
    };
    if (body.isDefault) {
      await prisma.customerAddress.updateMany({ where: { customerId: id }, data: { isDefault: false } });
    }
    const addr = await prisma.customerAddress.update({
      where: { id: addressId },
      data: {
        ...(body.label        !== undefined ? { label:        body.label?.trim() || 'Principal' } : {}),
        ...(body.addressLine1 !== undefined ? { addressLine1: body.addressLine1.trim() }          : {}),
        ...(body.addressLine2 !== undefined ? { addressLine2: body.addressLine2?.trim() ?? null } : {}),
        ...(body.district     !== undefined ? { district:     body.district.trim() }              : {}),
        ...(body.province     !== undefined ? { province:     body.province?.trim() || 'Lima' }   : {}),
        ...(body.department   !== undefined ? { department:   body.department?.trim() || 'Lima' } : {}),
        ...(body.isDefault    !== undefined ? { isDefault:    body.isDefault }                    : {}),
        ...(body.deliveryNotes !== undefined ? { deliveryNotes: body.deliveryNotes?.trim() ?? null } : {}),
      },
    });
    return reply.send({ data: addr });
  });

  // ── DELETE /v1/customers/:id/addresses/:addressId ──────────────────────────
  app.delete('/:id/addresses/:addressId', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { addressId } = req.params as { id: string; addressId: string };
    await prisma.customerAddress.delete({ where: { id: addressId } });
    return reply.send({ success: true });
  });
'''

# Insert before the closing brace of customersRoutes
cr = cr.rstrip()
if cr.endswith('}'):
    cr = cr[:-1].rstrip() + '\n' + contact_routes + '\n}'
with open(cust_routes, 'w') as f:
    f.write(cr)
print("customers/routes.ts updated with contacts + address routes")

# ── 4. Patch payroll/routes.ts – accept new employee fields ─────────────────
pay_routes = f'{BASE}/src/modules/payroll/routes.ts'
with open(pay_routes) as f:
    pr = f.read()

# POST body type
pr = pr.replace(
    '      fullName:       string;\n      dni:            string;\n      position:       string;\n      department?:    string;\n      employmentType?: string;\n      contractType?:  string;\n      hireDate?:      string;\n      baseSalary:     number;\n      pensionSystem?: string;\n      afpName?:       string;\n      cuspp?:         string;\n      email?:         string;\n      bankAccount?:   string;\n      bankName?:      string;',
    '      fullName:       string;\n      nombres?:       string;\n      apellidoPaterno?: string;\n      apellidoMaterno?: string;\n      seguroSalud?:   string;\n      birthDate?:     string;\n      dni:            string;\n      position:       string;\n      department?:    string;\n      employmentType?: string;\n      contractType?:  string;\n      hireDate?:      string;\n      baseSalary:     number;\n      pensionSystem?: string;\n      afpName?:       string;\n      cuspp?:         string;\n      email?:         string;\n      bankAccount?:   string;\n      bankName?:      string;'
)

# POST create data
pr = pr.replace(
    '        fullName:       body.fullName.trim(),\n        dni:            body.dni.trim(),',
    '        fullName:       body.fullName.trim(),\n        nombres:        body.nombres?.trim()        ?? null,\n        apellidoPaterno: body.apellidoPaterno?.trim() ?? null,\n        apellidoMaterno: body.apellidoMaterno?.trim() ?? null,\n        seguroSalud:    body.seguroSalud?.trim()     ?? \'ESSALUD\',\n        birthDate:      body.birthDate  ? new Date(body.birthDate) : null,\n        dni:            body.dni.trim(),'
)

# PATCH body type
pr = pr.replace(
    '      fullName?:       string;\n      position?:       string;\n      department?:     string;\n      employmentType?: string;\n      contractType?:   string;\n      hireDate?:       string;\n      baseSalary?:     number;\n      pensionSystem?:  string;\n      afpName?:        string;\n      cuspp?:          string;\n      email?:          string;\n      bankAccount?:    string;\n      bankName?:       string;\n      isActive?:       boolean;',
    '      fullName?:       string;\n      nombres?:        string;\n      apellidoPaterno?: string;\n      apellidoMaterno?: string;\n      seguroSalud?:    string;\n      birthDate?:      string;\n      position?:       string;\n      department?:     string;\n      employmentType?: string;\n      contractType?:   string;\n      hireDate?:       string;\n      baseSalary?:     number;\n      pensionSystem?:  string;\n      afpName?:        string;\n      cuspp?:          string;\n      email?:          string;\n      bankAccount?:    string;\n      bankName?:       string;\n      isActive?:       boolean;'
)

# PATCH update data – add new fields after fullName spread
pr = pr.replace(
    '        ...(body.fullName       !== undefined ? { fullName:       body.fullName.trim() }        : {}),\n        ...(body.position       !== undefined ? { position:       body.position.trim() }        : {}),',
    '        ...(body.fullName       !== undefined ? { fullName:       body.fullName.trim() }        : {}),\n        ...(body.nombres        !== undefined ? { nombres:        body.nombres?.trim() ?? null }  : {}),\n        ...(body.apellidoPaterno !== undefined ? { apellidoPaterno: body.apellidoPaterno?.trim() ?? null } : {}),\n        ...(body.apellidoMaterno !== undefined ? { apellidoMaterno: body.apellidoMaterno?.trim() ?? null } : {}),\n        ...(body.seguroSalud    !== undefined ? { seguroSalud:    body.seguroSalud?.trim() ?? null } : {}),\n        ...(body.birthDate      !== undefined ? { birthDate:      body.birthDate ? new Date(body.birthDate) : null } : {}),\n        ...(body.position       !== undefined ? { position:       body.position.trim() }        : {}),',
)

with open(pay_routes, 'w') as f:
    f.write(pr)
print("payroll/routes.ts updated with new employee fields")
