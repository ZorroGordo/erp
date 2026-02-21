import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ModuleDef {
  path: string;   // e.g. '/dashboard'
  label: string;  // display name
}

export const ALL_MODULES: ModuleDef[] = [
  { path: '/dashboard',    label: 'Dashboard' },
  { path: '/inventory',    label: 'Inventario' },
  { path: '/products',     label: 'Catálogo' },
  { path: '/customers',    label: 'Clientes' },
  { path: '/sales',        label: 'Ventas' },
  { path: '/production',   label: 'Producción' },
  { path: '/procurement',  label: 'Compras' },
  { path: '/delivery',     label: 'Despacho' },
  { path: '/payroll',      label: 'Planilla' },
  { path: '/accounting',   label: 'Contabilidad' },
  { path: '/invoices',     label: 'Facturación' },
  { path: '/comprobantes', label: 'Comprobantes' },
  { path: '/ai',           label: 'IA Forecast' },
];

const STORAGE_KEY  = 'vos_enabled_modules';
const PERM_KEY     = 'vos_role_perms';

function loadEnabled(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return ALL_MODULES.map(m => m.path);
}

function loadRolePerms(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PERM_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string[]>;
  } catch { /* ignore */ }
  return {};
}

interface ModulesContextValue {
  enabledModules: string[];
  isEnabled: (path: string, userRoles?: string[]) => boolean;
  toggle: (path: string) => void;
  setAll: (paths: string[]) => void;
  /** Returns module list filtered by both global enabled AND role permissions */
  getVisibleModules: (userRoles: string[]) => string[];
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export function ModulesProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<string[]>(loadEnabled);

  const persist = useCallback((next: string[]) => {
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const isEnabled = useCallback((path: string, userRoles?: string[]) => {
    // Must be globally enabled first
    if (!enabled.includes(path)) return false;
    // SUPER_ADMIN always sees everything
    if (userRoles?.includes('SUPER_ADMIN')) return true;
    // If no roles provided, fall back to global toggle only
    if (!userRoles || userRoles.length === 0) return true;
    // Check role permissions
    const rolePerms = loadRolePerms();
    // If no perms configured at all, allow everything
    if (Object.keys(rolePerms).length === 0) return true;
    // User can see module if ANY of their roles permits it
    return userRoles.some(role => {
      const allowedForRole = rolePerms[role];
      if (!allowedForRole) return true; // no restriction configured for this role
      return allowedForRole.includes(path);
    });
  }, [enabled]);

  const getVisibleModules = useCallback((userRoles: string[]) => {
    return ALL_MODULES.map(m => m.path).filter(p => isEnabled(p, userRoles));
  }, [isEnabled]);

  const toggle = useCallback((path: string) => {
    persist(enabled.includes(path) ? enabled.filter(p => p !== path) : [...enabled, path]);
  }, [enabled, persist]);

  const setAll = useCallback((paths: string[]) => persist(paths), [persist]);

  return (
    <ModulesContext.Provider value={{ enabledModules: enabled, isEnabled, toggle, setAll, getVisibleModules }}>
      {children}
    </ModulesContext.Provider>
  );
}

export function useModules() {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error('useModules must be inside ModulesProvider');
  return ctx;
}
