#!/usr/bin/env node
/**
 * Fix stuck FAILED migration in _prisma_migrations before running migrate deploy.
 * Migration 20260221000001_employee_birthdate failed because it referenced
 * table "Employee" (wrong) instead of "employees" (Prisma @@map name).
 * The SQL has been corrected; this script clears the failed state so it can re-run.
 */
const { execSync } = require('child_process');

const FAILED = '20260221000001_employee_birthdate';

// Use prisma db execute to directly fix the _prisma_migrations row
const sql = `UPDATE "_prisma_migrations" SET "rolled_back_at" = now() WHERE "migration_name" = '${FAILED}' AND "finished_at" IS NULL AND "rolled_back_at" IS NULL;`;

console.log(`[fix-migrations] Clearing failed state for: ${FAILED}`);
try {
  execSync('npx prisma db execute --stdin', {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env },
  });
  console.log('[fix-migrations] Done. Now running prisma migrate deploy...');
} catch (e) {
  console.log('[fix-migrations] db execute failed (may already be resolved):', e.message);
}

execSync('npx prisma migrate deploy', { stdio: 'inherit' });
