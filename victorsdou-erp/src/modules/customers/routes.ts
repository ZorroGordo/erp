import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';

const VALID_CATEGORIES = ['SUPERMERCADO', 'TIENDA_NATURISTA', 'CAFETERIA', 'RESTAURANTE', 'HOTEL', 'EMPRESA', 'OTROS'] as const;
type CustomerCategory = typeof VALID_CATEGORIES[number];

const VALID_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const VALID_FREQ = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'];

export async function customersRoutes(app: FastifyInstance) {

  // ── GET /v1/customers/ ─────────────────────────────────────────────────────
  app.get('/', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const q = req.query as { type?: string; category?: string; search?: string };
    const customers = await prisma.customer.findMany({
      where: {
        isActive: true,
        ...(q.type     ? { type:     q.type     as never } : {}),
        ...(q.category ? { category: q.category as never } : {}),
        ...(q.search   ? { displayName: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      include: {
        addresses: true,
        contacts:  true,
        sucursales: { where: { isActive: true }, orderBy: { name: 'asc' } },
      },
      orderBy: { displayName: 'asc' },
    });
    return reply.send({ data: customers });
  });

  // ── POST /v1/customers/ ────────────────────────────────────────────────────
  app.post('/', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const body = req.body as {
      type:        'B2B' | 'B2C';
      category?:   CustomerCategory;
      displayName: string;
      docType:     'DNI' | 'RUC' | 'CE' | 'PASAPORTE';
      docNumber:   string;
      email?:      string;
      phone?:      string;
      notes?:      string;
      // Main address (fiscal / physical)
      address?: {
        addressLine1: string;
        addressLine2?: string;
        district:     string;
        province?:    string;
        department?:  string;
      };
      // Separate delivery address — only stored when different from main
      deliveryAddress?: {
        addressLine1: string;
        addressLine2?: string;
        district:     string;
        province?:    string;
        department?:  string;
      };
    };

    if (body.type === 'B2B') {
      if (!body.category) {
        return reply.code(400).send({ error: 'CATEGORY_REQUIRED', message: 'category is required for B2B clients' });
      }
      if (!VALID_CATEGORIES.includes(body.category)) {
        return reply.code(400).send({ error: 'INVALID_CATEGORY', message: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
      }
    }

    // Build address records to create alongside the customer
    const addressRecords: {
      label: string; addressLine1: string; addressLine2?: string;
      district: string; province: string; department: string; isDefault: boolean;
    }[] = [];

    if (body.address?.addressLine1?.trim()) {
      addressRecords.push({
        label:        'Principal',
        addressLine1: body.address.addressLine1.trim(),
        addressLine2: body.address.addressLine2?.trim() || undefined,
        district:     body.address.district.trim(),
        province:     body.address.province?.trim()    || 'Lima',
        department:   body.address.department?.trim()  || 'Lima',
        isDefault:    true,
      });
    }
    if (body.deliveryAddress?.addressLine1?.trim()) {
      addressRecords.push({
        label:        'Entrega',
        addressLine1: body.deliveryAddress.addressLine1.trim(),
        addressLine2: body.deliveryAddress.addressLine2?.trim() || undefined,
        district:     body.deliveryAddress.district.trim(),
        province:     body.deliveryAddress.province?.trim()    || 'Lima',
        department:   body.deliveryAddress.department?.trim()  || 'Lima',
        isDefault:    false,
      });
    }

    const customer = await prisma.customer.create({
      data: {
        type:        body.type,
        category:    body.type === 'B2B' ? body.category : null,
        displayName: body.displayName,
        docType:     body.docType as never,
        docNumber:   body.docNumber,
        email:       body.email  ?? null,
        phone:       body.phone  ?? null,
        notes:       body.notes  ?? null,
        ...(addressRecords.length > 0 ? {
          addresses: { create: addressRecords },
        } : {}),
      },
      include: { addresses: true },
    });
    return reply.code(201).send({ data: customer });
  });

  // ── PATCH /v1/customers/:id ────────────────────────────────────────────────
  app.patch('/:id', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      category?:    CustomerCategory;
      displayName?: string;
      email?:       string;
      phone?:       string;
      notes?:       string;
      isActive?:    boolean;
    };

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND' });

    if (existing.type === 'B2B' && body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category)) {
        return reply.code(400).send({ error: 'INVALID_CATEGORY', message: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(body.category    !== undefined ? { category:    existing.type === 'B2B' ? body.category as never : null } : {}),
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.email       !== undefined ? { email:       body.email }       : {}),
        ...(body.phone       !== undefined ? { phone:       body.phone }       : {}),
        ...(body.notes       !== undefined ? { notes:       body.notes }       : {}),
        ...(body.isActive    !== undefined ? { isActive:    body.isActive }    : {}),
      },
    });
    return reply.send({ data: customer });
  });

  // ── GET /v1/customers/:id ──────────────────────────────────────────────────
  app.get('/:id', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        addresses:   true,
        contacts:    true,
        sucursales:  { orderBy: { name: 'asc' } },
        priceAgreements: { include: { product: true } },
      },
    });
    if (!customer) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply.send({ data: customer });
  });

  // ── GET /v1/customers/:id/price-agreements ────────────────────────────────
  app.get('/:id/price-agreements', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const now = new Date();
    const agreements = await prisma.customerPriceAgreement.findMany({
      where: { customerId: id, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
      include: { product: true },
    });
    return reply.send({ data: agreements });
  });

  // ── POST /v1/customers/:id/price-agreements ───────────────────────────────
  app.post('/:id/price-agreements', {
    preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      productId:     string;
      pricingType:   'FIXED_PRICE' | 'DISCOUNT_PCT';
      value:         number;
      effectiveFrom: string;
      effectiveTo?:  string;
    };
    const agreement = await prisma.customerPriceAgreement.create({
      data: {
        customerId: id,
        ...body,
        effectiveFrom: new Date(body.effectiveFrom),
        effectiveTo:   body.effectiveTo ? new Date(body.effectiveTo) : undefined,
        approvedBy:    req.actor!.sub,
        createdBy:     req.actor!.sub,
      },
    });
    return reply.code(201).send({ data: agreement });
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SUCURSALES
  // ════════════════════════════════════════════════════════════════════════════

  // ── GET /v1/customers/:id/sucursales ─────────────────────────────────────
  app.get('/:id/sucursales', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sucursales = await prisma.sucursal.findMany({
      where: { customerId: id },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: sucursales });
  });

  // ── POST /v1/customers/:id/sucursales ────────────────────────────────────
  app.post('/:id/sucursales', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name:              string;
      contactName?:      string;
      contactPhone?:     string;
      contactEmail?:     string;
      addressLine1:      string;
      addressLine2?:     string;
      district:          string;
      province?:         string;
      department?:       string;
      deliveryFrequency?: string;
      deliveryDays?:     string[];
      deliveryUnitsQty?: number;
      deliveryHour?:     string;
      deliveryNotes?:    string;
      notes?:            string;
    };

    if (!body.name?.trim())         return reply.code(400).send({ error: 'name is required' });
    if (!body.addressLine1?.trim()) return reply.code(400).send({ error: 'addressLine1 is required' });
    if (!body.district?.trim())     return reply.code(400).send({ error: 'district is required' });
    if (body.deliveryFrequency && !VALID_FREQ.includes(body.deliveryFrequency)) {
      return reply.code(400).send({ error: `deliveryFrequency must be one of: ${VALID_FREQ.join(', ')}` });
    }
    if (body.deliveryDays?.some(d => !VALID_DAYS.includes(d))) {
      return reply.code(400).send({ error: `deliveryDays must be subset of: ${VALID_DAYS.join(', ')}` });
    }

    const sucursal = await prisma.sucursal.create({
      data: {
        customerId:        id,
        name:              body.name.trim(),
        contactName:       body.contactName  ?? null,
        contactPhone:      body.contactPhone ?? null,
        contactEmail:      body.contactEmail ?? null,
        addressLine1:      body.addressLine1.trim(),
        addressLine2:      body.addressLine2 ?? null,
        district:          body.district.trim(),
        province:          body.province   ?? 'Lima',
        department:        body.department ?? 'Lima',
        deliveryFrequency: body.deliveryFrequency ?? null,
        deliveryDays:      body.deliveryDays      ?? [],
        deliveryUnitsQty:  body.deliveryUnitsQty  ?? null,
        deliveryHour:      body.deliveryHour       ?? null,
        deliveryNotes:     body.deliveryNotes      ?? null,
        notes:             body.notes              ?? null,
      },
    });
    return reply.code(201).send({ data: sucursal });
  });

  // ── PATCH /v1/customers/:id/sucursales/:sucursalId ───────────────────────
  app.patch('/:id/sucursales/:sucursalId', {
    preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id, sucursalId } = req.params as { id: string; sucursalId: string };
    const body = req.body as Partial<{
      name:              string;
      contactName:       string;
      contactPhone:      string;
      contactEmail:      string;
      addressLine1:      string;
      addressLine2:      string;
      district:          string;
      province:          string;
      department:        string;
      deliveryFrequency: string;
      deliveryDays:      string[];
      deliveryUnitsQty:  number;
      deliveryHour:      string;
      deliveryNotes:     string;
      notes:             string;
      isActive:          boolean;
    }>;

    const existing = await prisma.sucursal.findFirst({ where: { id: sucursalId, customerId: id } });
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND' });

    const sucursal = await prisma.sucursal.update({
      where: { id: sucursalId },
      data: {
        ...(body.name              !== undefined ? { name:              body.name }              : {}),
        ...(body.contactName       !== undefined ? { contactName:       body.contactName }       : {}),
        ...(body.contactPhone      !== undefined ? { contactPhone:      body.contactPhone }      : {}),
        ...(body.contactEmail      !== undefined ? { contactEmail:      body.contactEmail }      : {}),
        ...(body.addressLine1      !== undefined ? { addressLine1:      body.addressLine1 }      : {}),
        ...(body.addressLine2      !== undefined ? { addressLine2:      body.addressLine2 }      : {}),
        ...(body.district          !== undefined ? { district:          body.district }          : {}),
        ...(body.province          !== undefined ? { province:          body.province }          : {}),
        ...(body.department        !== undefined ? { department:        body.department }         : {}),
        ...(body.deliveryFrequency !== undefined ? { deliveryFrequency: body.deliveryFrequency } : {}),
        ...(body.deliveryDays      !== undefined ? { deliveryDays:      body.deliveryDays }      : {}),
        ...(body.deliveryUnitsQty  !== undefined ? { deliveryUnitsQty:  body.deliveryUnitsQty }  : {}),
        ...(body.deliveryHour      !== undefined ? { deliveryHour:      body.deliveryHour }      : {}),
        ...(body.deliveryNotes     !== undefined ? { deliveryNotes:     body.deliveryNotes }     : {}),
        ...(body.notes             !== undefined ? { notes:             body.notes }             : {}),
        ...(body.isActive          !== undefined ? { isActive:          body.isActive }          : {}),
      },
    });
    return reply.send({ data: sucursal });
  });

  // ── DELETE /v1/customers/:id/sucursales/:sucursalId (soft-delete) ────────
  app.delete('/:id/sucursales/:sucursalId', {
    preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id, sucursalId } = req.params as { id: string; sucursalId: string };
    const existing = await prisma.sucursal.findFirst({ where: { id: sucursalId, customerId: id } });
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND' });
    await prisma.sucursal.update({ where: { id: sucursalId }, data: { isActive: false } });
    return reply.code(204).send();
  });
}
