import type { UserRole } from '@prisma/client';

// ── Permission Definitions ────────────────────────────────────────────────────
// Map of module → minimum role(s) required per HTTP method
// Routes use the helpers in auth.ts at the route level for fine-grained control;
// this file provides shared permission maps for service-level enforcement.

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN:   100,
  FINANCE_MGR:    80,
  OPS_MGR:        80,
  SALES_MGR:      70,
  ACCOUNTANT:     70,
  PROCUREMENT:    60,
  SALES_AGENT:    50,
  WAREHOUSE:      50,
  PRODUCTION:     50,
  DRIVER:         30,
  AUDITOR:        20,
  CUSTOMER_B2B:   10,
  CUSTOMER_B2C:   10,
};

export function hasMinRole(actorRoles: UserRole[], minRole: UserRole): boolean {
  const minLevel = ROLE_HIERARCHY[minRole] ?? 0;
  return actorRoles.some(
    (r) => (ROLE_HIERARCHY[r] ?? 0) >= minLevel,
  );
}

export function isInternalUser(roles: UserRole[]): boolean {
  return roles.some(
    (r) => !['CUSTOMER_B2C', 'CUSTOMER_B2B'].includes(r),
  );
}

// ── Module-Level Permission Map ───────────────────────────────────────────────

export type Permission = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'EXPORT';

export const MODULE_PERMISSIONS: Record<
  string,
  Partial<Record<Permission, UserRole[]>>
> = {
  inventory: {
    READ:   ['WAREHOUSE', 'PRODUCTION', 'PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR', 'SUPER_ADMIN'],
    CREATE: ['WAREHOUSE', 'OPS_MGR', 'SUPER_ADMIN'],
    UPDATE: ['WAREHOUSE', 'OPS_MGR', 'SUPER_ADMIN'],
    APPROVE:['OPS_MGR', 'SUPER_ADMIN'],
  },
  production: {
    READ:   ['PRODUCTION', 'OPS_MGR', 'FINANCE_MGR', 'SUPER_ADMIN'],
    CREATE: ['OPS_MGR', 'SUPER_ADMIN'],
    UPDATE: ['PRODUCTION', 'OPS_MGR', 'SUPER_ADMIN'],
    APPROVE:['OPS_MGR', 'SUPER_ADMIN'],
  },
  procurement: {
    READ:   ['PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR', 'WAREHOUSE', 'SUPER_ADMIN'],
    CREATE: ['PROCUREMENT', 'SUPER_ADMIN'],
    UPDATE: ['PROCUREMENT', 'SUPER_ADMIN'],
    APPROVE:['OPS_MGR', 'FINANCE_MGR', 'SUPER_ADMIN'],
  },
  sales: {
    READ:   ['SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'FINANCE_MGR', 'SUPER_ADMIN'],
    CREATE: ['SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN'],
    UPDATE: ['SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN'],
    APPROVE:['SALES_MGR', 'SUPER_ADMIN'],
  },
  invoicing: {
    READ:   ['ACCOUNTANT', 'FINANCE_MGR', 'SALES_AGENT', 'SALES_MGR', 'SUPER_ADMIN'],
    CREATE: ['SALES_AGENT', 'FINANCE_MGR', 'SUPER_ADMIN'],
    APPROVE:['FINANCE_MGR', 'SUPER_ADMIN'],
  },
  accounting: {
    READ:   ['ACCOUNTANT', 'FINANCE_MGR', 'SUPER_ADMIN', 'AUDITOR'],
    CREATE: ['ACCOUNTANT', 'FINANCE_MGR', 'SUPER_ADMIN'],
    UPDATE: ['ACCOUNTANT', 'FINANCE_MGR', 'SUPER_ADMIN'],
    APPROVE:['FINANCE_MGR', 'SUPER_ADMIN'],
    EXPORT: ['ACCOUNTANT', 'FINANCE_MGR', 'SUPER_ADMIN', 'AUDITOR'],
  },
  payroll: {
    READ:   ['FINANCE_MGR', 'SUPER_ADMIN'],
    CREATE: ['FINANCE_MGR', 'SUPER_ADMIN'],
    APPROVE:['FINANCE_MGR', 'SUPER_ADMIN'],
  },
  ai: {
    READ:   ['OPS_MGR', 'SALES_MGR', 'FINANCE_MGR', 'SUPER_ADMIN'],
    CREATE: ['OPS_MGR', 'SUPER_ADMIN'],
    UPDATE: ['OPS_MGR', 'SALES_MGR', 'SUPER_ADMIN'],
  },
};

export function canPerform(
  roles: UserRole[],
  module: string,
  permission: Permission,
): boolean {
  if (roles.includes('SUPER_ADMIN')) return true;
  const allowed = MODULE_PERMISSIONS[module]?.[permission] ?? [];
  return roles.some((r) => allowed.includes(r));
}
