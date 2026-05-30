import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BrandProvider } from './contexts/BrandContext';
import { ModulesProvider } from './contexts/ModulesContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Products from './pages/Products';
import Customers from './pages/Customers';
import SalesOrders from './pages/SalesOrders';
import Production from './pages/Production';
import Procurement from './pages/Procurement';
import Delivery from './pages/Delivery';
import Payroll from './pages/Payroll';
import Accounting from './pages/Accounting';
import Invoices from './pages/Invoices';
import AiForecast from './pages/AiForecast';
import Settings from './pages/Settings';
import Comprobantes from './pages/Comprobantes';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
    </div>
  );
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

// ── VersionWatcher ───────────────────────────────────────────────────────────
// Detects a new deploy by comparing the loaded JS bundle to the one referenced
// by the freshly-fetched index.html. Shows a "refresh" toast, or — if the user
// has been idle for more than 1 hour — reloads automatically.
function loadedBundle(): string | null {
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  for (const s of scripts) {
    const m = (s.getAttribute('src') || '').match(/index-[\w-]+\.js/);
    if (m) return m[0];
  }
  return null;
}

function VersionWatcher() {
  const loaded = useRef<string | null>(loadedBundle());
  const lastActivity = useRef<number>(Date.now());
  const notified = useRef(false);

  useEffect(() => {
    if (!loaded.current) return; // dev server (no hashed bundle) — nothing to watch
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, bump, { passive: true }));

    const check = async () => {
      try {
        const html = await fetch(`/index.html?ts=${Date.now()}`, { cache: 'no-store' }).then(r => r.text());
        const latest = html.match(/index-[\w-]+\.js/)?.[0] ?? null;
        if (!latest || latest === loaded.current) return;
        // New version deployed.
        if (Date.now() - lastActivity.current > 60 * 60 * 1000) {
          window.location.reload(); // idle > 1h: push the update silently
          return;
        }
        if (!notified.current) {
          notified.current = true;
          toast((t) => (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-800">Hay una nueva versión disponible.</span>
              <button onClick={() => window.location.reload()}
                className="text-sm font-semibold bg-brand-600 text-white px-3 py-1 rounded-lg hover:bg-brand-700">
                Actualizar
              </button>
              <button onClick={() => toast.dismiss(t.id)} className="text-sm text-gray-400 hover:text-gray-600">Después</button>
            </div>
          ), { duration: Infinity, id: 'app-update' });
        }
      } catch { /* ignore transient network errors */ }
    };

    const interval = setInterval(check, 3 * 60 * 1000); // every 3 min
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      events.forEach(e => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <BrandProvider>
      <ModulesProvider>
      <AuthProvider>
        <BrowserRouter>
          <VersionWatcher />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"    element={<Dashboard />} />
              <Route path="inventory"    element={<Inventory />} />
              <Route path="products"     element={<Products />} />
              <Route path="customers"    element={<Customers />} />
              <Route path="sales"        element={<SalesOrders />} />
              <Route path="production"   element={<Production />} />
              <Route path="procurement"  element={<Procurement />} />
              <Route path="delivery"     element={<Delivery />} />
              <Route path="payroll"      element={<Payroll />} />
              <Route path="accounting"   element={<Accounting />} />
              <Route path="invoices"       element={<Invoices />} />
              <Route path="comprobantes" element={<Comprobantes />} />
              <Route path="ai"           element={<AiForecast />} />
              <Route path="settings"     element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </ModulesProvider>
    </BrandProvider>
  );
}
