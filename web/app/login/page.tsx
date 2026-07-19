'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveSession } from '@/lib/auth';

const API = '/api/conta';

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
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Credenciales incorrectas');
      }
      const data = json.data ?? json;
      saveSession(data.token, {
        email: data.user?.email ?? email,
        roles: data.user?.roles ?? [],
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
      setLoading(false);
    }
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
              placeholder="demo1234"
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

        <p className="text-xs text-slate-400 mt-6 text-center">
          Demo: demo@empresa.com / demo1234
        </p>
      </div>
    </div>
  );
}
