// ── Presentation → base unit conversion, backed by the uom_conversions table ──
//
// src/lib/uom.ts only knows dimensional conversions (kg↔g, l↔ml). Purchases
// arrive in *presentations* — "1 saco", "1 caja", "1 balde" — whose size is a
// property of the product, not of the unit: a saco of harina is 50 kg, a saco
// of azúcar might be 25 kg. Those live in the UOMConversion table, per
// ingredient (ingredientId set) or globally (ingredientId null).
//
// Resolution order, first hit wins:
//   1. uom_conversions row for this ingredient (fromUom → toUom)
//   2. the same row inverted (toUom → fromUom), factor = 1/f
//   3. universal uom_conversions row (ingredientId null), direct then inverted
//   4. the dimensional table in src/lib/uom.ts
// Returns null when nothing applies — callers keep the original quantity.

import { prisma } from './prisma';
import { uomConversionFactor } from './uom';

function norm(u: string): string {
  return (u ?? '').toString().toLowerCase().trim().replace(/\.$/, '');
}

export async function resolveConversionFactor(
  fromUom: string,
  toUom: string,
  ingredientId?: string | null,
): Promise<number | null> {
  const from = norm(fromUom);
  const to   = norm(toUom);
  if (!from || !to) return null;
  if (from === to) return 1;

  // One query for every candidate row, then pick by priority in memory —
  // cheaper than up to four round-trips per PO line.
  const rows = await prisma.uOMConversion.findMany({
    where: {
      AND: [
        { OR: [{ fromUom: from, toUom: to }, { fromUom: to, toUom: from }] },
        ingredientId
          ? { OR: [{ ingredientId }, { ingredientId: null }] }
          : { ingredientId: null },
      ],
    },
  });

  const pick = (ingScoped: boolean, inverted: boolean) =>
    rows.find(r =>
      (ingScoped ? r.ingredientId === ingredientId : r.ingredientId === null) &&
      (inverted ? (norm(r.fromUom) === to && norm(r.toUom) === from)
                : (norm(r.fromUom) === from && norm(r.toUom) === to)));

  for (const [scoped, inv] of [[true, false], [true, true], [false, false], [false, true]] as const) {
    const row = pick(scoped, inv);
    if (!row) continue;
    const f = Number(row.factor);
    if (!Number.isFinite(f) || f === 0) continue;
    return inv ? 1 / f : f;
  }

  return uomConversionFactor(from, to);
}

/**
 * Convert `qty` from `fromUom` to `toUom`, consulting the conversions table
 * first. Mirrors convertQty() in src/lib/uom.ts but is async and DB-aware.
 */
export async function resolveConvertQty(
  qty: number,
  fromUom: string,
  toUom: string,
  ingredientId?: string | null,
): Promise<{ qty: number; factor: number; converted: boolean }> {
  const factor = await resolveConversionFactor(fromUom, toUom, ingredientId);
  if (factor == null || factor === 1) return { qty, factor: 1, converted: false };
  return { qty: qty * factor, factor, converted: true };
}
