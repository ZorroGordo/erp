import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBrand } from '../contexts/BrandContext';
import { useModules } from '../contexts/ModulesContext';
import { api } from '../lib/api';
import {
  LayoutDashboard, Package, ShoppingBag, Users, ShoppingCart,
  Factory, Truck, ClipboardList, UserCheck, Calculator,
  Receipt, Brain, LogOut, ChevronRight, Menu, X, Settings, Archive, ArrowLeft
} from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const nav = [
  { to: '/dashboard',   label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/inventory',   label: 'Inventario',      icon: Package },
  { to: '/products',    label: 'Catálogo',         icon: ShoppingBag },
  { to: '/customers',   label: 'Clientes',         icon: Users },
  { to: '/sales',       label: 'Ventas',           icon: ShoppingCart },
  { to: '/production',  label: 'Producción',       icon: Factory },
  { to: '/procurement', label: 'Compras',          icon: ClipboardList },
  { to: '/delivery',    label: 'Despacho',         icon: Truck },
  { to: '/payroll',     label: 'Planilla',         icon: UserCheck },
  { to: '/accounting',  label: 'Contabilidad',     icon: Calculator },
  { to: '/invoices',       label: 'Facturación',      icon: Receipt },
  { to: '/comprobantes',  label: 'Comprobantes',     icon: Archive },
  { to: '/ai',            label: 'IA Forecast',      icon: Brain },
];

const navBottom = [
  { to: '/settings', label: 'Configuración', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { brand } = useBrand();
  const { isEnabled } = useModules();
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== 'default';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [emailPendientes, setEmailPendientes] = useState(0);

  // Poll comprobantes email-pending count every 60 s
  useEffect(() => {
    let cancelled = false;
    const fetchBadge = async () => {
      try {
        const res = await api.get('/v1/comprobantes/stats/summary');
        if (!cancelled) setEmailPendientes(res.data?.data?.emailPendientes ?? 0);
      } catch { /* silent */ }
    };
    fetchBadge();
    const id = setInterval(fetchBadge, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const visibleNav = nav.filter(item => isEnabled(item.to, user?.roles));

  const handleLogout = async () => {
    await logout();
    toast.success('Sesión cerrada');
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-brand-50">
      {/* Sidebar — dark forest green */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} flex-shrink-0 bg-brand-700 text-white flex flex-col transition-all duration-200`}>
        {/* Logo */}
        {sidebarOpen ? (
          <div className="flex items-center gap-3 px-4 py-5 border-b border-brand-800">
            <span className="text-2xl">{brand.logoEmoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight tracking-wide truncate">{brand.name}</p>
              <p className="text-brand-300 text-xs truncate">{brand.fullName}</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-brand-300 hover:text-white p-1 rounded flex-shrink-0"
              title="Colapsar"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-5 border-b border-brand-800">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-brand-300 hover:text-white p-1.5 rounded"
              title="Expandir"
            >
              <Menu size={18} />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto flex flex-col">
          <div className="flex-1">
            {visibleNav.map(({ to, label, icon: Icon }) => {
              const badge = to === '/comprobantes' && emailPendientes > 0 ? emailPendientes : 0;
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative group
                    ${isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-brand-300 hover:bg-brand-600 hover:text-white'
                    }`
                  }
                >
                  <div className="relative flex-shrink-0">
                    <Icon size={18} />
                    {badge > 0 && !sidebarOpen && (
                      <span className="absolute -top-1 -right-1 bg-sky-400 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </div>
                  {sidebarOpen && (
                    <span className="flex items-center gap-2 flex-1">
                      {label}
                      {badge > 0 && (
                        <span className="ml-auto bg-sky-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </span>
                  )}
                  {!sidebarOpen && (
                    <div className="absolute left-16 bg-brand-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                      {label}{badge > 0 ? ` (${badge} email)` : ''}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>

          {/* Bottom nav — Settings */}
          <div className="border-t border-brand-800 pt-2 mt-2">
            {navBottom.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative group
                  ${isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-brand-300 hover:bg-brand-600 hover:text-white'
                  }`
                }
              >
                <Icon size={18} className="flex-shrink-0" />
                {sidebarOpen && <span>{label}</span>}
                {!sidebarOpen && (
                  <div className="absolute left-16 bg-brand-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                    {label}
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User */}
        <div className="border-t border-brand-800 p-4">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {user?.fullName?.[0] ?? 'V'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.fullName}</p>
                <p className="text-xs text-brand-300 truncate">{user?.roles?.[0]}</p>
              </div>
              <button onClick={handleLogout} className="text-brand-300 hover:text-white p-1">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="text-brand-300 hover:text-white p-1 mx-auto block">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — white with cream-tinted border */}
        <header className="bg-white border-b border-brand-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {canGoBack && (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1 text-gray-400 hover:text-brand-700 transition-colors p-1 rounded hover:bg-brand-50"
                title="Volver"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <ChevronRight size={14} className="text-gray-300" />
            <span className="text-gray-900 font-medium capitalize">
              {location.pathname.split('/')[1] || 'Dashboard'}
            </span>
          </div>
          <div className="text-xs text-gray-400">
            {new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
