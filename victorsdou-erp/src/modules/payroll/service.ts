import { prisma } from '../../lib/prisma';
import type { PayrollCalculation } from '../../types';

// ─── Peru Payroll Constants 2026 ─────────────────────────────────────────────
const ESSALUD_RATE = 0.09;   // Employer contribution to EsSalud
const ONP_RATE     = 0.13;   // Sistema Nacional de Pensiones (employee)
const UIT_2026     = 5350;   // S/ 5,350 — update each year from SUNAT

// AFP rates by fund name (employee contribution breakdown)
// Source: SBS Peru — comisiones vigentes 2025–2026
const AFP_RATES: Record<string, { fund: number; commission: number; insurance: number }> = {
  'AFP Integra':   { fund: 0.10, commission: 0.01530, insurance: 0.01841 },
  'Prima AFP':     { fund: 0.10, commission: 0.01600, insurance: 0.01841 },
  'Profuturo AFP': { fund: 0.10, commission: 0.01570, insurance: 0.01841 },
  'Habitat AFP':   { fund: 0.10, commission: 0.01250, insurance: 0.01841 },
};
const AFP_DEFAULT = { fund: 0.10, commission: 0.01550, insurance: 0.01841 };

/**
 * Quinta categoría (income tax) — Peru SUNAT.
 * Steps:
 *   1. Project gross annual salary
 *   2. Deduct 7 UIT (personal deduction)
 *   3. Apply progressive brackets on net taxable income
 *   4. Divide annual tax by 12 for monthly withholding
 */
function calcQuintaCategoria(grossAnnual: number): number {
  const deduction = 7 * UIT_2026;
  const taxableNet = Math.max(0, grossAnnual - deduction);
  if (taxableNet === 0) return 0;

  // SUNAT progressive brackets (width in soles, applied sequentially)
  const brackets = [
    { width:  5 * UIT_2026, rate: 0.08 },
    { width: 15 * UIT_2026, rate: 0.14 },
    { width: 15 * UIT_2026, rate: 0.17 },
    { width: 10 * UIT_2026, rate: 0.20 },
    { width: Infinity,      rate: 0.30 },
  ];

  let tax = 0;
  let remaining = taxableNet;
  for (const b of brackets) {
    if (remaining <= 0) break;
    const inBracket = Math.min(remaining, b.width);
    tax += inBracket * b.rate;
    remaining -= inBracket;
  }
  return parseFloat((tax / 12).toFixed(2));
}

/**
 * RxH (Recibo por Honorarios) calculation.
 * - IR retention: 8% if gross > S/ 1,500/month
 * - No EsSalud, no CTS, no vacaciones, no gratificación
 */
function calcRxH(employeeId: string, gross: number): PayrollCalculation {
  const irRetention = gross > 1500 ? parseFloat((gross * 0.08).toFixed(2)) : 0;
  return {
    employeeId,
    grossSalary: gross,
    additions:  { overtime25: 0, overtime35: 0, holidayPay: 0, bonuses: 0 },
    deductions: { afpOrOnp: 0, afpCommission: 0, afpInsurance: 0, igv5taCategoria: 0, irRxH: irRetention, otherDeductions: 0 },
    employerContributions: { essalud: 0, sctr: 0 },
    provisions: { cts: 0, vacaciones: 0, gratificacion: 0 },
    netSalary: parseFloat((gross - irRetention).toFixed(2)),
    employerTotalCost: gross,
  };
}

export async function calculatePayslip(
  employeeId: string,
  periodId: string,
  manualBonuses = 0,
  manualDeductions = 0,
): Promise<PayrollCalculation> {
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });

  // ── Fetch pay period to get correct date range ──────────────────────────────
  const period = await prisma.payPeriod.findUniqueOrThrow({ where: { id: periodId } });
  const periodStart = new Date(period.year, period.month - 1, 1);
  const periodEnd   = new Date(period.year, period.month, 1); // exclusive

  // ── Overtime for this period ─────────────────────────────────────────────────
  const overtime = await prisma.overtimeRecord.findMany({
    where: { employeeId, date: { gte: periodStart, lt: periodEnd } },
  });

  const hourlyRate = employee.baseSalary.toNumber() / 30 / 8;

  const ot25     = overtime.reduce((s, o) => s + o.overtime25.toNumber() * hourlyRate * 1.25, 0);
  const ot35     = overtime.reduce((s, o) => s + o.overtime35.toNumber() * hourlyRate * 1.35, 0);
  // Holiday work: 100% surcharge = pay double (the regular pay + 100% surcharge)
  const holiday  = overtime
    .filter(o => o.isHoliday)
    .reduce((s, o) => s + o.holidayHours.toNumber() * hourlyRate * 2.0, 0);

  const gross = parseFloat((employee.baseSalary.toNumber() + ot25 + ot35 + holiday).toFixed(2));

  // ── RxH path ────────────────────────────────────────────────────────────────
  if ((employee as any).employmentType === 'RXH') {
    return calcRxH(employeeId, gross);
  }

  // ── Planilla path ────────────────────────────────────────────────────────────
  const afpRates = employee.afpName
    ? (AFP_RATES[employee.afpName] ?? AFP_DEFAULT)
    : AFP_DEFAULT;

  let afpFund       = 0;
  let afpCommission = 0;
  let afpInsurance  = 0;
  let onpDeduction  = 0;

  if (employee.pensionSystem === 'AFP') {
    afpFund       = parseFloat((afpRates.fund       * gross).toFixed(2));
    afpCommission = parseFloat((afpRates.commission * gross).toFixed(2));
    afpInsurance  = parseFloat((afpRates.insurance  * gross).toFixed(2));
  } else {
    onpDeduction = parseFloat((ONP_RATE * gross).toFixed(2));
  }

  const pensionDeduction = afpFund + afpCommission + afpInsurance + onpDeduction;
  const igv5ta    = calcQuintaCategoria(gross * 12);
  const essalud   = parseFloat((ESSALUD_RATE * gross).toFixed(2));
  const cts       = parseFloat((gross / 12).toFixed(2));          // monthly CTS provision (1/12)
  const vacacion  = parseFloat((gross / 12).toFixed(2));          // vacation provision (1/12)
  const gratif    = parseFloat((gross / 6).toFixed(2));           // gratificación provision (1/6 biannual)

  return {
    employeeId,
    grossSalary: gross,
    additions: { overtime25: parseFloat(ot25.toFixed(2)), overtime35: parseFloat(ot35.toFixed(2)), holidayPay: parseFloat(holiday.toFixed(2)), bonuses: 0 },
    deductions: { afpOrOnp: pensionDeduction, afpCommission, afpInsurance, igv5taCategoria: igv5ta, irRxH: 0, otherDeductions: 0 },
    employerContributions: { essalud, sctr: 0 },
    provisions: { cts, vacaciones: vacacion, gratificacion: gratif },
    netSalary: parseFloat((gross - pensionDeduction - igv5ta).toFixed(2)),
    employerTotalCost: parseFloat((gross + essalud + cts + vacacion + gratif).toFixed(2)),
  };
}
