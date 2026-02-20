/**
 * seed2025.ts
 * Inserts 2025 historical journal entries from EEFF Victor Dou SAC P&L.
 * Run with:  npx tsx scripts/seed2025.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── 2025 Monthly data (net, sin IGV) ─────────────────────────────────────────
// Index 0 = January, 11 = December
const SUPERMERCADOS   = [17931.14,14400.00,15184.87,31115.41,35469.04,54102.51,47603.71,65648.00,47647.00,19084.20,19802.00,25139.00];
const TIENDAS_NAT     = [21827.83,15577.90,17652.54,18463.54,18739.69,23207.91,25444.00,25520.00,26595.00,26670.00,25834.00,26170.00];
const CAFETERIAS      = [ 9267.77, 9216.92,10451.90, 5097.42,  413.05, 9146.14, 9931.00,10994.00,11107.00, 9828.00, 8834.00, 9954.00];
const SAN_DOU         = [15747.68, 7166.42, 1472.98,11120.54,18517.00, 1456.13, 2573.00, 2812.00, 2910.00, 2225.00, 2033.00,  411.00];
const RESTAURANTES    = [ 1196.95,  494.37, 1281.28,  621.17,  262.31, 3180.81, 1903.00, 1957.00, 1811.00, 2995.00, 3149.00, 2373.00];
const HOTELES         = [    0.00,  110.59,   86.02,   36.86,    0.00,  214.83,  159.00,  129.00,  146.00,  156.00,   56.00,  124.00];
const OTROS           = [    0.00,    0.00,  236.03,   39.62,    0.00,   81.39,    0.00,    0.00,    0.00,    0.00,    0.00,    0.00];

const COGS_TOT        = [44334.85,38175.50,47970.02,50241.03,56906.00,64066.83,55433.51,52992.31,55925.33,44608.17,41456.10,43738.04];
const SELLING_OPEX    = [13275.91,17530.13,16986.49,16500.49,24064.05,25275.87,21208.68,21369.26,17469.40,16752.37,15358.76,14093.12];
const ADMIN_OPEX      = [  925.13,  571.38,11907.12, 9558.72,13423.59,11657.47,11656.35,11575.93,12698.37,13204.75,14575.27,17016.21];

// ── New revenue sub-accounts to create ───────────────────────────────────────
const NEW_ACCOUNTS = [
  { code: '701', name: 'Ventas Supermercados',     type: 'REVENUE', normalBalance: 'CREDIT', parentCode: '70' },
  { code: '702', name: 'Ventas Tiendas Naturistas', type: 'REVENUE', normalBalance: 'CREDIT', parentCode: '70' },
  { code: '703', name: 'Ventas Cafeterías',         type: 'REVENUE', normalBalance: 'CREDIT', parentCode: '70' },
  { code: '704', name: 'Ventas San Dou (B2C)',      type: 'REVENUE', normalBalance: 'CREDIT', parentCode: '70' },
  { code: '705', name: 'Ventas Restaurantes',       type: 'REVENUE', normalBalance: 'CREDIT', parentCode: '70' },
  { code: '706', name: 'Ventas Hoteles',            type: 'REVENUE', normalBalance: 'CREDIT', parentCode: '70' },
  { code: '709', name: 'Ventas Otros Canales',      type: 'REVENUE', normalBalance: 'CREDIT', parentCode: '70' },
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function main() {
  console.log('🌱 seed2025.ts — inserting 2025 historical journal entries\n');

  // ── 1. Upsert new revenue sub-accounts ─────────────────────────────────────
  console.log('Creating/verifying revenue sub-accounts...');
  for (const acct of NEW_ACCOUNTS) {
    const existing = await prisma.chartOfAccount.findUnique({ where: { code: acct.code } });
    if (!existing) {
      await prisma.chartOfAccount.create({
        data: {
          code:            acct.code,
          name:            acct.name,
          type:            acct.type,
          normalBalance:   acct.normalBalance,
          parentCode:      acct.parentCode,
          isActive:        true,
          allowDirectPost: true,
          description:     `Cuenta de ingresos 2025 — ${acct.name}`,
        },
      });
      console.log(`  ✔ Created ${acct.code} — ${acct.name}`);
    } else {
      console.log(`  · ${acct.code} already exists — skipping`);
    }
  }

  // ── 2. Resolve account IDs for GL lines ────────────────────────────────────
  const acctMap: Record<string, string> = {};
  const codesToResolve = ['121','42','69','65','701','702','703','704','705','706','709'];
  for (const code of codesToResolve) {
    const a = await prisma.chartOfAccount.findUnique({ where: { code } });
    if (!a) throw new Error(`Account ${code} not found — run accounting seed first`);
    acctMap[code] = a.id;
  }
  console.log('\nAccount IDs resolved ✔');

  // ── 3. Get admin user ID ───────────────────────────────────────────────────
  const adminUser = await prisma.user.findFirst({
    where: { roles: { has: 'SUPER_ADMIN' as any } },
    orderBy: { createdAt: 'asc' },
  });
  if (!adminUser) throw new Error('No SUPER_ADMIN user found');
  const createdBy = adminUser.id;
  console.log(`Using admin user: ${adminUser.email}\n`);

  // ── 4. Counter for unique entry numbers ────────────────────────────────────
  // Find the highest existing entryNumber and continue from there
  const lastEntry = await prisma.journalEntry.findFirst({
    where: { entryNumber: { startsWith: 'MAN-2025-' } },
    orderBy: { entryNumber: 'desc' },
  });
  let counter = 1;
  if (lastEntry) {
    const n = parseInt(lastEntry.entryNumber.split('-').pop() ?? '0', 10);
    counter = n + 1;
    console.log(`Resuming from entry number MAN-2025-${String(counter).padStart(4,'0')}`);
  }

  // ── 5. Loop through each month ─────────────────────────────────────────────
  for (let mi = 0; mi < 12; mi++) {
    const month = mi + 1; // 1-indexed
    const year  = 2025;
    const monthLabel = new Date(year, mi, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });

    console.log(`\n── ${monthLabel.toUpperCase()} ────────────────────────────`);

    // Ensure period exists
    let period = await prisma.accountingPeriod.findUnique({ where: { year_month: { year, month } } });
    if (!period) {
      period = await prisma.accountingPeriod.create({ data: { year, month, status: 'CLOSED', closedAt: new Date(`2025-${String(month).padStart(2,'0')}-28`) } });
      console.log(`  Created period ${year}-${String(month).padStart(2,'0')}`);
    } else {
      // Close it if open
      if (period.status !== 'CLOSED') {
        await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      }
      console.log(`  Period ${year}-${String(month).padStart(2,'0')} already exists`);
    }

    const entryDate = new Date(year, mi, 28); // last working day approx

    // ── Entry 1: Revenue ────────────────────────────────────────────────────
    const revChannels = [
      { code: '701', amount: SUPERMERCADOS[mi] },
      { code: '702', amount: TIENDAS_NAT[mi]   },
      { code: '703', amount: CAFETERIAS[mi]     },
      { code: '704', amount: SAN_DOU[mi]        },
      { code: '705', amount: RESTAURANTES[mi]   },
      { code: '706', amount: HOTELES[mi]        },
      { code: '709', amount: OTROS[mi]          },
    ].filter(c => c.amount > 0);

    const totalRevenue = round2(revChannels.reduce((s, c) => s + c.amount, 0));

    const entryNum1 = `MAN-2025-${String(counter++).padStart(4,'0')}`;
    await prisma.journalEntry.create({
      data: {
        entryNumber:  entryNum1,
        entryDate,
        periodId:     period.id,
        description:  `Ingresos por ventas — ${monthLabel} 2025`,
        sourceModule: 'MANUAL',
        status:       'POSTED',
        totalDebit:   totalRevenue,
        totalCredit:  totalRevenue,
        createdBy,
        lines: {
          create: [
            // DEBIT: 121 Cuentas por Cobrar — total revenue
            {
              accountId:   acctMap['121'],
              debit:       totalRevenue,
              credit:      0,
              description: `Por cobrar ventas ${monthLabel}`,
            },
            // CREDIT: Revenue accounts per channel
            ...revChannels.map(c => ({
              accountId:   acctMap[c.code],
              debit:       0,
              credit:      round2(c.amount),
              description: `Ventas ${NEW_ACCOUNTS.find(a => a.code === c.code)?.name ?? c.code}`,
            })),
          ],
        },
      },
    });
    console.log(`  ✔ Revenue entry ${entryNum1}  S/ ${totalRevenue.toFixed(2)}`);

    // ── Entry 2: Costs & OPEX ───────────────────────────────────────────────
    const cogs        = round2(COGS_TOT[mi]);
    const totalOpex   = round2(SELLING_OPEX[mi] + ADMIN_OPEX[mi]);
    const totalCosts  = round2(cogs + totalOpex);

    const entryNum2 = `MAN-2025-${String(counter++).padStart(4,'0')}`;
    await prisma.journalEntry.create({
      data: {
        entryNumber:  entryNum2,
        entryDate,
        periodId:     period.id,
        description:  `Costos y gastos operativos — ${monthLabel} 2025`,
        sourceModule: 'MANUAL',
        status:       'POSTED',
        totalDebit:   totalCosts,
        totalCredit:  totalCosts,
        createdBy,
        lines: {
          create: [
            // DEBIT: 69 Costo de Ventas
            {
              accountId:   acctMap['69'],
              debit:       cogs,
              credit:      0,
              description: `Costo de ventas ${monthLabel}`,
            },
            // DEBIT: 65 Gastos de gestión (selling + admin OPEX)
            {
              accountId:   acctMap['65'],
              debit:       totalOpex,
              credit:      0,
              description: `Gastos operativos ${monthLabel} (ventas S/${SELLING_OPEX[mi].toFixed(2)} + adm S/${ADMIN_OPEX[mi].toFixed(2)})`,
            },
            // CREDIT: 42 Cuentas por Pagar (offsetting)
            {
              accountId:   acctMap['42'],
              debit:       0,
              credit:      totalCosts,
              description: `Contrapartida costos/gastos ${monthLabel}`,
            },
          ],
        },
      },
    });
    console.log(`  ✔ Costs entry  ${entryNum2}  COGS S/ ${cogs.toFixed(2)}  OPEX S/ ${totalOpex.toFixed(2)}`);
  }

  console.log('\n✅ 2025 historical journal entries inserted successfully!');
  console.log('   All 12 accounting periods set to CLOSED.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
