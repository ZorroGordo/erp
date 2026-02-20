import { prisma } from '../../lib/prisma';
import type { JournalEntryInput } from '../../types';
import { SourceModule } from '@prisma/client';

export async function postJournalEntry(input: JournalEntryInput, createdBy: string) {
  // Validate double-entry
  const totalDebit  = input.lines.reduce((s, l) => s + (l.debit  ?? 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw Object.assign(new Error(`Journal entry is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`), {
      statusCode: 422, code: 'UNBALANCED_JOURNAL',
    });
  }

  // Resolve period
  const d = input.entryDate;
  const period = await prisma.accountingPeriod.upsert({
    where: { year_month: { year: d.getFullYear(), month: d.getMonth() + 1 } },
    create: { year: d.getFullYear(), month: d.getMonth() + 1 },
    update: {},
  });

  if (period.status === 'CLOSED') {
    throw Object.assign(new Error('Accounting period is closed'), { statusCode: 422, code: 'PERIOD_CLOSED' });
  }

  // Resolve accounts
  const accountCodes = input.lines.map((l) => l.accountCode);
  const accounts = await prisma.chartOfAccount.findMany({ where: { code: { in: accountCodes } } });
  const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

  return prisma.journalEntry.create({
    data: {
      entryNumber:  `JE-${Date.now()}`,
      entryDate:    input.entryDate,
      periodId:     period.id,
      description:  input.description,
      sourceModule: input.sourceModule as SourceModule,
      sourceDocId:  input.sourceDocId,
      status:       'POSTED',
      totalDebit,
      totalCredit,
      createdBy,
      lines: {
        create: input.lines.map((l) => ({
          accountId:   accountMap.get(l.accountCode)!,
          debit:       l.debit  ?? 0,
          credit:      l.credit ?? 0,
          description: l.description,
        })),
      },
    },
    include: { lines: { include: { account: true } } },
  });
}

export async function getPLStatement(periodId: string) {
  const period = await prisma.accountingPeriod.findUniqueOrThrow({ where: { id: periodId } });
  const lines = await prisma.journalLine.findMany({
    where: { entry: { periodId, status: 'POSTED' } },
    include: { account: true },
  });
  const accounts = new Map<string, { name: string; type: string; balance: number }>();
  for (const line of lines) {
    const key = line.account.code;
    if (!accounts.has(key)) accounts.set(key, { name: line.account.name, type: line.account.type, balance: 0 });
    const entry = accounts.get(key)!;
    if (line.account.normalBalance === 'DEBIT')  entry.balance += line.debit.toNumber()  - line.credit.toNumber();
    else                                          entry.balance += line.credit.toNumber() - line.debit.toNumber();
  }
  const revenue  = [...accounts.values()].filter((a) => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0);
  const expenses = [...accounts.values()].filter((a) => a.type === 'EXPENSE').reduce((s, a) => s + a.balance, 0);
  return { period: `${period.year}-${String(period.month).padStart(2, '0')}`, revenue, expenses, netIncome: revenue - expenses, accounts: Object.fromEntries(accounts) };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PCGE FINANCIAL STATEMENTS — V2
//  Follows Plan Contable General Empresarial (Peru) + NIC standards
// ═══════════════════════════════════════════════════════════════════════════

function firstDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

interface AccountBalance {
  name: string;
  type: string;
  normalBalance: string;
  debit: number;
  credit: number;
  netBalance: number;
}

/**
 * Aggregate POSTED journal lines within [startDate, endDate] into per-account balances.
 * netBalance is expressed as positive on the normal side (debit accounts: debit-credit; credit accounts: credit-debit).
 */
async function getAccountBalances(
  endDate: Date,
  startDate: Date = new Date(0),
): Promise<Map<string, AccountBalance>> {
  const lines = await prisma.journalLine.findMany({
    where: {
      entry: {
        status: 'POSTED',
        entryDate: { gte: startDate, lte: endDate },
      },
    },
    select: {
      debit:   true,
      credit:  true,
      account: { select: { code: true, name: true, type: true, normalBalance: true } },
    },
  });

  const map = new Map<string, AccountBalance>();
  for (const line of lines) {
    const { code, name, type, normalBalance } = line.account;
    if (!map.has(code)) map.set(code, { name, type, normalBalance, debit: 0, credit: 0, netBalance: 0 });
    const entry = map.get(code)!;
    const d = line.debit.toNumber();
    const c = line.credit.toNumber();
    entry.debit  += d;
    entry.credit += c;
    entry.netBalance += normalBalance === 'DEBIT' ? (d - c) : (c - d);
  }
  return map;
}

/** Sum netBalance for accounts whose code starts with any of the given prefixes. */
function sumByPrefixes(map: Map<string, AccountBalance>, prefixes: string[]): number {
  let total = 0;
  for (const [code, bal] of map) {
    if (prefixes.some(p => code.startsWith(p))) total += bal.netBalance;
  }
  return total;
}

/** Extract line items for given prefixes, sorted by code, non-zero only. */
function lineItems(
  map: Map<string, AccountBalance>,
  prefixes: string[],
): Array<{ code: string; name: string; balance: number }> {
  const items: Array<{ code: string; name: string; balance: number }> = [];
  for (const [code, bal] of map) {
    if (prefixes.some(p => code.startsWith(p)) && Math.abs(bal.netBalance) > 0.001) {
      items.push({ code, name: bal.name, balance: bal.netBalance });
    }
  }
  return items.sort((a, b) => a.code.localeCompare(b.code));
}

// ─── Estado de Resultados (P&L) ───────────────────────────────────────────

export async function getPLStatementV2(
  year: number,
  month: number,
  mode: 'monthly' | 'ytd' | 'annual' = 'monthly',
) {
  let startDate: Date;
  let endDate: Date;

  if (mode === 'monthly') {
    startDate = firstDayOfMonth(year, month);
    endDate   = lastDayOfMonth(year, month);
  } else if (mode === 'ytd') {
    startDate = firstDayOfMonth(year, 1);
    endDate   = lastDayOfMonth(year, month);
  } else {
    startDate = firstDayOfMonth(year, 1);
    endDate   = lastDayOfMonth(year, 12);
  }

  const bal = await getAccountBalances(endDate, startDate);

  // Revenue
  const ventasItems          = lineItems(bal, ['70', '71', '72']);
  const otrosIngresosItems   = lineItems(bal, ['74', '75', '76', '78', '79']);
  const ingresosFinancItems  = lineItems(bal, ['77']);
  const totalVentas          = ventasItems.reduce((s, i) => s + i.balance, 0);
  const totalOtrosIngresos   = otrosIngresosItems.reduce((s, i) => s + i.balance, 0);
  const totalIngresosFinanc  = ingresosFinancItems.reduce((s, i) => s + i.balance, 0);

  // Cost of Sales
  const costoVentasItems = lineItems(bal, ['69']);
  const totalCostoVentas = costoVentasItems.reduce((s, i) => s + i.balance, 0);
  const utilidadBruta    = totalVentas - totalCostoVentas;

  // Operating Expenses (by nature — standard for Peruvian SMBs)
  const gastosPersonalItems = lineItems(bal, ['62']);
  const gastosDiversosItems = lineItems(bal, ['60', '61', '63', '64', '65', '66']);
  const deprecAmortItems    = lineItems(bal, ['68']);
  const totalGastosPersonal = gastosPersonalItems.reduce((s, i) => s + i.balance, 0);
  const totalGastosDiversos = gastosDiversosItems.reduce((s, i) => s + i.balance, 0);
  const totalDeprecAmort    = deprecAmortItems.reduce((s, i) => s + i.balance, 0);
  const totalGastosOp       = totalGastosPersonal + totalGastosDiversos + totalDeprecAmort;

  const utilidadOperativa = utilidadBruta + totalOtrosIngresos - totalGastosOp;

  // Financial
  const gastosFinancItems  = lineItems(bal, ['67']);
  const totalGastosFinanc  = gastosFinancItems.reduce((s, i) => s + i.balance, 0);
  const utilidadAntesIR    = utilidadOperativa + totalIngresosFinanc - totalGastosFinanc;

  // Income Tax
  const impuestoItems  = lineItems(bal, ['88']);
  const totalImpuesto  = impuestoItems.reduce((s, i) => s + i.balance, 0);
  const utilidadNeta   = utilidadAntesIR - totalImpuesto;

  // Prior year comparison (same period, one year back)
  const priorStart = new Date(startDate); priorStart.setUTCFullYear(startDate.getUTCFullYear() - 1);
  const priorEnd   = new Date(endDate);   priorEnd.setUTCFullYear(endDate.getUTCFullYear() - 1);
  const prior      = await getAccountBalances(priorEnd, priorStart);

  const priorVentas     = sumByPrefixes(prior, ['70', '71', '72']);
  const priorCosto      = sumByPrefixes(prior, ['69']);
  const priorUtilBruta  = priorVentas - priorCosto;
  const priorGastosOp   = sumByPrefixes(prior, ['60','61','62','63','64','65','66','68']);
  const priorOtrosIngr  = sumByPrefixes(prior, ['74','75','76','78','79']);
  const priorUtilOp     = priorUtilBruta + priorOtrosIngr - priorGastosOp;
  const priorIngFinanc  = sumByPrefixes(prior, ['77']);
  const priorGasFinanc  = sumByPrefixes(prior, ['67']);
  const priorIR         = sumByPrefixes(prior, ['88']);
  const priorUtilNeta   = priorUtilOp + priorIngFinanc - priorGasFinanc - priorIR;

  return {
    meta: { year, month, mode, startDate, endDate },
    ventas:              { items: ventasItems,         total: totalVentas,         prior: priorVentas },
    costoVentas:         { items: costoVentasItems,    total: totalCostoVentas,    prior: priorCosto },
    utilidadBruta:       { total: utilidadBruta,       prior: priorUtilBruta },
    otrosIngresos:       { items: otrosIngresosItems,  total: totalOtrosIngresos },
    gastosPersonal:      { items: gastosPersonalItems, total: totalGastosPersonal },
    gastosDiversos:      { items: gastosDiversosItems, total: totalGastosDiversos },
    deprecAmort:         { items: deprecAmortItems,    total: totalDeprecAmort },
    totalGastosOperativos: { total: totalGastosOp },
    utilidadOperativa:   { total: utilidadOperativa,   prior: priorUtilOp },
    ingresosFinancieros: { items: ingresosFinancItems, total: totalIngresosFinanc, prior: priorIngFinanc },
    gastosFinancieros:   { items: gastosFinancItems,   total: totalGastosFinanc,   prior: priorGasFinanc },
    utilidadAntesIR:     { total: utilidadAntesIR },
    impuestoRenta:       { items: impuestoItems,        total: totalImpuesto,      prior: priorIR },
    utilidadNeta:        { total: utilidadNeta,         prior: priorUtilNeta },
  };
}

// ─── Estado de Situación Financiera (Balance Sheet) ───────────────────────

export async function getBalanceSheet(year: number, month: number) {
  const endDate = lastDayOfMonth(year, month);
  // Balance sheet accounts are cumulative from inception
  const bal = await getAccountBalances(endDate, new Date(0));

  // ── ACTIVO ────────────────────────────────────────────────────────────
  // Activo Corriente
  const cajaItems         = lineItems(bal, ['10']);         // Efectivo y equivalentes
  const cuentasCobrarItems= lineItems(bal, ['12', '13']);   // Cuentas por cobrar comerciales
  const existenciasItems  = lineItems(bal, ['20', '21', '24', '25']); // Inventarios
  const otrosACteItems    = lineItems(bal, ['14', '16', '17', '18', '19']); // Otros activos cte

  const totalCaja          = cajaItems.reduce((s, i) => s + i.balance, 0);
  const totalCuentasCobrar = cuentasCobrarItems.reduce((s, i) => s + i.balance, 0);
  const totalExistencias   = existenciasItems.reduce((s, i) => s + i.balance, 0);
  const totalOtrosACte     = otrosACteItems.reduce((s, i) => s + i.balance, 0);
  const totalActivoCorriente = totalCaja + totalCuentasCobrar + totalExistencias + totalOtrosACte;

  // Activo No Corriente
  const activoFijoItems   = lineItems(bal, ['32', '33']); // Inmuebles, maquinaria y equipo
  const intangiblesItems  = lineItems(bal, ['34']);        // Intangibles
  const deprecAcumItems   = lineItems(bal, ['39']);        // Depreciación acumulada (contra-activo, credit normal)
  const otrosANCItems     = lineItems(bal, ['30', '31', '35', '36', '37', '38']);

  const totalActivoFijo   = activoFijoItems.reduce((s, i) => s + i.balance, 0);
  const totalIntangibles  = intangiblesItems.reduce((s, i) => s + i.balance, 0);
  const totalDeprecAcum   = deprecAcumItems.reduce((s, i) => s + i.balance, 0); // already computed with credit normalBalance
  const totalOtrosANC     = otrosANCItems.reduce((s, i) => s + i.balance, 0);
  const totalActivoNoCorriente = totalActivoFijo + totalIntangibles + totalDeprecAcum + totalOtrosANC;

  const totalActivo = totalActivoCorriente + totalActivoNoCorriente;

  // ── PASIVO ────────────────────────────────────────────────────────────
  // Pasivo Corriente
  const cuentasPagarItems  = lineItems(bal, ['42']);          // Proveedores
  const tributosItems      = lineItems(bal, ['40']);          // Tributos por pagar
  const remunerItems       = lineItems(bal, ['41']);          // Remuneraciones por pagar
  const otrosPasivoCteItems = lineItems(bal, ['43', '44']);   // Otras cuentas por pagar CP

  const totalCuentasPagar  = cuentasPagarItems.reduce((s, i) => s + i.balance, 0);
  const totalTributos      = tributosItems.reduce((s, i) => s + i.balance, 0);
  const totalRemuner       = remunerItems.reduce((s, i) => s + i.balance, 0);
  const totalOtrosPCte     = otrosPasivoCteItems.reduce((s, i) => s + i.balance, 0);
  const totalPasivoCorriente = totalCuentasPagar + totalTributos + totalRemuner + totalOtrosPCte;

  // Pasivo No Corriente
  const obligFinancItems   = lineItems(bal, ['45', '46']);    // Deudas financieras LP
  const otrosPasivoNCItems = lineItems(bal, ['47', '48', '49']); // Otros pasivos NC

  const totalObligFinanc   = obligFinancItems.reduce((s, i) => s + i.balance, 0);
  const totalOtrosPNC      = otrosPasivoNCItems.reduce((s, i) => s + i.balance, 0);
  const totalPasivoNoCorriente = totalObligFinanc + totalOtrosPNC;

  const totalPasivo = totalPasivoCorriente + totalPasivoNoCorriente;

  // ── PATRIMONIO ────────────────────────────────────────────────────────
  const capitalItems   = lineItems(bal, ['50', '51', '52']); // Capital social + aportes
  const reservasItems  = lineItems(bal, ['57', '58']);        // Reservas
  const resultAntItems = lineItems(bal, ['59']);              // Resultados acumulados

  // Resultado del ejercicio: net of revenue and expense accounts (classes 7, 6, 8)
  const resultPeriodo = sumByPrefixes(bal, ['70','71','72','74','75','76','77','78','79'])
                      - sumByPrefixes(bal, ['60','61','62','63','64','65','66','67','68','69','88']);

  const totalCapital   = capitalItems.reduce((s, i) => s + i.balance, 0);
  const totalReservas  = reservasItems.reduce((s, i) => s + i.balance, 0);
  const totalResultAnt = resultAntItems.reduce((s, i) => s + i.balance, 0);
  const totalPatrimonio = totalCapital + totalReservas + totalResultAnt + resultPeriodo;

  const totalPasivoPatrimonio = totalPasivo + totalPatrimonio;

  return {
    meta: { year, month, endDate },
    activo: {
      corriente: {
        efectivo:       { items: cajaItems,          total: totalCaja },
        cuentasCobrar:  { items: cuentasCobrarItems, total: totalCuentasCobrar },
        existencias:    { items: existenciasItems,   total: totalExistencias },
        otros:          { items: otrosACteItems,     total: totalOtrosACte },
        total: totalActivoCorriente,
      },
      noCorriente: {
        activoFijo:     { items: activoFijoItems,  total: totalActivoFijo },
        intangibles:    { items: intangiblesItems,  total: totalIntangibles },
        depreciacion:   { items: deprecAcumItems,   total: totalDeprecAcum },
        otros:          { items: otrosANCItems,     total: totalOtrosANC },
        total: totalActivoNoCorriente,
      },
      total: totalActivo,
    },
    pasivo: {
      corriente: {
        cuentasPagar:    { items: cuentasPagarItems,   total: totalCuentasPagar },
        tributos:        { items: tributosItems,        total: totalTributos },
        remuneraciones:  { items: remunerItems,         total: totalRemuner },
        otros:           { items: otrosPasivoCteItems,  total: totalOtrosPCte },
        total: totalPasivoCorriente,
      },
      noCorriente: {
        obligacionesFinancieras: { items: obligFinancItems,    total: totalObligFinanc },
        otros:                   { items: otrosPasivoNCItems,  total: totalOtrosPNC },
        total: totalPasivoNoCorriente,
      },
      total: totalPasivo,
    },
    patrimonio: {
      capital:              { items: capitalItems,   total: totalCapital },
      reservas:             { items: reservasItems,  total: totalReservas },
      resultadosAcumulados: { items: resultAntItems, total: totalResultAnt },
      resultadoPeriodo:     { total: resultPeriodo },
      total: totalPatrimonio,
    },
    totalPasivoPatrimonio,
    ecuacionContable: {
      activo:            totalActivo,
      pasivoPatrimonio:  totalPasivoPatrimonio,
      balanced:          Math.abs(totalActivo - totalPasivoPatrimonio) < 1,
    },
  };
}

// ─── Estado de Flujos de Efectivo (Cash Flow — indirect method, NIC 7) ───

export async function getCashFlow(
  year: number,
  month: number,
  mode: 'monthly' | 'ytd' | 'annual' = 'monthly',
) {
  let startDate: Date;
  let endDate: Date;

  if (mode === 'monthly') {
    startDate = firstDayOfMonth(year, month);
    endDate   = lastDayOfMonth(year, month);
  } else if (mode === 'ytd') {
    startDate = firstDayOfMonth(year, 1);
    endDate   = lastDayOfMonth(year, month);
  } else {
    startDate = firstDayOfMonth(year, 1);
    endDate   = lastDayOfMonth(year, 12);
  }

  // Balance-sheet snapshots: one day before period start (opening) vs period end (closing)
  const prevDay = new Date(startDate); prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const openBal   = await getAccountBalances(prevDay, new Date(0));
  const closeBal  = await getAccountBalances(endDate, new Date(0));
  const periodBal = await getAccountBalances(endDate, startDate);

  // Net income for the period
  const netIncome = sumByPrefixes(periodBal, ['70','71','72','74','75','76','77','78','79'])
                  - sumByPrefixes(periodBal, ['60','61','62','63','64','65','66','67','68','69','88']);

  function bsChange(prefixes: string[]): number {
    return sumByPrefixes(closeBal, prefixes) - sumByPrefixes(openBal, prefixes);
  }

  // ── A) Actividades de Operación ───────────────────────────────────────
  const deprecAmort      = sumByPrefixes(periodBal, ['68']); // Non-cash; add back
  const deltaAR          = bsChange(['12', '13']);    // ↑AR = cash outflow → negate
  const deltaInventory   = bsChange(['20','21','24','25']); // ↑Inventory = outflow
  const deltaOtherCA     = bsChange(['14','16','17','18','19']);
  const deltaAP          = bsChange(['42']);           // ↑AP = inflow
  const deltaTributos    = bsChange(['40']);
  const deltaRemuner     = bsChange(['41']);
  const deltaOtherCL     = bsChange(['43','44']);

  const cashOp = netIncome + deprecAmort
               - deltaAR - deltaInventory - deltaOtherCA
               + deltaAP + deltaTributos + deltaRemuner + deltaOtherCL;

  // ── B) Actividades de Inversión ───────────────────────────────────────
  const deltaFixedAssets = bsChange(['32','33','34']);  // ↑CapEx = outflow
  const cashInv = -deltaFixedAssets;

  // ── C) Actividades de Financiamiento ─────────────────────────────────
  const deltaLoans   = bsChange(['45','46']);
  const deltaEquity  = bsChange(['50','51','52']);
  const deltaRetained = bsChange(['59']);
  const cashFin = deltaLoans + deltaEquity + deltaRetained;

  const netChange    = cashOp + cashInv + cashFin;
  const openingCash  = sumByPrefixes(openBal, ['10']);
  const closingCash  = sumByPrefixes(closeBal, ['10']);

  return {
    meta: { year, month, mode, startDate, endDate },
    operaciones: {
      utilidadNeta:    netIncome,
      ajustes: {
        depreciacionAmortizacion: deprecAmort,
      },
      capitalTrabajo: {
        cuentasCobrar:    -deltaAR,
        inventarios:      -deltaInventory,
        otrosActivosCte:  -deltaOtherCA,
        cuentasPagar:     deltaAP,
        tributosXPagar:   deltaTributos,
        remuneraciones:   deltaRemuner,
        otrosPasivos:     deltaOtherCL,
      },
      total: cashOp,
    },
    inversion: {
      activoFijo:        -deltaFixedAssets,
      total: cashInv,
    },
    financiamiento: {
      deudas:            deltaLoans,
      aporteCapital:     deltaEquity,
      resultados:        deltaRetained,
      total: cashFin,
    },
    variacionNeta:  netChange,
    efectivoInicial: openingCash,
    efectivoFinal:   closingCash,
    conciliacion:    Math.abs(closingCash - openingCash - netChange) < 1,
  };
}
