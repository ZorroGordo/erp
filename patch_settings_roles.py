"""
Adds a 'Permisos' tab to Settings.tsx:
- Matrix of roles × modules
- Per-role module visibility stored in localStorage as vos_role_perms
- SUPER_ADMIN always sees everything
"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Settings.tsx'
with open(path) as f: src = f.read()

# 1. Change Tab type to include 'permisos'
src = src.replace(
    "type Tab = 'empresa' | 'usuarios' | 'modulos';",
    "type Tab = 'empresa' | 'usuarios' | 'modulos' | 'permisos';"
)

# 2. Add Shield to imports from lucide-react
src = src.replace(
    "  Plus, Pencil, X, Eye, EyeOff, UserCheck, UserX, Loader2,",
    "  Plus, Pencil, X, Eye, EyeOff, UserCheck, UserX, Loader2, Shield,"
)

# 3. Add permisos tab to TABS array
src = src.replace(
    "    { id: 'modulos',  label: 'Módulos',   icon: LayoutGrid },",
    "    { id: 'modulos',  label: 'Módulos',   icon: LayoutGrid },\n    { id: 'permisos', label: 'Permisos',  icon: Shield },"
)

# 4. Add permisos tab rendering
src = src.replace(
    "      {tab === 'modulos'  && <ModulosTab />}",
    "      {tab === 'modulos'  && <ModulosTab />}\n      {tab === 'permisos' && <PermisosTab />}"
)

# 5. Insert PermisosTab component before the main Settings export
permisos_tab = '''
// ── Role labels ──────────────────────────────────────────────────────────────
const ROLE_LABELS_MAP: Record<string, string> = {
  SUPER_ADMIN:  'Super Admin',
  OPS_MGR:      'Gerente Operaciones',
  FINANCE_MGR:  'Gerente Finanzas',
  SALES_MGR:    'Gerente de Ventas',
  ACCOUNTANT:   'Contador',
  PROCUREMENT:  'Compras',
  WAREHOUSE:    'Almacén',
  PRODUCTION:   'Producción',
  SALES_AGENT:  'Vendedor',
  DRIVER:       'Conductor',
  AUDITOR:      'Auditor',
};

const PERM_STORAGE_KEY = 'vos_role_perms';

function loadRolePerms(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PERM_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // Default: all roles see all modules
  const defaults: Record<string, string[]> = {};
  Object.keys(ROLE_LABELS_MAP).forEach(r => {
    defaults[r] = ALL_MODULES.map(m => m.path);
  });
  return defaults;
}

// ── Tab: Permisos ─────────────────────────────────────────────────────────────
function PermisosTab() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.roles?.includes('SUPER_ADMIN');
  const [perms, setPerms] = useState<Record<string, string[]>>(loadRolePerms);
  const [activeRole, setActiveRole] = useState<string>('SALES_AGENT');
  const [saved, setSaved] = useState(false);

  const roleModules = perms[activeRole] ?? ALL_MODULES.map(m => m.path);

  const toggleModule = (path: string) => {
    const current = roleModules;
    const next = current.includes(path) ? current.filter(p => p !== path) : [...current, path];
    setPerms(p => ({ ...p, [activeRole]: next }));
    setSaved(false);
  };

  const toggleAll = (on: boolean) => {
    setPerms(p => ({ ...p, [activeRole]: on ? ALL_MODULES.map(m => m.path) : [] }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(PERM_STORAGE_KEY, JSON.stringify(perms));
    setSaved(true);
    toast.success('Permisos guardados');
    setTimeout(() => setSaved(false), 2000);
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Shield size={40} className="mb-3 opacity-40" />
        <p className="font-medium">Acceso restringido</p>
        <p className="text-sm mt-1">Solo los Super Admin pueden gestionar permisos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="font-semibold text-gray-900">Permisos por rol</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Define qué módulos puede ver cada rol. SUPER_ADMIN siempre tiene acceso total.
        </p>
      </div>

      <div className="flex gap-4">
        {/* Role list */}
        <div className="w-52 flex-shrink-0">
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {Object.entries(ROLE_LABELS_MAP).map(([role, label]) => {
              const isSA = role === 'SUPER_ADMIN';
              const visibleCount = isSA ? ALL_MODULES.length : (perms[role] ?? ALL_MODULES.map(m => m.path)).length;
              return (
                <button key={role} onClick={() => !isSA && setActiveRole(role)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    activeRole === role && !isSA ? 'bg-brand-50 text-brand-700 font-medium' :
                    isSA ? 'text-gray-400 cursor-default bg-gray-50' : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="truncate">{label}</span>
                    {isSA
                      ? <Shield size={12} className="text-brand-400 flex-shrink-0" />
                      : <span className="text-xs text-gray-400 flex-shrink-0 ml-1">{visibleCount}/{ALL_MODULES.length}</span>
                    }
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Module toggles */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-800 text-sm">
              {ROLE_LABELS_MAP[activeRole]} — módulos visibles
            </h3>
            <div className="flex gap-2">
              <button onClick={() => toggleAll(true)} className="btn-secondary text-xs py-1 px-2.5">Todos</button>
              <button onClick={() => toggleAll(false)} className="btn-secondary text-xs py-1 px-2.5">Ninguno</button>
            </div>
          </div>
          <div className="card divide-y divide-gray-100">
            {ALL_MODULES.map(mod => {
              const on = roleModules.includes(mod.path);
              return (
                <div key={mod.path} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className="font-medium text-gray-800 text-sm">{mod.label}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{mod.path}</span>
                  </div>
                  <button type="button" onClick={() => toggleModule(mod.path)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${on ? 'bg-brand-500 border-brand-500' : 'bg-gray-200 border-gray-200'}`}
                    aria-checked={on} role="switch">
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button onClick={handleSave} className="btn-primary flex items-center gap-2 text-sm">
              {saved ? <Check size={15} /> : <Save size={15} />}
              {saved ? 'Guardado' : 'Guardar permisos'}
            </button>
            <p className="text-xs text-gray-400">Los cambios se aplican al recargar la página.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

'''

src = src.replace(
    "// ── Main Settings page ────────────────────────────────────────────────────────",
    permisos_tab + "// ── Main Settings page ────────────────────────────────────────────────────────"
)

with open(path, 'w') as f: f.write(src)
print("Settings.tsx updated with Permisos tab")
