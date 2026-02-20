import { useState, useEffect, useCallback, type ElementType } from 'react';
import { useBrand } from '../contexts/BrandContext';
import { useAuth } from '../contexts/AuthContext';
import { useModules, ALL_MODULES } from '../contexts/ModulesContext';
import {
  Save, RotateCcw, Check, Users, Building2, LayoutGrid,
  Plus, Pencil, X, Eye, EyeOff, UserCheck, UserX, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

const ALL_ROLES = [
  { value: 'SUPER_ADMIN',  label: 'Super Admin' },
  { value: 'OPS_MGR',      label: 'Gerente de Operaciones' },
  { value: 'FINANCE_MGR',  label: 'Gerente de Finanzas' },
  { value: 'SALES_MGR',    label: 'Gerente de Ventas' },
  { value: 'ACCOUNTANT',   label: 'Contador' },
  { value: 'PROCUREMENT',  label: 'Compras' },
  { value: 'WAREHOUSE',    label: 'Almacén' },
  { value: 'PRODUCTION',   label: 'Producción' },
  { value: 'SALES_AGENT',  label: 'Vendedor' },
  { value: 'DRIVER',       label: 'Conductor' },
  { value: 'AUDITOR',      label: 'Auditor' },
] as const;

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

// ── Emoji options ─────────────────────────────────────────────────────────────
const EMOJI_OPTIONS = [
  '🌿', '🌱', '🍀', '🌾', '🌲', '🌳', '🌴', '🍃',
  '🥖', '🥐', '🧁', '🎂', '🍰', '🥧', '🍞', '🥨',
  '⭐', '✨', '💎', '🔷', '🏆', '🎯', '🚀', '💡',
  '🏪', '🏬', '🛒', '🧺', '🎁', '📦', '🍽️', '☕',
];

// ── Tab: Empresa ──────────────────────────────────────────────────────────────
function EmpresaTab() {
  const { brand, updateBrand, resetBrand } = useBrand();
  const [form, setForm] = useState({
    name: brand.name, fullName: brand.fullName, tagline: brand.tagline, logoEmoji: brand.logoEmoji,
  });
  const [saved, setSaved] = useState(false);

  const isDirty =
    form.name !== brand.name || form.fullName !== brand.fullName ||
    form.tagline !== brand.tagline || form.logoEmoji !== brand.logoEmoji;

  const handleSave = () => {
    updateBrand(form);
    setSaved(true);
    toast.success('Configuración guardada');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetBrand();
    setForm({ name: 'VictorOS', fullName: 'Victorsdou ERP', tagline: 'Panadería artesanal · Sistema de gestión', logoEmoji: '🌿' });
    toast.success('Valores restaurados');
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Live preview */}
      <div className="card p-5">
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-4">Vista previa — barra lateral</p>
        <div className="flex items-center gap-3 bg-brand-700 rounded-xl px-4 py-4 w-fit min-w-[200px]">
          <span className="text-2xl">{form.logoEmoji}</span>
          <div>
            <p className="font-bold text-sm text-white leading-tight tracking-wide">{form.name || 'Nombre del sistema'}</p>
            <p className="text-brand-300 text-xs">{form.fullName || 'Subtítulo'}</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="card p-6 space-y-6">
        {/* Emoji picker */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Ícono / Logo
            <span className="ml-2 text-xs font-normal text-gray-400">Selecciona un emoji como ícono</span>
          </label>
          <div className="grid grid-cols-8 gap-2">
            {EMOJI_OPTIONS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => setForm(f => ({ ...f, logoEmoji: emoji }))}
                className={`text-2xl p-2 rounded-lg transition-all duration-150 border-2 ${form.logoEmoji === emoji ? 'border-brand-500 bg-brand-50 scale-110 shadow-sm' : 'border-transparent hover:border-brand-200 hover:bg-brand-50'}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-400">O escribe un emoji personalizado:</span>
            <input
              type="text"
              value={form.logoEmoji}
              onChange={e => { const val = [...e.target.value].slice(-2).join(''); if (val) setForm(f => ({ ...f, logoEmoji: val })); }}
              className="w-16 text-center text-xl border border-brand-300 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              maxLength={4}
            />
          </div>
        </div>
        <div className="border-t border-brand-100" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre del sistema</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="VictorOS" maxLength={24} />
            <p className="text-xs text-gray-400 mt-1">{form.name.length}/24</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Subtítulo</label>
            <input type="text" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} className="input" placeholder="Victorsdou ERP" maxLength={32} />
            <p className="text-xs text-gray-400 mt-1">{form.fullName.length}/32</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Tagline <span className="text-xs font-normal text-gray-400">(pantalla de login)</span></label>
          <input type="text" value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} className="input" maxLength={60} />
          <p className="text-xs text-gray-400 mt-1">{form.tagline.length}/60</p>
        </div>
        <div className="border-t border-brand-100" />
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={!isDirty && !saved} className="btn-primary flex items-center gap-2">
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? 'Guardado' : 'Guardar cambios'}
          </button>
          <button onClick={handleReset} className="btn-secondary flex items-center gap-2">
            <RotateCcw size={15} /> Restaurar valores
          </button>
          {isDirty && <span className="text-xs text-amber-600 ml-2">● Cambios sin guardar</span>}
        </div>
      </div>
    </div>
  );
}

// ── User Modal ────────────────────────────────────────────────────────────────
type UserModalProps = {
  user?: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
};

function UserModal({ user, onClose, onSaved }: UserModalProps) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
    password: '',
    roles: user?.roles ?? [] as string[],
    isActive: user?.isActive ?? true,
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleRole = (role: string) =>
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) return;
    if (!isEdit && !form.password) { toast.error('La contraseña es obligatoria'); return; }
    if (form.roles.length === 0) { toast.error('Selecciona al menos un rol'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        fullName: form.fullName,
        email: form.email,
        roles: form.roles,
        isActive: form.isActive,
      };
      if (form.password) body.password = form.password;

      const res = isEdit
        ? await api.patch(`/v1/auth/users/${user!.id}`, body)
        : await api.post('/v1/auth/users', body);
      if (res.data.data) {
        toast.success(isEdit ? 'Usuario actualizado' : 'Usuario creado');
        onSaved();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? (err instanceof Error ? err.message : 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
              <input
                type="text" value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                className="input" placeholder="Juan García" required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="input" placeholder="juan@empresa.pe" required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña {isEdit && <span className="text-xs text-gray-400">(dejar vacío para no cambiar)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="input pr-10" placeholder={isEdit ? '••••••••' : 'Contraseña segura'}
                  required={!isEdit}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Roles</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {ALL_ROLES.map(r => (
                <label key={r.value} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${form.roles.includes(r.value) ? 'bg-brand-50 border-brand-400 text-brand-800' : 'border-gray-200 text-gray-700 hover:border-brand-300'}`}>
                  <input type="checkbox" className="hidden" checked={form.roles.includes(r.value)} onChange={() => toggleRole(r.value)} />
                  <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${form.roles.includes(r.value) ? 'bg-brand-500 border-brand-500' : 'border-gray-300'}`}>
                    {form.roles.includes(r.value) && <Check size={10} className="text-white" />}
                  </span>
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          {/* Active toggle (edit only) */}
          {isEdit && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Estado:</span>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${form.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
              >
                {form.isActive ? <><UserCheck size={14} /> Activo</> : <><UserX size={14} /> Inactivo</>}
              </button>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab: Usuarios ─────────────────────────────────────────────────────────────
function UsuariosTab() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.roles?.includes('SUPER_ADMIN');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; user?: UserRow | null }>({ open: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/v1/auth/users');
      setUsers(res.data.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Users size={40} className="mb-3 opacity-40" />
        <p className="font-medium">Acceso restringido</p>
        <p className="text-sm mt-1">Solo los Super Admin pueden gestionar usuarios.</p>
      </div>
    );
  }

  const ROLE_LABEL: Record<string, string> = Object.fromEntries(ALL_ROLES.map(r => [r.value, r.label]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Usuarios del sistema</h2>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModal({ open: true, user: null })} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-brand-800 text-xs font-semibold uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Roles</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Último acceso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-brand-50/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {u.fullName[0]}
                      </div>
                      {u.fullName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map(r => (
                        <span key={r} className="inline-block bg-brand-100 text-brand-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          {ROLE_LABEL[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.isActive
                      ? <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Activo</span>
                      : <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Inactivo</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('es-PE') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setModal({ open: true, user: u })}
                      className="text-gray-400 hover:text-brand-600 p-1 rounded transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">No hay usuarios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <UserModal
          user={modal.user}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); load(); }}
        />
      )}
    </div>
  );
}

// ── Tab: Módulos ──────────────────────────────────────────────────────────────
function ModulosTab() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.roles?.includes('SUPER_ADMIN');
  const { enabledModules, toggle, setAll } = useModules();

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <LayoutGrid size={40} className="mb-3 opacity-40" />
        <p className="font-medium">Acceso restringido</p>
        <p className="text-sm mt-1">Solo los Super Admin pueden configurar módulos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Módulos visibles</h2>
          <p className="text-sm text-gray-500 mt-0.5">Controla qué módulos aparecen en la barra lateral para todos los usuarios.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAll(ALL_MODULES.map(m => m.path))} className="btn-secondary text-xs py-1.5 px-3">
            Todos
          </button>
          <button onClick={() => setAll([])} className="btn-secondary text-xs py-1.5 px-3">
            Ninguno
          </button>
        </div>
      </div>

      <div className="card divide-y divide-gray-100">
        {ALL_MODULES.map(mod => {
          const on = enabledModules.includes(mod.path);
          return (
            <div key={mod.path} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <span className="font-medium text-gray-800 text-sm">{mod.label}</span>
                <span className="ml-2 text-xs text-gray-400 font-mono">{mod.path}</span>
              </div>
              <button
                type="button"
                onClick={() => toggle(mod.path)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${on ? 'bg-brand-500 border-brand-500' : 'bg-gray-200 border-gray-200'}`}
                aria-checked={on}
                role="switch"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 mt-0.5 ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400">Los cambios se aplican inmediatamente y se guardan localmente en este navegador.</p>
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────
type Tab = 'empresa' | 'usuarios' | 'modulos';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('empresa');

  const TABS: { id: Tab; label: string; icon: ElementType }[] = [
    { id: 'empresa',  label: 'Empresa',   icon: Building2 },
    { id: 'usuarios', label: 'Usuarios',  icon: Users },
    { id: 'modulos',  label: 'Módulos',   icon: LayoutGrid },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 mt-1 text-sm">Gestiona empresa, usuarios y módulos del sistema.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-brand-50 rounded-xl p-1 w-fit border border-brand-100">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${tab === id ? 'bg-white shadow-sm text-brand-700' : 'text-brand-600 hover:text-brand-800'}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'empresa'  && <EmpresaTab />}
      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'modulos'  && <ModulosTab />}
    </div>
  );
}
