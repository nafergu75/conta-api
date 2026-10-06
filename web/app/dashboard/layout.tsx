'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { List, X } from '@phosphor-icons/react';
import Sidebar from '@/components/dashboard/Sidebar';
import { actualizarPermisos, getToken, getUser, tieneAlgunPermiso } from '@/lib/auth';
import { apiFetch, companyPath } from '@/lib/api';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Guard unico para todo /dashboard: sin sesion, al login. La sesion vive en
  // localStorage, asi que solo se puede comprobar tras montar.
  const [autorizado, setAutorizado] = useState(false);

  useEffect(() => {
    if (getToken()) setAutorizado(true);
    else router.replace('/login');
  }, [router]);

  // Permisos actuales del servidor: la sesion guardada puede ser de antes de un
  // cambio de rol o de un arreglo de permisos y dejar el menu a medias.
  useEffect(() => {
    // La demo sin backend no tiene sesion real: un 401 la echaria al login.
    if (!autorizado || getToken() === 'demo-local-sin-backend') return;
    apiFetch<Parameters<typeof actualizarPermisos>[0]>('/auth/me')
      .then(actualizarPermisos)
      .catch(() => {
        // Sin backend (demo): se queda la sesion guardada.
      });
  }, [autorizado]);

  // Empresa sin sus datos (NIF, domicilio, Registro Mercantil...): primero se
  // completan, porque salen en todas las facturas. Solo a quien puede editarlos.
  const pathname = usePathname();
  useEffect(() => {
    if (!autorizado || pathname.startsWith('/dashboard/empresa')) return;
    if (!tieneAlgunPermiso(getUser(), ['contabilidad:write'])) return;
    apiFetch<{ completo?: boolean }>(companyPath('/legal-config'))
      .then((cfg) => {
        if (cfg.completo === false) router.replace('/dashboard/empresa?primera=1');
      })
      .catch(() => {
        // Sin backend (demo) o sin permiso: no se fuerza nada.
      });
  }, [autorizado, pathname, router]);

  if (!autorizado) {
    return <div className="zona-app min-h-[100dvh] bg-slate-50" aria-busy="true" />;
  }

  return (
    <div className="zona-app min-h-[100dvh] bg-slate-50 md:grid md:grid-cols-[260px_1fr]">
      {/* Sidebar desktop */}
      <aside className="hidden md:block border-r border-slate-200 bg-white">
        <div className="sticky top-0 max-h-[100dvh] overflow-y-auto">
          <div className="h-16 flex items-center px-6 border-b border-slate-200">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-slate-900"
            >
              <span className="w-7 h-7 bg-accent-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                CA
              </span>
              Conta API
            </Link>
          </div>
          <Sidebar />
        </div>
      </aside>

      {/* Sidebar móvil (drawer) */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[85vw] bg-white h-full overflow-y-auto shadow-xl">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200">
              <span className="font-semibold text-slate-900">Menú</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="p-2 text-slate-500"
              >
                <X size={20} />
              </button>
            </div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
          <button
            aria-label="Cerrar menú"
            className="flex-1 bg-slate-900/40"
            onClick={() => setOpen(false)}
          />
        </div>
      )}

      <div className="min-w-0">
        {/* Botón menú móvil */}
        <button
          onClick={() => setOpen(true)}
          className="md:hidden fixed bottom-5 right-5 z-40 w-12 h-12 bg-accent-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-[0.95] transition-transform"
          aria-label="Abrir menú"
        >
          <List size={22} weight="bold" />
        </button>
        {children}
      </div>
    </div>
  );
}
