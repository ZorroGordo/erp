// ── Unit-of-measure conversion ───────────────────────────────────────────────
// Converts a quantity from one unit to another WITHIN the same physical
// dimension (mass or volume). Used when stock is received/entered in a unit
// different from the ingredient's master unit (baseUom) so the on-hand balance
// and WAC are always kept in the master unit.
//
// Returns the multiplicative factor `f` such that:  qtyInTo = qtyInFrom * f
// and (because total value is invariant)             unitCostInTo = unitCostInFrom / f
//
// Returns 1 when the units are the same (case/space/alias-insensitive).
// Returns null when the two units are NOT convertible (different dimensions,
// or an unknown / count-based unit such as "unidad", "saco", "caja"): the
// caller should then leave the quantity untouched.

// Everything normalised to a canonical base: mass → kilograms, volume → litres.
const MASS_TO_KG: Record<string, number> = {
  mg: 0.000001,
  g: 0.001, gr: 0.001, grs: 0.001, gramo: 0.001, gramos: 0.001,
  kg: 1, kgs: 1, kilo: 1, kilos: 1, kilogramo: 1, kilogramos: 1,
  t: 1000, ton: 1000, tonelada: 1000, toneladas: 1000,
};

const VOLUME_TO_L: Record<string, number> = {
  ml: 0.001, mililitro: 0.001, mililitros: 0.001, cc: 0.001,
  cl: 0.01, dl: 0.1,
  l: 1, lt: 1, lts: 1, litro: 1, litros: 1, litre: 1, litres: 1,
};

function normalize(u: string): string {
  return (u ?? '').toString().toLowerCase().trim().replace(/\.$/, '');
}

/**
 * Factor to convert a quantity expressed in `fromUom` into `toUom`.
 * `null` when the conversion is not possible (incompatible dimensions or an
 * unknown/count unit) — callers should keep the original quantity in that case.
 */
export function uomConversionFactor(fromUom: string, toUom: string): number | null {
  const from = normalize(fromUom);
  const to   = normalize(toUom);
  if (!from || !to) return null;
  if (from === to) return 1;

  const fromMass = MASS_TO_KG[from];
  const toMass   = MASS_TO_KG[to];
  if (fromMass !== undefined && toMass !== undefined) return fromMass / toMass;

  const fromVol = VOLUME_TO_L[from];
  const toVol   = VOLUME_TO_L[to];
  if (fromVol !== undefined && toVol !== undefined) return fromVol / toVol;

  // Different dimensions or an unrecognised / count-based unit → not convertible.
  return null;
}

/**
 * Convert `qty` from `fromUom` to `toUom`. When the units are not convertible
 * the original quantity is returned unchanged and `converted` is false.
 */
export function convertQty(
  qty: number,
  fromUom: string,
  toUom: string,
): { qty: number; factor: number; converted: boolean } {
  const factor = uomConversionFactor(fromUom, toUom);
  if (factor == null || factor === 1) {
    return { qty, factor: 1, converted: false };
  }
  return { qty: qty * factor, factor, converted: true };
}
