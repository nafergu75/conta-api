'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { empresaInicial, saveSession } from '@/lib/auth';

const API = '/api/conta';

// Acceso directo sin backend. Activo siempre en desarrollo; en un build de
// produccion SOLO si se define NEXT_PUBLIC_DEMO_MODE=true de forma explicita,
// para que no se pueda colar por descuido en la app publica.
const DEMO_MODE =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true';


export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@empresa.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      // Si el proxy no llega al backend, la respuesta es una pagina HTML de
      // error. Sin este control, el JSON.parse revienta con un
      // "Unexpected token '<'" que no le dice nada a quien lo ve.
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          `El servidor no responde (HTTP ${res.status}). El backend no está accesible; no es un problema de tu contraseña.`
        );
      }

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Credenciales incorrectas');
      }
      const data = json.data ?? json;
      const correo = data.user?.email ?? email;
      const companies: string[] = data.user?.companies ?? [];
      const esAdminGlobal = Boolean(data.user?.esAdminGlobal);
      saveSession(data.token, {
        email: correo,
        roles: data.user?.roles ?? [],
        companies,
        empresas: data.empresas ?? [],
        empresaActiva: empresaInicial(correo, companies, esAdminGlobal),
        permisos: data.user?.permisos ?? [],
        permisosPorEmpresa: data.user?.permisosPorEmpresa ?? {},
        esAdminGlobal,
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
      setLoading(false);
    }
  }

  function entrarSinBackend() {
    saveSession('demo-local-sin-backend', {
      email: 'demo@empresa.com',
      // La demo ve todo el menu; no hay backend que aplique permisos.
      roles: ['admin'],
      companies: ['1'],
      permisos: ['*'],
    });
    router.push('/dashboard');
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center px-4">
      <Link
        href="/"
        className="flex items-center gap-2 font-semibold text-xl text-slate-900 mb-8"
      >
        <span className="w-8 h-8 bg-accent-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
          CA
        </span>
        Conta API
      </Link>

      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">
          Iniciar sesión
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Accede al panel de tu empresa
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="email"
              className="text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-slate-700"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-2.5 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {DEMO_MODE && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <button
              type="button"
              onClick={entrarSinBackend}
              className="w-full py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              Entrar sin contraseña
            </button>
            <p className="text-xs text-slate-400 mt-3 text-center">
              Acceso directo para revisar la interfaz. Los datos aparecerán
              vacíos: no hay backend conectado.
            </p>
          </div>
        )}

        {/* Credenciales de la base local de desarrollo; en produccion no se muestran. */}
        {DEMO_MODE && (
          <p className="text-xs text-slate-400 mt-6 text-center">
            Demo local: demo@empresa.com / demo1234
          </p>
        )}
      </div>
    </div>
  );
}
