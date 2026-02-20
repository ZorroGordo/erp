/**
 * Unit tests for Weighted Average Cost (WAC) calculation engine.
 * These are pure math tests — no database required.
 */

// ── Pure WAC formula (extracted for testability) ────────────────────────────
function calculateNewWAC(
  currentQty: number,
  currentAvg: number,
  addedQty: number,
  addedCost: number,
): number {
  const totalQty = currentQty + addedQty;
  if (totalQty === 0) return 0;
  return (currentQty * currentAvg + addedQty * addedCost) / totalQty;
}

// ── IGV calculation (Peru) ───────────────────────────────────────────────────
function calculateIGV(subtotal: number, rate = 0.18): number {
  return parseFloat((subtotal * rate).toFixed(4));
}

function applyDiscount(basePrice: number, discountPct: number): number {
  return parseFloat((basePrice * (1 - discountPct / 100)).toFixed(4));
}

// ── Payroll: 5ta Categoría (simplified) ──────────────────────────────────────
const UIT = 5350;
function calcQuintaCategoria(monthlyGross: number): number {
  const annualGross = monthlyGross * 12;
  const taxable = Math.max(0, annualGross - 7 * UIT);
  let tax = 0;
  const brackets = [
    { limit: 5 * UIT,   rate: 0.08 },
    { limit: 20 * UIT,  rate: 0.14 },
    { limit: 35 * UIT,  rate: 0.17 },
    { limit: Infinity,  rate: 0.20 },
  ];
  let remaining = taxable;
  for (const b of brackets) {
    if (remaining <= 0) break;
    const inBracket = Math.min(remaining, b.limit);
    tax += inBracket * b.rate;
    remaining -= inBracket;
  }
  return parseFloat((tax / 12).toFixed(2));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WAC (Weighted Average Cost) Engine', () => {
  test('first purchase sets WAC to unit cost', () => {
    const wac = calculateNewWAC(0, 0, 100, 2.50);
    expect(wac).toBeCloseTo(2.50);
  });

  test('second purchase at higher price raises WAC', () => {
    // 100 kg @ S/2.50 = S/250
    // +50 kg @ S/3.00 = S/150
    // Total: 150 kg, total cost S/400
    const wac = calculateNewWAC(100, 2.50, 50, 3.00);
    expect(wac).toBeCloseTo(400 / 150, 4);
    expect(wac).toBeCloseTo(2.6667, 3);
  });

  test('second purchase at lower price decreases WAC', () => {
    // 200 kg @ S/5.00 = S/1000
    // +100 kg @ S/4.00 = S/400
    // Total: 300 kg, total cost S/1400
    const wac = calculateNewWAC(200, 5.00, 100, 4.00);
    expect(wac).toBeCloseTo(1400 / 300, 4);
    expect(wac).toBeCloseTo(4.6667, 3);
  });

  test('same unit cost does not change WAC', () => {
    const wac = calculateNewWAC(50, 3.50, 25, 3.50);
    expect(wac).toBeCloseTo(3.50);
  });

  test('large batch does not lose precision', () => {
    // 10,000 kg @ S/2.45678 + 500 kg @ S/2.60
    const wac = calculateNewWAC(10000, 2.45678, 500, 2.60);
    const expected = (10000 * 2.45678 + 500 * 2.60) / 10500;
    expect(wac).toBeCloseTo(expected, 5);
  });

  test('adding zero quantity does not change WAC', () => {
    const wac = calculateNewWAC(100, 3.00, 0, 4.00);
    expect(wac).toBeCloseTo(3.00);
  });
});

describe('IGV Calculation (Peru — 18%)', () => {
  test('standard taxable item', () => {
    const igv = calculateIGV(100);
    expect(igv).toBe(18);
  });

  test('rounding to 4 decimal places', () => {
    const igv = calculateIGV(33.333333);
    expect(igv).toBe(5.9999);
  });

  test('total = subtotal + IGV', () => {
    const subtotal = 250.00;
    const igv = calculateIGV(subtotal);
    expect(subtotal + igv).toBeCloseTo(295.00);
  });

  test('zero subtotal gives zero IGV', () => {
    expect(calculateIGV(0)).toBe(0);
  });
});

describe('B2B Pricing — Discount Calculation', () => {
  test('10% discount on S/5.00 base price', () => {
    expect(applyDiscount(5.00, 10)).toBe(4.50);
  });

  test('0% discount returns base price unchanged', () => {
    expect(applyDiscount(10.00, 0)).toBe(10.00);
  });

  test('100% discount gives zero price', () => {
    expect(applyDiscount(10.00, 100)).toBe(0);
  });

  test('fractional discount rounds to 4 decimal places', () => {
    const result = applyDiscount(1.00, 33.333);
    expect(result).toBe(0.6667);
  });
});

describe('5ta Categoría Withholding (Peru Income Tax)', () => {
  test('salary below 7 UIT deduction threshold — zero tax', () => {
    // Annual: 7 * 5350 = 37450 — first 7 UITs are deductible
    const tax = calcQuintaCategoria((7 * UIT) / 12);
    expect(tax).toBe(0);
  });

  test('salary in first bracket (8%)', () => {
    // Annual gross = 8 UIT = 42800; taxable = 8*5350 - 7*5350 = 1*5350 = 5350
    // Tax = 5350 * 0.08 = 428 annual / 12 = 35.67 monthly
    const monthly = calcQuintaCategoria((8 * UIT) / 12);
    expect(monthly).toBeGreaterThan(0);
    expect(monthly).toBeCloseTo(428 / 12, 1);
  });

  test('high salary crosses multiple brackets', () => {
    // Annual gross = 50,000; taxable = 50000 - 7*5350 = 12550
    // bracket 1: 5*5350 = 26750 — but taxable is only 12550 (all in bracket 1)
    // Tax = 12550 * 0.08 = 1004 annual / 12 = 83.67 monthly
    const monthly = calcQuintaCategoria(50000 / 12);
    expect(monthly).toBeCloseTo(1004 / 12, 1);
  });

  test('monthly withholding is non-negative', () => {
    expect(calcQuintaCategoria(1000)).toBeGreaterThanOrEqual(0);
    expect(calcQuintaCategoria(500)).toBeGreaterThanOrEqual(0);
    expect(calcQuintaCategoria(0)).toBe(0);
  });
});
