import { prisma } from '../../lib/prisma';
import type { PricePreview, PricedOrderLine } from '../../types';
import { Prisma } from '@prisma/client';

const IGV_RATE = 0.18;

/** Resolve unit price for a customer + product.
 *  Precedence: active price agreement → standard list price. */
export async function resolvePrice(
  customerId: string,
  productId: string,
  qty: number,
): Promise<{ unitPrice: Prisma.Decimal; source: string }> {
  const now = new Date();
  const agreement = await prisma.customerPriceAgreement.findFirst({
    where: {
      customerId, productId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

  if (!agreement) return { unitPrice: product.basePricePen, source: 'STANDARD_LIST' };

  if (agreement.pricingType === 'FIXED_PRICE') {
    return { unitPrice: agreement.value, source: 'PRICE_AGREEMENT' };
  }

  // DISCOUNT_PCT: apply % off base price
  const discount = product.basePricePen.mul(agreement.value).div(100);
  return { unitPrice: product.basePricePen.sub(discount), source: 'PRICE_AGREEMENT' };
}

export async function previewOrderPricing(
  customerId: string,
  lines: { productId: string; qty: number }[],
): Promise<PricePreview> {
  const pricedLines: PricedOrderLine[] = await Promise.all(
    lines.map(async (line) => {
      const product = await prisma.product.findUniqueOrThrow({
        where: { id: line.productId }, select: { sku: true, name: true, taxClass: true },
      });
      const { unitPrice, source } = await resolvePrice(customerId, line.productId, line.qty);
      const unitPriceNum = unitPrice.toNumber();
      const isExempt = product.taxClass !== 'TAXABLE_IGV18';
      const lineBase = parseFloat((unitPriceNum * line.qty).toFixed(4));
      const igv      = isExempt ? 0 : parseFloat((lineBase * IGV_RATE).toFixed(4));
      return {
        productId: line.productId, sku: product.sku, name: product.name,
        qty: line.qty, unitPrice: unitPriceNum,
        lineTotalExclIgv: lineBase, igvAmount: igv, lineTotal: parseFloat((lineBase + igv).toFixed(4)),
        pricingSource: source as PricedOrderLine['pricingSource'],
      };
    }),
  );

  const subtotalPen = parseFloat(pricedLines.reduce((s, l) => s + l.lineTotalExclIgv, 0).toFixed(4));
  const igvPen      = parseFloat(pricedLines.reduce((s, l) => s + l.igvAmount, 0).toFixed(4));
  return { lines: pricedLines, subtotalPen, igvPen, totalPen: parseFloat((subtotalPen + igvPen).toFixed(4)) };
}

export async function createOrder(input: {
  customerId: string; channel: string; deliveryDate?: string;
  deliveryAddressId?: string; lines: { productId: string; qty: number; notes?: string }[];
  notes?: string; createdBy: string;
}) {
  const pricing = await previewOrderPricing(input.customerId, input.lines);
  const orderNumber = `OV-${Date.now()}`;

  return prisma.salesOrder.create({
    data: {
      orderNumber, customerId: input.customerId, channel: input.channel as never,
      status: 'DRAFT' as never, subtotalPen: pricing.subtotalPen,
      igvPen: pricing.igvPen, totalPen: pricing.totalPen,
      deliveryAddressId: input.deliveryAddressId,
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
      notes: input.notes, createdBy: input.createdBy,
      lines: {
        create: pricing.lines.map((l) => ({
          productId: l.productId, qty: l.qty,
          unitPrice: l.unitPrice, lineTotalPen: l.lineTotal,
          pricingSource: l.pricingSource,
        })),
      },
    },
    include: { lines: { include: { product: true } }, customer: true },
  });
}
