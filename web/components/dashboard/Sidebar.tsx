'use client';

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
  sociedades: Buildings,
  'registro-mercantil': BookBookmark,
  nominas: IdentificationBadge,
  informes: ChartLineUp,
  archivo: FolderOpen,
  ocr: Eye,
  carmen: Robot,
  configuracion: Gear,
};

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6 p-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = item.slug ? `/dashboard/${item.slug}` : '/dashboard';
              const active = pathname === href;
              const Icon = ICONS[item.slug] ?? ChartPieSlice;
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
      ))}
    </nav>
  );
}
