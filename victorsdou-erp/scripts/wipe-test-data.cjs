/**
 * One-off: back up and wipe catalog + inventory + production test data so the
 * team can start fresh. SAFE BY DEFAULT.
 *
 *   node scripts/wipe-test-data.cjs            # report row counts only (no changes)
 *   node scripts/wipe-test-data.cjs --backup   # report + write a JSON backup
 *   WIPE_CONFIRM=YES node scripts/wipe-test-data.cjs --wipe   # backup + delete
 *
 * Deletion runs inside a single transaction: if anything (e.g. a sales order or
 * invoice line still referencing a product) blocks a delete, the whole thing
 * rolls back and nothing is lost.
 *
 * Intended to be run against production via:  railway run node scripts/wipe-test-data.cjs --wipe
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Tables to back up (in any order) and the delete order (FK-safe: children first).
const DELETE_ORDER = [
  'productionStageLog',
  'productionReservation',
  'productionConsumption',
  'wasteLog',
  'productionOrder',
  'bOMLine',
  'recipe',
  'batch',
  'stockMovement',
  'stockLevel',
  'productStockMovement',
  'productStockLevel',
  'reorderRule',
  'ingredientAlert',
  'supplierPriceList',
  'purchaseOrderLine',
  'purchaseOrder',
  'ingredient',
  'product',
];

async function counts() {
  const out = {};
  for (const m of DELETE_ORDER) {
    try { out[m] = await prisma[m].count(); } catch (e) { out[m] = `ERR:${e.code || e.message}`; }
  }
  return out;
}

async function backup() {
  const data = {};
  for (const m of DELETE_ORDER) {
    try { data[m] = await prisma[m].findMany(); } catch (e) { data[m] = { error: String(e.message) }; }
  }
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `wipe-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

async function main() {
  const mode = process.argv.includes('--wipe') ? 'wipe'
             : process.argv.includes('--backup') ? 'backup' : 'report';

  console.log('Row counts (affected tables):');
  console.table(await counts());

  if (mode === 'report') {
    console.log('\nReport only — no changes made. Use --backup or --wipe.');
    return;
  }

  const file = await backup();
  console.log(`\nBackup written to: ${file}`);

  if (mode === 'backup') {
    console.log('Backup only — no deletion. Use --wipe (with WIPE_CONFIRM=YES) to delete.');
    return;
  }

  if (process.env.WIPE_CONFIRM !== 'YES') {
    console.log('\nRefusing to delete: set WIPE_CONFIRM=YES to actually wipe.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const m of DELETE_ORDER) {
      const res = await tx[m].deleteMany({});
      console.log(`  deleted ${res.count} from ${m}`);
    }
  });
  console.log('\n✔ Wipe complete.');
}

main()
  .catch((e) => { console.error('FAILED (nothing deleted if it was the transaction):', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
