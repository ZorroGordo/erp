import type { FastifyInstance } from 'fastify';
import { requireAnyOf, requireAuth } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { getCache, setCache, CACHE_KEYS } from '../../lib/redis';

// ── Auto-code generation helpers ──────────────────────────────────────────

const TYPE_CODES: Record<string, string> = {
  RAW_MATERIAL: 'MP',
  INTERMEDIATE: 'PI',
  FINISHED:     'PT',
};

const FAMILY_CODES: Record<string, string> = {
  CONGELADO: 'CO',
  SECO:      'SE',
};

async function generateProductCode(
  productType: string,
  family: string,
  categoryCode: string,
): Promise<string> {
  const tt = TYPE_CODES[productType] ?? 'XX';
  const ff = FAMILY_CODES[family] ?? 'XX';
  const cc = (categoryCode ?? 'XX').substring(0, 2).toUpperCase().padEnd(2, 'X');
  const prefix = `${tt}-${ff}-${cc}-`;

  // Find highest existing sequential number with this prefix
  const existing = await prisma.product.findMany({
    where: { sku: { startsWith: prefix } },
    select: { sku: true },
    orderBy: { sku: 'desc' },
    take: 1,
  });

  let nextNum = 1;
  if (existing.length > 0) {
    const lastSku = existing[0].sku;
    const numPart = lastSku.substring(prefix.length);
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) nextNum = parsed + 1;
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

// ── Cost calculation helper ───────────────────────────────────────────────

function convertQtyToKgOrL(qty: number, uom: string): number {
  const u = (uom ?? '').toLowerCase();
  const gramToKg: Record<string, number> = { mg: 0.000001, g: 0.001, kg: 1 };
  const mlToL: Record<string, number> = { ml: 0.001, cl: 0.01, dl: 0.1, l: 1, litre: 1 };
  if (gramToKg[u] !== undefined) return qty * gramToKg[u];
  if (mlToL[u] !== undefined) return qty * mlToL[u];
  return qty;
}

async function getProductCosts(productIds: string[]): Promise<Record<string, { rawCost: number; overheadCost: number; totalCost: number }>> {
  if (productIds.length === 0) return {};
  const OVERHEAD_RATE = 0.47; // 47% default

  const recipes = await prisma.recipe.findMany({
    where: { productId: { in: productIds }, status: 'ACTIVE' },
    include: { bomLines: { include: { ingredient: { select: { avgCostPen: true, baseUom: true } } } } },
  });

  const costs: Record<string, { rawCost: number; overheadCost: number; totalCost: number }> = {};
  for (const recipe of recipes) {
    const yieldQty = Number(recipe.yieldQty) || 1;
    let totalRaw = 0;
    for (const line of recipe.bomLines) {
      const effectiveQty = Number(line.qtyRequired) * (1 + Number(line.wasteFactorPct) / 100);
      const qtyStd = convertQtyToKgOrL(effectiveQty, line.uom);
      totalRaw += qtyStd * Number(line.ingredient.avgCostPen);
    }
    const unitRaw = totalRaw / yieldQty;
    const safeRate = Math.min(Math.max(OVERHEAD_RATE, 0), 0.99);
    const totalUnit = unitRaw / (1 - safeRate);
    costs[recipe.productId] = {
      rawCost: Math.round(unitRaw * 100) / 100,
      overheadCost: Math.round((totalUnit - unitRaw) * 100) / 100,
      totalCost: Math.round(totalUnit * 100) / 100,
    };
  }
  return costs;
}

export async function catalogRoutes(app: FastifyInstance) {

  // ── List products (with costs) ──────────────────────────────────────────
  app.get('/', { preHandler: [requireAuth()] }, async (req, reply) => {
    const q = req.query as { categoryId?: string; search?: string; active?: string; productType?: string; family?: string };
    const products = await prisma.product.findMany({
      where: {
        isActive: q.active !== 'false',
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.productType ? { productType: q.productType as never } : {}),
        ...(q.family ? { family: q.family as never } : {}),
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });

    // Attach costs from active recipes
    const productIds = products.map(p => p.id);
    const costs = await getProductCosts(productIds);
    const enriched = products.map(p => ({
      ...p,
      costs: costs[p.id] ?? null,
    }));

    return reply.send({ data: enriched });
  });

  // ── Public catalog ──────────────────────────────────────────────────────
  app.get('/public', async (_req, reply) => {
    const cached = await getCache(CACHE_KEYS.catalog());
    if (cached) return reply.send({ data: cached });
    const products = await prisma.product.findMany({
      where: { isActive: true, isB2cVisible: true },
      select: { id: true, sku: true, name: true, basePricePen: true, taxClass: true,
                unitOfSale: true, imageUrl: true, category: true, minOrderQty: true,
                ecommerceEnabled: true, ecommercePrice: true, ecommerceImages: true,
                ecommerceMainImageIndex: true },
    });
    await setCache(CACHE_KEYS.catalog(), products, 30);
    return reply.send({ data: products });
  });

  // ── Create product (with auto-code) ─────────────────────────────────────
  app.post('/', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const body = req.body as {
      sku?: string;
      name: string;
      categoryId: string;
      basePricePen: number;
      taxClass?: string;
      unitOfSale?: string;
      productType?: string;
      family?: string;
      autoCode?: boolean;
      categoryCode?: string; // 2-letter short code for the category
    };

    let sku = body.sku;
    if (body.autoCode && body.productType && body.family) {
      sku = await generateProductCode(body.productType, body.family, body.categoryCode ?? 'XX');
    }
    if (!sku) return reply.code(400).send({ error: 'SKU is required (or enable autoCode)' });

    const product = await prisma.product.create({
      data: {
        sku,
        name: body.name,
        categoryId: body.categoryId,
        basePricePen: body.basePricePen,
        taxClass: (body.taxClass as never) ?? ('TAXABLE_IGV18' as never),
        unitOfSale: body.unitOfSale ?? 'unit',
        productType: body.productType ? (body.productType as never) : null,
        family: body.family ? (body.family as never) : null,
      },
    });
    return reply.code(201).send({ data: product });
  });

  // ── Update product ──────────────────────────────────────────────────────
  app.patch('/:id', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { categoryId, ...rest } = req.body as { categoryId?: string; [key: string]: unknown };
    const data: Record<string, unknown> = { ...rest };
    if (categoryId !== undefined) {
      data.category = { connect: { id: categoryId } };
    }
    const product = await prisma.product.update({ where: { id }, data: data as never });
    return reply.send({ data: product });
  });

  // ── Generate next code (preview) ────────────────────────────────────────
  app.get('/next-code', { preHandler: [requireAuth()] }, async (req, reply) => {
    const q = req.query as { productType: string; family: string; categoryCode?: string };
    if (!q.productType || !q.family) return reply.code(400).send({ error: 'productType and family required' });
    const code = await generateProductCode(q.productType, q.family, q.categoryCode ?? 'XX');
    return reply.send({ data: { code } });
  });

  /* ── Categories ─────────────────────────────────────────────────────── */

  app.get('/categories', { preHandler: [requireAuth()] }, async (_req, reply) => {
    const categories = await prisma.productCategory.findMany({ orderBy: { name: 'asc' } });
    return reply.send({ data: categories });
  });

  app.post('/categories', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const { name, code } = req.body as { name: string; code?: string };
    const category = await prisma.productCategory.create({ data: { name } });
    return reply.code(201).send({ data: category });
  });
}
