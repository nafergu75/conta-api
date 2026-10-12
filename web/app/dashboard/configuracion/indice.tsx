'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowSquareOut,
  Bank,
  BookBookmark,
  Books,
  Buildings,
  CalendarCheck,
  CaretRight,
  Gear,
  ListNumbers,
  Percent,
  Receipt,
  UserCircle,
  UsersThree,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { tieneAlgunPermiso } from '@/lib/auth';
import { puedeVer } from '@/lib/configuracion';
import { puedeGestionarUsuarios } from '@/lib/usuarios-empresa';
import { useConfiguracion } from './contexto';

/**
 * Indice de Configuracion: lateral en escritorio y lista en la portada del
 * movil. Cada entrada se ve segun los permisos en la empresa activa y su pais.
 */

export const BASE = '/dashboard/configuracion';

interface EntradaIndice {
  etiqueta: string;
  href: string;
  icono: Icon;
  /** true: lleva a otra pantalla de la app (fuera de Configuracion). */
  externa?: boolean;
}

function entradasVisibles(ctx: ReturnType<typeof useConfiguracion>): EntradaIndice[] {
  const { user, espanola, inscribible } = ctx;
  const lista: Array<EntradaIndice & { visible: boolean }> = [
    { etiqueta: 'Resumen', href: BASE, icono: Gear, visible: true },
    { etiqueta: 'Datos de la empresa', href: '/dashboard/empresa', icono: Buildings, externa: true, visible: true },
    { etiqueta: 'Ejercicios y periodos', href: `${BASE}/ejercicios`, icono: CalendarCheck, visible: puedeVer(user, 'ejercicios') },
    { etiqueta: 'Series de numeración', href: `${BASE}/series`, icono: ListNumbers, visible: puedeVer(user, 'series') },
    { etiqueta: 'Facturación', href: `${BASE}/facturacion`, icono: Receipt, visible: puedeVer(user, 'facturacion') },
    // Solo empresas establecidas en España (modelos de la AEAT).
    { etiqueta: 'Impuestos', href: `${BASE}/impuestos`, icono: Percent, visible: puedeVer(user, 'impuestos') && espanola !== false },
    {
      etiqueta: 'Cuentas bancarias',
      href: '/dashboard/tesoreria/cuentas',
      icono: Bank,
      externa: true,
      visible: tieneAlgunPermiso(user, ['tesoreria:read', 'tesoreria:write']),
    },
    { etiqueta: 'Contabilidad', href: `${BASE}#contabilidad`, icono: Books, visible: tieneAlgunPermiso(user, ['contabilidad:read']) },
    {
      etiqueta: 'Registro Mercantil',
      href: '/dashboard/registro-mercantil',
      icono: BookBookmark,
      externa: true,
      visible: inscribible && tieneAlgunPermiso(user, ['contabilidad:read']),
    },
    // Alta de usuarios, permisos y contraseñas: el administrador global y el de cada empresa.
    { etiqueta: 'Usuarios', href: `${BASE}/usuarios`, icono: UsersThree, visible: puedeGestionarUsuarios(user) },
    { etiqueta: 'Tu acceso', href: `${BASE}/acceso`, icono: UserCircle, visible: true },
  ];
  return lista.filter((e) => e.visible);
}

export function Indice({ variante }: { variante: 'lateral' | 'lista' }) {
  const ctx = useConfiguracion();
  const pathname = usePathname();
  const lateral = variante === 'lateral';
  // En la lista de la portada (movil) no hace falta enlazar a la propia portada.
  const entradas = entradasVisibles(ctx).filter((e) => lateral || e.href !== BASE);
  return (
    <nav aria-label="Secciones de Configuración">
      <ul className={lateral ? 'flex flex-col gap-0.5' : 'divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white'}>
        {entradas.map((e) => {
          const activa = !e.externa && !e.href.includes('#') && pathname === e.href;
          const Icono = e.icono;
          return (
            <li key={e.href}>
              <Link
                href={e.href}
                aria-current={activa ? 'page' : undefined}
                className={
                  lateral
                    ? `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        activa ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    : 'flex items-center gap-3 px-4 py-3 text-sm text-slate-800 hover:bg-slate-50'
                }
              >
                <Icono size={18} weight={activa ? 'duotone' : 'regular'} className={activa ? 'text-emerald-700' : 'text-slate-400'} />
                <span className="min-w-0 flex-1 truncate">{e.etiqueta}</span>
                {e.externa ? (
                  <ArrowSquareOut size={14} className="shrink-0 text-slate-400" aria-label="(otra pantalla)" />
                ) : (
                  !lateral && <CaretRight size={14} className="shrink-0 text-slate-400" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
