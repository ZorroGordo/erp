import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';

// Day-of-week index → delivery day code
const DOW_MAP = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// District-level sort order for Lima (common delivery groupings)
const DISTRICT_ORDER: Record<string, number> = {
  'Miraflores': 1, 'San Isidro': 2, 'Surco': 3, 'La Molina': 4,
  'San Borja': 5, 'San Miguel': 6, 'Lince': 7, 'Jesús María': 8,
  'Pueblo Libre': 9, 'Magdalena': 10, 'Barranco': 11, 'Chorrillos': 12,
  'Villa María del Triunfo': 13, 'Los Olivos': 14, 'Independencia': 15,
  'Cercado de Lima': 16, 'Breña': 17, 'Rímac': 18, 'SJL': 19, 'Ate': 20,
};

export async function deliveryRoutes(app: FastifyInstance) {

  // ── GET /v1/delivery/routes ───────────────────────────────────────────────
  app.get('/routes', {
    preHandler: [requireAnyOf('OPS_MGR', 'DRIVER', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const q = req.query as { date?: string; driverId?: string };
    const routes = await prisma.deliveryRoute.findMany({
      where: {
        ...(q.date     ? { scheduledDate: { gte: new Date(q.date) } } : {}),
        ...(q.driverId ? { driverId: q.driverId } : {}),
      },
      include: { driver: { include: { employee: true } }, jobs: true },
      orderBy: { scheduledDate: 'asc' },
    });
    return reply.send({ data: routes });
  });

  // ── POST /v1/delivery/routes ──────────────────────────────────────────────
  app.post('/routes', {
    preHandler: [requireAnyOf('OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const body = req.body as {
      scheduledDate: string;
      driverId:      string;
      notes?:        string;
      jobs:          {
        salesOrderId:        string;
        sequence:            number;
        deliveryAddressLine: string;
        customerContact?:    string;
        customerPhone?:      string;
        scheduledTimeWindow?: string;
      }[];
    };
    const route = await prisma.deliveryRoute.create({
      data: {
        routeCode:     `RT-${Date.now()}`,
        scheduledDate: new Date(body.scheduledDate),
        driverId:      body.driverId,
        notes:         body.notes ?? null,
        createdBy:     req.actor!.sub,
        jobs:          { create: body.jobs },
      },
      include: { jobs: true, driver: { include: { employee: true } } },
    });
    return reply.code(201).send({ data: route });
  });

  // ── PATCH /v1/delivery/routes/:routeId/jobs/:jobId/status ────────────────
  app.patch('/routes/:routeId/jobs/:jobId/status', {
    preHandler: [requireAnyOf('DRIVER', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { jobId } = req.params as { routeId: string; jobId: string };
    const { status, notes } = req.body as { status: string; notes?: string };
    const job = await prisma.deliveryJob.update({
      where: { id: jobId },
      data: {
        status: status as never,
        notes,
        ...(status === 'DELIVERED' ? { actualDeliveryTime: new Date() } : {}),
      },
    });
    return reply.send({ data: job });
  });

  // ── GET /v1/delivery/suggest?date=YYYY-MM-DD ─────────────────────────────
  // Returns delivery stops for the requested day:
  //   • Sucursales whose deliveryDays includes the weekday  (B2B chain stores)
  //   • B2B/B2C customers with NO active sucursales who have a delivery address
  //     and whose deliveryDays (stored on the CustomerAddress.deliveryNotes JSON)
  //     includes the weekday — or all of them if deliveryDays is unset.
  app.get('/suggest', {
    preHandler: [requireAnyOf('OPS_MGR', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { date } = req.query as { date?: string };
    const targetDate = date ? new Date(date) : new Date();
    const dow = DOW_MAP[targetDate.getDay()]; // e.g. "MON"

    // ── 1. Sucursales with this weekday scheduled ──────────────────────────
    const sucursales = await prisma.sucursal.findMany({
      where: { isActive: true, deliveryDays: { has: dow } },
      include: {
        customer: { select: { id: true, displayName: true, category: true, phone: true } },
      },
      orderBy: [{ district: 'asc' }, { name: 'asc' }],
    });

    // IDs of customers already covered by sucursales (don't double-count)
    const sucursalCustomerIds = new Set(sucursales.map(s => s.customer.id));

    // ── 2. Customers WITHOUT active sucursales that have a delivery address ─
    const customersWithAddress = await prisma.customer.findMany({
      where: {
        isActive: true,
        sucursales: { none: { isActive: true } }, // no active sucursales
        addresses:  { some: {} },                  // has at least one address
      },
      include: {
        addresses: { where: { OR: [{ label: 'Entrega' }, { isDefault: true }] }, take: 1 },
      },
    });

    // Build a unified stop list
    type Stop = {
      sequence:         number;
      stopType:         'SUCURSAL' | 'CUSTOMER';
      sucursalId?:      string;
      sucursalName?:    string;
      customerId:       string;
      customerName:     string;
      customerCategory: string | null;
      contactName?:     string | null;
      contactPhone?:    string | null;
      addressLine1:     string;
      addressLine2?:    string | null;
      district:         string;
      deliveryHour?:    string | null;
      deliveryUnitsQty?: any;
      deliveryNotes?:   string | null;
    };

    const rawStops: Omit<Stop, 'sequence'>[] = [
      ...sucursales.map(s => ({
        stopType:         'SUCURSAL' as const,
        sucursalId:       s.id,
        sucursalName:     s.name,
        customerId:       s.customer.id,
        customerName:     s.customer.displayName,
        customerCategory: s.customer.category as string | null,
        contactName:      s.contactName,
        contactPhone:     s.contactPhone ?? s.customer.phone,
        addressLine1:     s.addressLine1,
        addressLine2:     s.addressLine2,
        district:         s.district,
        deliveryHour:     s.deliveryHour,
        deliveryUnitsQty: s.deliveryUnitsQty,
        deliveryNotes:    s.deliveryNotes,
      })),
      ...customersWithAddress
        .filter(c => !sucursalCustomerIds.has(c.id) && c.addresses.length > 0)
        .map(c => {
          const addr = c.addresses[0];
          return {
            stopType:         'CUSTOMER' as const,
            customerId:       c.id,
            customerName:     c.displayName,
            customerCategory: c.category as string | null,
            contactName:      null,
            contactPhone:     c.phone,
            addressLine1:     addr.addressLine1,
            addressLine2:     addr.addressLine2,
            district:         addr.district,
            deliveryHour:     null,
            deliveryUnitsQty: null,
            deliveryNotes:    addr.deliveryNotes,
          };
        }),
    ];

    // Sort by district order
    const sorted = rawStops.sort((a, b) => {
      const oa = DISTRICT_ORDER[a.district] ?? 99;
      const ob = DISTRICT_ORDER[b.district] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.district.localeCompare(b.district);
    });

    const stops: Stop[] = sorted.map((s, i) => ({ ...s, sequence: i + 1 }));

    // Group by district
    const grouped: Record<string, typeof stops> = {};
    for (const s of stops) {
      if (!grouped[s.district]) grouped[s.district] = [];
      grouped[s.district].push(s);
    }

    return reply.send({
      date:     targetDate.toISOString().split('T')[0],
      dow,
      total:    stops.length,
      stops,
      byDistrict: Object.entries(grouped).map(([district, ds]) => ({
        district,
        count: ds.length,
        stops: ds.map(s => s.sucursalName ?? s.customerName),
      })),
    });
  });

  // ── GET /v1/delivery/drivers ──────────────────────────────────────────────
  app.get('/drivers', {
    preHandler: [requireAnyOf('OPS_MGR', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (_req, reply) => {
    const drivers = await prisma.driver.findMany({
      where: { isActive: true },
      include: { employee: { select: { fullName: true } } },
      orderBy: { employee: { fullName: 'asc' } },
    });
    return reply.send({ data: drivers });
  });

  // ── GET /v1/delivery/pending-orders ──────────────────────────────────────
  // Orders with Guía de Remisión that have NOT been assigned to a route yet
  app.get('/pending-orders', {
    preHandler: [requireAnyOf('OPS_MGR', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (_req, reply) => {
    // Find orders in READY status (have guía) that don't have a delivery job
    const orders = await prisma.salesOrder.findMany({
      where: {
        status: 'READY' as any,
        deliveryJobId: null,
      },
      include: {
        customer: {
          include: {
            addresses: true,
            sucursales: true,
          },
        },
        lines: { include: { product: true } },
        sucursal: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: orders });
  });

  // ── POST /v1/delivery/suggest-route ──────────────────────────────────────
  // Given an array of sales order IDs, suggest a route grouped by postal code
  app.post('/suggest-route', {
    preHandler: [requireAnyOf('OPS_MGR', 'SALES_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { orderIds } = req.body as { orderIds: string[] };
    if (!orderIds?.length) return reply.code(400).send({ error: 'orderIds required' });

    const orders = await prisma.salesOrder.findMany({
      where: { id: { in: orderIds } },
      include: {
        customer: {
          include: {
            addresses: { where: { isDefault: true }, take: 1 },
            sucursales: true,
          },
        },
        sucursal: true,
      },
    });

    // Build stop list with postal code info
    type RouteStop = {
      salesOrderId: string;
      customerName: string;
      addressLine: string;
      district: string;
      postalCode: string | null;
      contactName: string | null;
      contactPhone: string | null;
    };

    const stops: RouteStop[] = orders.map(o => {
      // Prefer sucursal address if linked
      if (o.sucursal) {
        return {
          salesOrderId: o.id,
          customerName: o.customer.displayName,
          addressLine: `${o.sucursal.addressLine1}${o.sucursal.addressLine2 ? ', ' + o.sucursal.addressLine2 : ''}, ${o.sucursal.district}`,
          district: o.sucursal.district,
          postalCode: (o.sucursal as any).postalCode ?? null,
          contactName: o.sucursal.contactName,
          contactPhone: o.sucursal.contactPhone ?? o.customer.phone,
        };
      }
      // Fall back to default customer address
      const addr = o.customer.addresses?.[0];
      return {
        salesOrderId: o.id,
        customerName: o.customer.displayName,
        addressLine: addr
          ? `${addr.addressLine1}${addr.addressLine2 ? ', ' + addr.addressLine2 : ''}, ${addr.district}`
          : 'Sin dirección',
        district: addr?.district ?? 'Sin distrito',
        postalCode: (addr as any)?.postalCode ?? null,
        contactName: null,
        contactPhone: o.customer.phone,
      };
    });

    // Sort by postal code first, then by district order
    const sorted = stops.sort((a, b) => {
      // Group by postal code
      if (a.postalCode && b.postalCode && a.postalCode !== b.postalCode) {
        return a.postalCode.localeCompare(b.postalCode);
      }
      // Then by district order
      const oa = DISTRICT_ORDER[a.district] ?? 99;
      const ob = DISTRICT_ORDER[b.district] ?? 99;
      return oa - ob;
    });

    // Group by postal code
    const byPostalCode: Record<string, RouteStop[]> = {};
    for (const s of sorted) {
      const key = s.postalCode ?? 'SIN_CP';
      if (!byPostalCode[key]) byPostalCode[key] = [];
      byPostalCode[key].push(s);
    }

    return reply.send({
      total: sorted.length,
      stops: sorted.map((s, i) => ({ ...s, sequence: i + 1 })),
      byPostalCode: Object.entries(byPostalCode).map(([code, ss]) => ({
        postalCode: code === 'SIN_CP' ? null : code,
        count: ss.length,
        stops: ss.map(s => s.customerName),
      })),
    });
  });
}
