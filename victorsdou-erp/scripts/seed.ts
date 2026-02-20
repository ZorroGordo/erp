/**
 * VictorOS ERP — Database Seed Script
 * Run with: npm run db:seed
 *
 * Seeds: Users, Chart of Accounts (PCGE), Product Categories,
 *        Sample Ingredients, Sample Products, Warehouses, System Config
 */
import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Chart of Accounts (PCGE — Peru) ──────────────────────────────────────────
const COA = [
  { code: '10',   name: 'Efectivo y Equivalentes de Efectivo',        type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '104',  name: 'Cuentas Corrientes en Inst. Financieras',    type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '12',   name: 'Cuentas por Cobrar Comerciales',             type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '121',  name: 'Facturas, Boletas y Otros por Cobrar',       type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '20',   name: 'Mercaderías',                                type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '21',   name: 'Productos Terminados',                       type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '24',   name: 'Materias Primas',                            type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '25',   name: 'Materiales Auxiliares y Suministros',        type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '33',   name: 'Inmuebles, Maquinaria y Equipo',             type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '39',   name: 'Depreciación Acumulada',                     type: 'ASSET',     normalBalance: 'CREDIT' },
  { code: '40',   name: 'Tributos y Contraprestaciones por Pagar',    type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '4011', name: 'IGV - Débito Fiscal (Ventas)',               type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '4012', name: 'IGV - Crédito Fiscal (Compras)',             type: 'ASSET',     normalBalance: 'DEBIT'  },
  { code: '403',  name: 'Essalud por Pagar',                         type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '407',  name: 'AFP / ONP por Pagar',                       type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '41',   name: 'Remuneraciones y Participaciones por Pagar', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '415',  name: 'Beneficios Sociales — CTS',                 type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '42',   name: 'Cuentas por Pagar Comerciales',             type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '421',  name: 'Facturas y Otros por Pagar (Proveedores)',   type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '50',   name: 'Capital Social',                             type: 'EQUITY',    normalBalance: 'CREDIT' },
  { code: '59',   name: 'Resultados Acumulados',                      type: 'EQUITY',    normalBalance: 'CREDIT' },
  { code: '60',   name: 'Compras',                                    type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '61',   name: 'Variación de Existencias',                   type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '62',   name: 'Gastos de Personal y Directores',            type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '65',   name: 'Otros Gastos de Gestión',                    type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '67',   name: 'Gastos Financieros',                         type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '68',   name: 'Valuación y Deterioro de Activos',           type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '69',   name: 'Costo de Ventas',                            type: 'EXPENSE',   normalBalance: 'DEBIT'  },
  { code: '70',   name: 'Ventas',                                     type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '71',   name: 'Variación de la Producción Almacenada',      type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '75',   name: 'Otros Ingresos de Gestión',                  type: 'REVENUE',   normalBalance: 'CREDIT' },
  { code: '77',   name: 'Ingresos Financieros',                       type: 'REVENUE',   normalBalance: 'CREDIT' },
];

// ── System Config ─────────────────────────────────────────────────────────────
const SYSTEM_CONFIG = [
  { key: 'IGV_RATE',        value: { rate: 0.18 },           description: 'IGV rate (18%) - update if SUNAT changes' },
  { key: 'UIT_VALUE_PEN',   value: { amount: 5350 },         description: 'UIT value for 2026 — update annually' },
  { key: 'ESSALUD_RATE',    value: { rate: 0.09 },           description: 'Employer Essalud contribution rate' },
  { key: 'ONP_RATE',        value: { rate: 0.13 },           description: 'ONP (Sistema Nacional Pensiones) rate' },
  { key: 'AFP_INTEGRA',     value: { base: 0.10, commission: 0.0155, insurance: 0.0168 }, description: 'AFP Integra rates' },
  { key: 'AFP_PRIMA',       value: { base: 0.10, commission: 0.0138, insurance: 0.0168 }, description: 'AFP Prima rates' },
  { key: 'AFP_PROFUTURO',   value: { base: 0.10, commission: 0.0147, insurance: 0.0168 }, description: 'AFP Profuturo rates' },
  { key: 'AFP_HABITAT',     value: { base: 0.10, commission: 0.0127, insurance: 0.0168 }, description: 'AFP Habitat rates' },
  { key: 'CTS_FACTOR',      value: { annual_months: 1 },     description: 'CTS = 1 monthly salary per year (2 deposits)' },
  { key: 'GRATICACION_FACTOR', value: { factor: 1 },         description: 'Gratificacion = 1 monthly salary per event' },
  { key: 'PRODUCTION_SHIFT_CAPACITY', value: { morning: 500, afternoon: 400, night: 200 }, description: 'Units per shift for AI planning' },
  { key: 'FORECAST_MAPE_THRESHOLD', value: { threshold: 0.25 }, description: 'MAPE threshold above which model retrain is triggered' },
];

async function main() {
  console.log('🌱 Seeding VictorOS ERP database...\n');

  // ── Users ──────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@Victorsdou2026!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@victorsdou.pe' },
    update: {},
    create: {
      email:        'admin@victorsdou.pe',
      passwordHash: adminHash,
      fullName:     'System Administrator',
      roles:        [UserRole.SUPER_ADMIN],
    },
  });
  console.log(`✅ User: ${admin.email} (SUPER_ADMIN)`);

  const financeHash = await bcrypt.hash('Finance@Victorsdou2026!', 12);
  const finance = await prisma.user.upsert({
    where: { email: 'finanzas@victorsdou.pe' },
    update: {},
    create: {
      email:        'finanzas@victorsdou.pe',
      passwordHash: financeHash,
      fullName:     'Gerente de Finanzas',
      roles:        [UserRole.FINANCE_MGR, UserRole.ACCOUNTANT],
    },
  });
  console.log(`✅ User: ${finance.email} (FINANCE_MGR)`);

  const opsHash = await bcrypt.hash('Ops@Victorsdou2026!', 12);
  const ops = await prisma.user.upsert({
    where: { email: 'operaciones@victorsdou.pe' },
    update: {},
    create: {
      email:        'operaciones@victorsdou.pe',
      passwordHash: opsHash,
      fullName:     'Gerente de Operaciones',
      roles:        [UserRole.OPS_MGR, UserRole.PROCUREMENT],
    },
  });
  console.log(`✅ User: ${ops.email} (OPS_MGR)`);

  // ── Chart of Accounts ──────────────────────────────────────────────────────
  for (const account of COA) {
    await prisma.chartOfAccount.upsert({
      where: { code: account.code },
      update: { name: account.name },
      create: account,
    });
  }
  console.log(`✅ Chart of Accounts: ${COA.length} accounts seeded`);

  // ── System Config ──────────────────────────────────────────────────────────
  for (const cfg of SYSTEM_CONFIG) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value },
      create: cfg,
    });
  }
  console.log(`✅ System Config: ${SYSTEM_CONFIG.length} entries seeded`);

  // ── Warehouses ─────────────────────────────────────────────────────────────
  const mainWarehouse = await prisma.warehouse.upsert({
    where: { id: 'warehouse-main-001' },
    update: {},
    create: { id: 'warehouse-main-001', name: 'Almacén Principal', type: 'RAW_MATERIAL', address: 'Planta Victorsdou, Lima' },
  });
  console.log(`✅ Warehouse: ${mainWarehouse.name}`);

  // ── Product Categories ─────────────────────────────────────────────────────
  const categories = [
    { name: 'Panes',        id: 'cat-panes' },
    { name: 'Pasteles',     id: 'cat-pasteles' },
    { name: 'Tortas',       id: 'cat-tortas' },
    { name: 'Salados',      id: 'cat-salados' },
    { name: 'Bebidas',      id: 'cat-bebidas' },
    { name: 'Empaquetados', id: 'cat-empaquetados' },
  ];
  for (const cat of categories) {
    await prisma.productCategory.upsert({ where: { name: cat.name }, update: {}, create: cat });
  }
  console.log(`✅ Product Categories: ${categories.length} seeded`);

  // ── Sample Ingredients ─────────────────────────────────────────────────────
  const ingredients = [
    { sku: 'ING-001', name: 'Harina de Trigo Extra (kg)',    category: 'flour',     baseUom: 'kg' },
    { sku: 'ING-002', name: 'Azúcar Blanca (kg)',            category: 'sugar',     baseUom: 'kg' },
    { sku: 'ING-003', name: 'Mantequilla Sin Sal (kg)',       category: 'fat',       baseUom: 'kg', isPerishable: true, shelfLifeDays: 60 },
    { sku: 'ING-004', name: 'Huevos Frescos (unidad)',        category: 'egg',       baseUom: 'unit', isPerishable: true, shelfLifeDays: 21 },
    { sku: 'ING-005', name: 'Leche Evaporada (litro)',        category: 'dairy',     baseUom: 'litre', isPerishable: true, shelfLifeDays: 7 },
    { sku: 'ING-006', name: 'Levadura Seca (kg)',             category: 'flavoring', baseUom: 'kg' },
    { sku: 'ING-007', name: 'Sal de Mesa (kg)',               category: 'flavoring', baseUom: 'kg' },
    { sku: 'ING-008', name: 'Aceite Vegetal (litro)',         category: 'fat',       baseUom: 'litre' },
    { sku: 'ING-009', name: 'Cacao en Polvo (kg)',            category: 'flavoring', baseUom: 'kg' },
    { sku: 'ING-010', name: 'Bolsa Kraft 25x30 (unidad)',     category: 'packaging', baseUom: 'unit' },
    { sku: 'ING-011', name: 'Caja Torta 30cm (unidad)',       category: 'packaging', baseUom: 'unit' },
  ];
  for (const ing of ingredients) {
    await prisma.ingredient.upsert({ where: { sku: ing.sku }, update: {}, create: ing });
  }
  console.log(`✅ Ingredients: ${ingredients.length} seeded`);

  // ── Accounting Period ──────────────────────────────────────────────────────
  const now = new Date();
  await prisma.accountingPeriod.upsert({
    where: { year_month: { year: now.getFullYear(), month: now.getMonth() + 1 } },
    update: {},
    create: { year: now.getFullYear(), month: now.getMonth() + 1, status: 'OPEN' },
  });
  console.log(`✅ Accounting Period: ${now.getFullYear()}-${now.getMonth() + 1} (OPEN)`);

  console.log('\n✨ Seed complete!\n');
  console.log('Default credentials:');
  console.log('  admin@victorsdou.pe   / Admin@Victorsdou2026!');
  console.log('  finanzas@victorsdou.pe / Finance@Victorsdou2026!');
  console.log('  operaciones@victorsdou.pe / Ops@Victorsdou2026!');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
