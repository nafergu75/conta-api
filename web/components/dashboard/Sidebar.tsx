'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  CaretDown,
  ChartPieSlice,
  Users,
  Package,
  FileText,
  ScanSmiley,
  Truck,
  ShoppingCart,
  ArrowsLeftRight,
  ListNumbers,
  Cpu,
  LockKey,
  Bank,
  ArrowsClockwise,
  Scales,
  Buildings,
  BookBookmark,
  IdentificationBadge,
  ChartLineUp,
  Robot,
  Gear,
  FolderOpen,
  Eye,
  AddressBook,
  SignOut,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { NAV_GROUPS } from './nav';
import { EmpresaSelector } from './EmpresaSelector';
import { clearSession, getUser, tieneAlgunPermiso, type SessionUser } from '@/lib/auth';

const ICONS: Record<string, Icon> = {
  '': ChartPieSlice,
  clientes: Users,
  productos: Package,
  facturas: FileText,
  lector: ScanSmiley,
  proveedores: Truck,
  compras: ShoppingCart,
  movimientos: ArrowsLeftRight,
  'plan-contable': ListNumbers,
  'motor-contable': Cpu,
  cierre: LockKey,
  extractos: Bank,
  conciliacion: ArrowsClockwise,
  'cuadre-bancos': Scales,
  impuestos: Buildings,
  fiscal: Buildings,
  sociedades: Buildings,
  'registro-mercantil': BookBookmark,
  nominas: IdentificationBadge,
  informes: ChartLineUp,
  'mayor-terceros': AddressBook,
  archivo: FolderOpen,
  ocr: Eye,
  carmen: Robot,
  configuracion: Gear,
};

const CLAVE_GRUPOS = 'menu-grupos-abiertos';

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  // La sesion vive en localStorage, que no existe al renderizar en servidor.
  // Leerla directamente daba un desajuste de hidratacion: el servidor pintaba
  // el menu vacio (sin roles) y el cliente lo pintaba lleno. Se lee tras montar,
  // de modo que el primer render coincide en ambos lados.
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mounted, setMounted] = useState(false);
  // Grupos del menu desplegados (se recuerda por navegador).
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_GRUPOS);
      if (guardado) setAbiertos(JSON.parse(guardado));
    } catch {
      // Sin almacenamiento: todos plegados salvo el de la pagina actual.
    }
  }, []);

  const alternar = (titulo: string, abierto: boolean) =>
    setAbiertos((a) => {
      const nuevo = { ...a, [titulo]: !abierto };
      try {
        localStorage.setItem(CLAVE_GRUPOS, JSON.stringify(nuevo));
      } catch {
        // No pasa nada si no se puede guardar.
      }
      return nuevo;
    });

  useEffect(() => {
    setUser(getUser());
    setMounted(true);
  }, []);

  function cerrarSesion() {
    clearSession();
    onNavigate?.();
    router.replace('/login');
  }

  if (!mounted) {
    return <nav className="flex flex-col gap-6 p-4" aria-busy="true" />;
  }

  return (
    <nav className="flex flex-col gap-2 p-4">
      {user && <EmpresaSelector user={user} />}
      {NAV_GROUPS.map((group) => {
        // Filtrar items por permiso (requiredRoles contiene codigos de permiso)
        const visibleItems = group.items.filter((item) =>
          tieneAlgunPermiso(user, item.requiredRoles)
        );

        // No mostrar grupo si no tiene items visibles
        if (visibleItems.length === 0) return null;

        // El grupo de la pagina actual se abre solo; el resto, como lo dejo el usuario.
        const contieneActual = visibleItems.some((item) => {
          const href = item.slug ? `/dashboard/${item.slug}` : '/dashboard';
          return pathname === href || (item.subItems ?? []).some((s) => pathname === `/dashboard/${s.slug}`);
        });
        const abierto = abiertos[group.title] ?? contieneActual;
        const idLista = `grupo-${group.title.replace(/\W+/g, '-')}`;

        return (
          <div key={group.title}>
            <button
              type="button"
              onClick={() => alternar(group.title, abierto)}
              aria-expanded={abierto}
              aria-controls={idLista}
              className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <span>{group.title}</span>
              <CaretDown size={12} weight="bold" className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
            </button>
            {abierto && (
            <ul id={idLista} className="flex flex-col gap-0.5">
              {visibleItems.map((item) => {
                const href = item.slug ? `/dashboard/${item.slug}` : '/dashboard';
                const active = pathname === href;
                const subItems = item.subItems;
                const Icon = ICONS[item.slug] ?? ChartPieSlice;

                if (subItems && subItems.length > 0) {
                  return (
                    <li key={item.slug || 'resumen'} className="flex flex-col">
                      <Link
                        href={href}
                        onClick={onNavigate}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active
                            ? 'bg-emerald-50 text-emerald-800 font-semibold'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon
                          size={18}
                          weight={active ? 'duotone' : 'regular'}
                          className={active ? 'text-accent-600' : 'text-slate-400'}
                        />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                      <ul className="mt-1 ml-6 flex flex-col gap-0.5 border-l border-slate-100 pl-3">
                        {subItems.map((subItem) => {
                          const subHref = `/dashboard/${subItem.slug}`;
                          const subActive = pathname === subHref;
                          return (
                            <li key={subItem.slug}>
                              <Link
                                href={subHref}
                                onClick={onNavigate}
                                className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs transition-colors ${
                                  subActive
                                    ? 'bg-emerald-50 text-emerald-700 font-semibold'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                }`}
                              >
                                <span className="flex-1">{subItem.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                }

                return (
                  <li key={item.slug || 'resumen'}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? 'bg-emerald-50 text-emerald-800 font-semibold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon
                        size={18}
                        weight={active ? 'duotone' : 'regular'}
                        className={active ? 'text-accent-600' : 'text-slate-400'}
                      />
                      <span className="flex-1">{item.label}</span>
                      {!item.implemented && (
                        <span className="text-[10px] font-medium text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                          API
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            )}
          </div>
        );
      })}

      <div className="mt-2 border-t border-slate-200 pt-4">
        {user?.email && (
          <p className="px-3 mb-2 truncate text-xs text-slate-500" title={user.email}>
            {user.email}
          </p>
        )}
        <button
          type="button"
          onClick={cerrarSesion}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <SignOut size={18} className="text-slate-400" />
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
