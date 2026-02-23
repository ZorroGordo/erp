#!/usr/bin/env node
/**
 * Fix stuck FAILED migrations in _prisma_migrations before running migrate deploy.
 * Deletes failed migration rows so prisma migrate deploy can re-run them cleanly.
 * The migration SQL files have been corrected to use the right table names (@@map).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Delete all migrations that started but never finished (i.e., FAILED state)
const sql = `DELETE FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL AND "started_at" IS NOT NULL;`;

const sqlFile = path.join(os.tmpdir(), '_fix_migrations.sql');

console.log('[fix-migrations] Writing fix SQL to:', sqlFile);
fs.writeFileSync(sqlFile, sql);

console.log('[fix-migrations] Removing stuck failed migration entries from _prisma_migrations...');
try {
  execSync(`npx prisma db execute --file "${sqlFile}" --schema prisma/schema.prisma`, {
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('[fix-migrations] Cleanup done.');
} catch (e) {
  console.log('[fix-migrations] db execute failed (continuing anyway):', e.message);
} finally {
  try { fs.unlinkSync(sqlFile); } catch (_) {}
}

console.log('[fix-migrations] Running prisma migrate deploy...');
execSync('npx prisma migrate deploy', { stdio: 'inherit' });
