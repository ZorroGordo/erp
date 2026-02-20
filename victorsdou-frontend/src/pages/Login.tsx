import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBrand } from '../contexts/BrandContext';
import toast from 'react-hot-toast';

export default function Login() {
  const { login, user } = useAuth();
  const { brand } = useBrand();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@victorsdou.pe');
  const [password, setPassword] = useState('Admin@Victorsdou2026!');
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/dashboard', { replace: true }); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success(`¡Bienvenido a ${brand.name}!`);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — decorative green brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-700 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Topographic-style decorative rings — echoes Victorsdou logo */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-white"
              style={{
                width: `${(i + 1) * 120}px`,
                height: `${(i + 1) * 120}px`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>
        <div className="relative z-10 text-center">
          <div className="text-8xl mb-6">{brand.logoEmoji}</div>
          <h1 className="text-4xl font-bold text-white tracking-tight">{brand.name}</h1>
          <p className="text-brand-300 mt-3 text-lg">{brand.tagline}</p>
        </div>
      </div>

      {/* Right panel — login form on warm cream */}
      <div className="flex-1 flex items-center justify-center p-8 bg-brand-50">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="text-5xl mb-2">{brand.logoEmoji}</div>
            <h1 className="text-2xl font-bold text-brand-700">{brand.name}</h1>
            <p className="text-brand-500 text-sm mt-1">{brand.tagline}</p>
          </div>

          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-bold text-gray-900">Bienvenido</h2>
            <p className="text-gray-500 mt-1 text-sm">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="card p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="usuario@empresa.pe"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-base">
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {/* Quick-fill test accounts */}
          <div className="mt-5 card p-4 text-xs text-gray-500">
            <p className="font-semibold text-gray-700 mb-2">Cuentas de prueba:</p>
            {[
              { e: 'admin@victorsdou.pe',       p: 'Admin@Victorsdou2026!',   r: 'SUPER_ADMIN' },
              { e: 'finanzas@victorsdou.pe',     p: 'Finance@Victorsdou2026!', r: 'FINANCE_MGR' },
              { e: 'operaciones@victorsdou.pe',  p: 'Ops@Victorsdou2026!',     r: 'OPS_MGR' },
            ].map(u => (
              <button
                key={u.e}
                type="button"
                onClick={() => { setEmail(u.e); setPassword(u.p); }}
                className="w-full text-left hover:bg-brand-50 p-1.5 rounded transition-colors"
              >
                <span className="font-medium text-brand-700">{u.r}</span>
                <span className="text-gray-400 ml-2">{u.e}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
