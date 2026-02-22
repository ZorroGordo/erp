"""
Patch Settings.tsx:
1. Fix duplicate Permisos tab entry
2. Replace on/off permission toggle with 3-state: none/ver/editar
3. Storage format: Record<role, Record<module, 'none'|'view'|'edit'>>
4. Visually: per-module row shows 3-state segmented control
"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Settings.tsx'
with open(path) as f:
    src = f.read()

# ── 1. Fix duplicate TABS entry ───────────────────────────────────────────────
src = src.replace(
    "    { id: 'permisos', label: 'Permisos',  icon: Shield },\n    { id: 'permisos', label: 'Permisos',  icon: Shield },",
    "    { id: 'permisos', label: 'Permisos',  icon: Shield },"
)
# Fix duplicate render
src = src.replace(
    "      {tab === 'permisos' && <PermisosTab />}\n      {tab === 'permisos' && <PermisosTab />}",
    "      {tab === 'permisos' && <PermisosTab />}"
)

# ── 2. Update storage key and loadRolePerms ───────────────────────────────────
src = src.replace(
    "const PERM_STORAGE_KEY = 'vos_role_perms';",
    "const PERM_STORAGE_KEY = 'vos_role_perms_v2';"
)

src = src.replace(
    '''function loadRolePerms(): Record<string, string[]> {
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
}''',
    '''// perms[role][modulePath] = 'none' | 'view' | 'edit'
type PermLevel = 'none' | 'view' | 'edit';
type PermsMap  = Record<string, Record<string, PermLevel>>;

function loadRolePerms(): PermsMap {
  try {
    const raw = localStorage.getItem(PERM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PermsMap;
      // Validate structure: make sure it has the right shape
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        // Ensure all roles and modules are present
        const result: PermsMap = {};
        Object.keys(ROLE_LABELS_MAP).forEach(role => {
          result[role] = {};
          ALL_MODULES.forEach(m => {
            result[role][m.path] = parsed[role]?.[m.path] ?? 'edit';
          });
        });
        return result;
      }
    }
  } catch { /* ignore */ }
  // Default: all roles have full edit access to all modules
  const defaults: PermsMap = {};
  Object.keys(ROLE_LABELS_MAP).forEach(role => {
    defaults[role] = {};
    ALL_MODULES.forEach(m => { defaults[role][m.path] = 'edit'; });
  });
  return defaults;
}'''
)

# ── 3. Replace the entire PermisosTab component ───────────────────────────────
OLD_TAB = '''// ── Tab: Permisos ─────────────────────────────────────────────────────────────
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
}'''

NEW_TAB = '''// ── Tab: Permisos ─────────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<PermLevel, { label: string; cls: string }> = {
  none: { label: 'Sin acceso', cls: 'bg-gray-100 text-gray-500'  },
  view: { label: 'Ver',        cls: 'bg-blue-100 text-blue-700'  },
  edit: { label: 'Editar',     cls: 'bg-green-100 text-green-700'},
};
const LEVELS: PermLevel[] = ['none', 'view', 'edit'];

function PermisosTab() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.roles?.includes('SUPER_ADMIN');
  const [perms, setPerms] = useState<PermsMap>(loadRolePerms);
  const [activeRole, setActiveRole] = useState<string>('SALES_AGENT');
  const [saved, setSaved] = useState(false);

  const roleMap = perms[activeRole] ?? {};

  const setLevel = (path: string, level: PermLevel) => {
    setPerms(p => ({ ...p, [activeRole]: { ...(p[activeRole] ?? {}), [path]: level } }));
    setSaved(false);
  };

  const setAll = (level: PermLevel) => {
    const next: Record<string, PermLevel> = {};
    ALL_MODULES.forEach(m => { next[m.path] = level; });
    setPerms(p => ({ ...p, [activeRole]: next }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(PERM_STORAGE_KEY, JSON.stringify(perms));
    setSaved(true);
    toast.success('Permisos guardados');
    setTimeout(() => setSaved(false), 2000);
  };

  // Summarise role for the sidebar badge
  const roleSummary = (role: string) => {
    if (role === 'SUPER_ADMIN') return `${ALL_MODULES.length}/${ALL_MODULES.length}`;
    const rm = perms[role] ?? {};
    const visible = ALL_MODULES.filter(m => (rm[m.path] ?? 'edit') !== 'none').length;
    return `${visible}/${ALL_MODULES.length}`;
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
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="font-semibold text-gray-900">Permisos por rol</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Define el nivel de acceso de cada rol: <strong>Sin acceso</strong>, <strong>Ver</strong> (solo lectura) o <strong>Editar</strong> (lectura + escritura). SUPER_ADMIN siempre tiene acceso total.
        </p>
      </div>

      <div className="flex gap-4">
        {/* Role list */}
        <div className="w-52 flex-shrink-0">
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {Object.entries(ROLE_LABELS_MAP).map(([role, label]) => {
              const isSA = role === 'SUPER_ADMIN';
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
                      : <span className="text-xs text-gray-400 flex-shrink-0 ml-1">{roleSummary(role)}</span>
                    }
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Module permission rows */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-800 text-sm">
              {ROLE_LABELS_MAP[activeRole]}
            </h3>
            <div className="flex gap-2">
              <button onClick={() => setAll('edit')} className="btn-secondary text-xs py-1 px-2.5">Todo acceso</button>
              <button onClick={() => setAll('view')} className="btn-secondary text-xs py-1 px-2.5">Solo ver</button>
              <button onClick={() => setAll('none')} className="btn-secondary text-xs py-1 px-2.5">Sin acceso</button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {LEVELS.map(l => (
              <span key={l} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${LEVEL_CONFIG[l].cls}`}>
                {LEVEL_CONFIG[l].label}
              </span>
            ))}
          </div>

          <div className="card divide-y divide-gray-100">
            {ALL_MODULES.map(mod => {
              const current: PermLevel = (roleMap[mod.path] as PermLevel) ?? 'edit';
              return (
                <div key={mod.path} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className="font-medium text-gray-800 text-sm">{mod.label}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{mod.path}</span>
                  </div>
                  {/* 3-state segmented control */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
                    {LEVELS.map(level => (
                      <button key={level} type="button"
                        onClick={() => setLevel(mod.path, level)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          current === level
                            ? `${LEVEL_CONFIG[level].cls} shadow-sm`
                            : 'text-gray-400 hover:text-gray-600'
                        }`}>
                        {LEVEL_CONFIG[level].label}
                      </button>
                    ))}
                  </div>
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
}'''

if OLD_TAB in src:
    src = src.replace(OLD_TAB, NEW_TAB)
    print("PermisosTab replaced successfully")
else:
    print("ERROR: Could not find old PermisosTab - checking for partial match...")
    # Try to find what's different
    if 'toggleModule' in src:
        print("Old toggleModule found - might have slightly different whitespace")
    else:
        print("toggleModule not found")

with open(path, 'w') as f:
    f.write(src)
print("Settings.tsx updated")
