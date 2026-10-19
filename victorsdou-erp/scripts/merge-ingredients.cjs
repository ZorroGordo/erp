// Fusiona un ingrediente duplicado (FROM) en el ingrediente que se mantiene (TO).
// Caso Oct 2026: "SAL" MP00000056 (inactivo, usado por 3 recetas, 44.25 kg de stock
// invisible) y "SAL " MP00000099 (activo, el que reciben las compras).
//
// Uso (desde victorsdou-erp, con `railway link` hecho):
//   railway run node scripts/merge-ingredients.cjs MP00000056 MP00000099            → solo reporte (dry-run)
//   MERGE_CONFIRM=YES railway run node scripts/merge-ingredients.cjs MP00000056 MP00000099 --apply
//
// Qué hace con --apply (una sola transacción):
//   1. Re-apunta TODAS las filas que referencian FROM (recetas, consumos, movimientos,
//      lotes, OCs, reservas, mermas, listas de precio, cotizaciones, recepciones...) a TO.
//      → el historial de movimientos de TO muestra también los consumos de FROM.
//   2. Suma stock_levels de FROM en TO por almacén (qtyOnHand + qtyReserved) y borra los de FROM.
//   3. Recalcula avgCostPen de TO como promedio ponderado por cantidad en stock.
//   4. Deja FROM inactivo (ingrediente + producto espejo) y normaliza el nombre de TO (trim).
// No borra el ingrediente FROM (queda inactivo y vacío, para auditoría).
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SIMPLE_TABLES = [
  'bom_lines', 'production_consumptions', 'stock_movements', 'batches',
  'production_reservations', 'waste_logs', 'purchase_order_lines',
  'supplier_quote_lines', 'goods_receipt_lines', 'purchase_recommendations',
  'supplier_price_lists', 'uom_conversions',
];

async function main() {
  const [fromSku, toSku, flag] = process.argv.slice(2);
  const apply = flag === '--apply';
  if (!fromSku || !toSku) throw new Error('Uso: merge-ingredients.cjs FROM_SKU TO_SKU [--apply]');
  const from = await prisma.ingredient.findUnique({ where: { sku: fromSku } });
  const to = await prisma.ingredient.findUnique({ where: { sku: toSku } });
  if (!from || !to) throw new Error('SKU no encontrado');
  console.log(`FROM ${from.sku} ${JSON.stringify(from.name)} active=${from.isActive} avg=${from.avgCostPen}`);
  console.log(`TO   ${to.sku} ${JSON.stringify(to.name)} active=${to.isActive} avg=${to.avgCostPen}`);

  const report = {};
  for (const t of SIMPLE_TABLES) {
    const r = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "ingredientId" = $1`, from.id).catch(e => [{ n: 'ERR ' + e.message.slice(0, 80) }]);
    report[t] = r[0].n;
  }
  const lvFrom = await prisma.stockLevel.findMany({ where: { ingredientId: from.id } });
  const lvTo = await prisma.stockLevel.findMany({ where: { ingredientId: to.id } });
  const qFrom = lvFrom.reduce((s, l) => s + Number(l.qtyOnHand), 0);
  const qTo = lvTo.reduce((s, l) => s + Number(l.qtyOnHand), 0);
  const cFrom = Number(from.avgCostPen), cTo = Number(to.avgCostPen);
  const newAvg = (qFrom + qTo) > 0 ? (qFrom * cFrom + qTo * cTo) / (qFrom + qTo) : cTo;
  const alertFrom = await prisma.ingredientAlert.findUnique({ where: { ingredientId: from.id } }).catch(() => null);
  const rrFrom = await prisma.reorderRule.count({ where: { ingredientId: from.id } }).catch(() => 0);
  console.log('Filas a re-apuntar:', report);
  console.log(`Stock FROM ${qFrom} @${cFrom} + TO ${qTo} @${cTo} → ${qFrom + qTo} @${newAvg.toFixed(6)}`);
  console.log(`ingredient_alerts FROM: ${alertFrom ? 'sí (se borra)' : 'no'} · reorder_rules FROM: ${rrFrom} (se borran si TO ya tiene)`);

  if (!apply) { console.log('\nDRY-RUN: nada escrito. Añade --apply y MERGE_CONFIRM=YES para aplicar.'); return; }
  if (process.env.MERGE_CONFIRM !== 'YES') throw new Error('Falta MERGE_CONFIRM=YES');

  await prisma.$transaction(async (tx) => {
    for (const t of SIMPLE_TABLES) {
      await tx.$executeRawUnsafe(`UPDATE "${t}" SET "ingredientId" = $1 WHERE "ingredientId" = $2`, to.id, from.id);
    }
    for (const l of lvFrom) {
      const existing = await tx.stockLevel.findUnique({ where: { ingredientId_warehouseId: { ingredientId: to.id, warehouseId: l.warehouseId } } });
      if (existing) {
        await tx.stockLevel.update({
          where: { id: existing.id },
          data: { qtyOnHand: Number(existing.qtyOnHand) + Number(l.qtyOnHand), qtyReserved: Number(existing.qtyReserved) + Number(l.qtyReserved) },
        });
        await tx.stockLevel.delete({ where: { id: l.id } });
      } else {
        await tx.stockLevel.update({ where: { id: l.id }, data: { ingredientId: to.id } });
      }
    }
    if (alertFrom) await tx.ingredientAlert.delete({ where: { ingredientId: from.id } });
    const rrTo = await tx.reorderRule.count({ where: { ingredientId: to.id } });
    if (rrTo > 0) await tx.reorderRule.deleteMany({ where: { ingredientId: from.id } });
    else await tx.reorderRule.updateMany({ where: { ingredientId: from.id }, data: { ingredientId: to.id } });

    await tx.ingredient.update({ where: { id: to.id }, data: { avgCostPen: newAvg, name: to.name.replace(/\s+/g, ' ').trim(), isActive: true } });
    await tx.ingredient.update({ where: { id: from.id }, data: { isActive: false } });
    await tx.product.updateMany({ where: { sku: from.sku }, data: { isActive: false } });
    await tx.product.updateMany({ where: { sku: to.sku }, data: { name: to.name.replace(/\s+/g, ' ').trim() } });
  }, { timeout: 60_000 });
  console.log('APLICADO.');
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
