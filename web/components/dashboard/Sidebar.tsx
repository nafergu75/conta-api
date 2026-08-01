'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChartPieSlice,
  Users,
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
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { NAV_GROUPS } from './nav';
import { getUser, type SessionUser } from '@/lib/auth';

const ICONS: Record<string, Icon> = {
  '': ChartPieSlice,
  clientes: Users,
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
  archivo: FolderOpen,
  ocr: Eye,
  carmen: Robot,
  configuracion: Gear,
};

function userHasRole(userRoles: string[] | undefined, requiredRoles: string[] | undefined): boolean {
  // Sin requiredRoles especificado = accesible a todos
  if (!requiredRoles || requiredRoles.length === 0) return true;

  // Sin roles de usuario = no tiene acceso
  if (!userRoles || userRoles.length === 0) return false;

  // Usuario tiene al menos uno de los roles requeridos
  return requiredRoles.some((role) => userRoles.includes(role));
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  // La sesion vive en localStorage, que no existe al renderizar en servidor.
  // Leerla directamente daba un desajuste de hidratacion: el servidor pintaba
  // el menu vacio (sin roles) y el cliente lo pintaba lleno. Se lee tras montar,
  // de modo que el primer render coincide en ambos lados.
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setMounted(true);
  }, []);

  if (!mounted) {
    return <nav className="flex flex-col gap-6 p-4" aria-busy="true" />;
  }

  return (
    <nav className="flex flex-col gap-6 p-4">
      {NAV_GROUPS.map((group) => {
        // Filtrar items por rol
        const visibleItems = group.items.filter((item) =>
          userHasRole(user?.roles, item.requiredRoles)
        );

        // No mostrar grupo si no tiene items visibles
        if (visibleItems.length === 0) return null;

        return (
          <div key={group.title}>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
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
          </div>
        );
      })}
    </nav>
  );
}
