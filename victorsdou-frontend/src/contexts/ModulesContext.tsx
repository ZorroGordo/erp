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

const STORAGE_KEY = 'vos_enabled_modules';

function loadEnabled(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return ALL_MODULES.map(m => m.path); // default: all enabled
}

interface ModulesContextValue {
  enabledModules: string[];
  isEnabled: (path: string) => boolean;
  toggle: (path: string) => void;
  setAll: (paths: string[]) => void;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export function ModulesProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<string[]>(loadEnabled);

  const persist = useCallback((next: string[]) => {
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const isEnabled = useCallback((path: string) => enabled.includes(path), [enabled]);

  const toggle = useCallback((path: string) => {
    persist(
      enabled.includes(path)
        ? enabled.filter(p => p !== path)
        : [...enabled, path]
    );
  }, [enabled, persist]);

  const setAll = useCallback((paths: string[]) => persist(paths), [persist]);

  return (
    <ModulesContext.Provider value={{ enabledModules: enabled, isEnabled, toggle, setAll }}>
      {children}
    </ModulesContext.Provider>
  );
}

export function useModules() {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error('useModules must be inside ModulesProvider');
  return ctx;
}
