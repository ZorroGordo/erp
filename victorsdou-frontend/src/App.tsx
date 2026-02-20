import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

export default function App() {
  return (
    <BrandProvider>
      <ModulesProvider>
      <AuthProvider>
        <BrowserRouter>
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
