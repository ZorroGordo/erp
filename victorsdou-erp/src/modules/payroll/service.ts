import { prisma } from '../../lib/prisma';
import type { PayrollCalculation } from '../../types';

// Configurable rates (should come from system_config in production)
const ESSALUD_RATE   = 0.09;
const AFP_BASE_RATE  = 0.10;     // approximate; varies by AFP
const AFP_COMMISSION = 0.0155;   // approximate mixed commission
const AFP_INSURANCE  = 0.0174;   // approximate premium
const ONP_RATE       = 0.13;
const UIT_2026       = 5350;     // S/ 5,350 (update annually from SUNAT)

function calcQuintaCategoria(grossAnnual: number): number {
  const uitsAnnual = grossAnnual / UIT_2026;
  let tax = 0;
  // Progressive rate: 0–8 UIT = 8%, 8–31 UIT = 14%, 31–45 UIT = 17%, 45–81 UIT = 20%, 81+ = 30%
  const brackets = [
    { max: 7 * UIT_2026,  rate: 0.08 },
    { max: 23 * UIT_2026, rate: 0.14 },
    { max: 14 * UIT_2026, rate: 0.17 },
    { max: 36 * UIT_2026, rate: 0.20 },
    { max: Infinity,      rate: 0.30 },
  ];
  let remaining = Math.max(0, grossAnnual - 7 * UIT_2026); // subtract 7 UIT deduction
  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const inBracket = Math.min(remaining, bracket.max);
    tax += inBracket * bracket.rate;
    remaining -= inBracket;
  }
  return parseFloat((tax / 12).toFixed(2)); // monthly withholding
}

export async function calculatePayslip(employeeId: string, periodId: string): Promise<PayrollCalculation> {
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const overtime = await prisma.overtimeRecord.findMany({
    where: { employeeId, date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
  });

  const hourlyRate = employee.baseSalary.toNumber() / 30 / 8;
  const ot25 = overtime.reduce((s, o) => s + o.overtime25.toNumber() * hourlyRate * 1.25, 0);
  const ot35 = overtime.reduce((s, o) => s + o.overtime35.toNumber() * hourlyRate * 1.35, 0);
  const gross = employee.baseSalary.toNumber() + ot25 + ot35;

  const afpDeduction = employee.pensionSystem === 'AFP'
    ? parseFloat(((AFP_BASE_RATE + AFP_COMMISSION + AFP_INSURANCE) * gross).toFixed(2))
    : 0;
  const onpDeduction = employee.pensionSystem === 'ONP' ? parseFloat((ONP_RATE * gross).toFixed(2)) : 0;
  const igv5ta = calcQuintaCategoria(gross * 12);
  const essalud = parseFloat((ESSALUD_RATE * gross).toFixed(2));
  const cts = parseFloat((gross / 12).toFixed(2));
  const vacaciones = parseFloat((gross / 12).toFixed(2));
  const gratificacion = parseFloat((gross / 6).toFixed(2)); // biannual provision monthly

  return {
    employeeId,
    grossSalary: gross,
    additions: { overtime25: ot25, overtime35: ot35, bonuses: 0 },
    deductions: { afpOrOnp: afpDeduction || onpDeduction, afpCommission: 0, afpInsurance: 0, igv5taCategoria: igv5ta, otherDeductions: 0 },
    employerContributions: { essalud, sctr: 0 },
    provisions: { cts, vacaciones, gratificacion },
    netSalary: parseFloat((gross - afpDeduction - onpDeduction - igv5ta).toFixed(2)),
    employerTotalCost: parseFloat((gross + essalud + cts + vacaciones + gratificacion).toFixed(2)),
  };
}
