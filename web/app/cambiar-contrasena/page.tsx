'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle } from '@phosphor-icons/react';
import FormCambiarContrasena, { type ResultadoLogin } from '@/components/cuenta/FormCambiarContrasena';
import { actualizarPermisos, clearSession, getToken, getUser, marcarContrasenaCambiada } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

/**
 * Poner una contrasena propia. Va fuera de /dashboard para no cargar menu,
 * Carmen ni datos: con la contrasena provisional el servidor solo deja usar
 * /auth/me y /auth/cambiar-contrasena.
 *
 * - Con la contrasena provisional (debeCambiarContrasena): modo obligatorio.
 * - Sin ella: modo voluntario, con enlace para volver al panel.
 */
export default function CambiarContrasenaPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [obligatorio, setObligatorio] = useState(false);
  const [email, setEmail] = useState('');
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const u = getUser();
    setObligatorio(u?.debeCambiarContrasena === true);
    setEmail(u?.email ?? '');
    setListo(true);
    // Lo que dice el servidor manda sobre lo guardado en el navegador.
    if (getToken() === 'demo-local-sin-backend') return;
    apiFetch<Parameters<typeof actualizarPermisos>[0]>('/auth/me')
      .then((d) => {
        actualizarPermisos(d);
        setObligatorio(d.user?.debeCambiarContrasena === true);
        if (d.user?.email) setEmail(d.user.email);
      })
      .catch(() => {
        // Sin backend o sesion caducada (apiFetch ya lleva al login con un 401).
      });
  }, [router]);

  function alTerminar(r: ResultadoLogin) {
    marcarContrasenaCambiada(r.token, r);
    if (obligatorio) {
      router.replace('/dashboard');
      return;
    }
    setHecho(true);
  }

  function salir() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="zona-app min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="flex items-center gap-2 font-semibold text-xl text-slate-900 mb-8">
        <span className="w-8 h-8 bg-accent-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">CA</span>
        Conta API
      </div>

      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8" aria-busy={!listo}>
        {listo && (
          <>
            <h1 className="text-xl font-semibold text-slate-900 mb-1">
              {obligatorio ? 'Pon una contraseña tuya' : 'Cambiar contraseña'}
            </h1>
            {obligatorio && (
              <p className="text-sm text-slate-600 mb-6">
                Has entrado con una contraseña provisional que te dio el administrador. Para seguir, elige una que solo sepas tú.
              </p>
            )}
            {!obligatorio && !hecho && <p className="text-sm text-slate-500 mb-6">{email}</p>}

            {hecho ? (
              <div className="mt-4 flex flex-col gap-4">
                <p role="status" className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
                  Contraseña cambiada. Si tenías la sesión abierta en otro sitio, allí tendrás que volver a entrar.
                </p>
                <Link
                  href="/dashboard"
                  className="w-full min-h-[44px] flex items-center justify-center rounded-lg bg-accent-600 py-2.5 font-semibold text-white hover:bg-accent-700"
                >
                  Volver al panel
                </Link>
              </div>
            ) : (
              <FormCambiarContrasena obligatorio={obligatorio} email={email} onHecho={alTerminar} />
            )}

            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col gap-2 sm:flex-row sm:justify-between">
              {!obligatorio && !hecho && (
                <Link
                  href="/dashboard"
                  className="min-h-[44px] flex items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Volver al panel
                </Link>
              )}
              <button
                type="button"
                onClick={salir}
                className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:ml-auto"
              >
                Salir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
