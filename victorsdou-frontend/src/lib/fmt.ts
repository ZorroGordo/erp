/**
 * Shared number/currency formatting for the ERP.
 * Uses en-US locale so thousands are "," and decimal is "."
 * e.g.  fmtMoney(1234.5)  →  "S/ 1,234.50"
 *        fmtNum(1234.567)  →  "1,234.57"
 */

const NUM_FMT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INT_FMT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format as Soles: "S/ 1,234.50" */
export function fmtMoney(n: any, symbol = 'S/ '): string {
  return symbol + NUM_FMT.format(Number(n ?? 0));
}

/** Format as plain number with 2 decimals: "1,234.50" */
export function fmtNum(n: any): string {
  return NUM_FMT.format(Number(n ?? 0));
}

/** Format as integer with thousands: "1,234" */
export function fmtInt(n: any): string {
  return INT_FMT.format(Number(n ?? 0));
}
