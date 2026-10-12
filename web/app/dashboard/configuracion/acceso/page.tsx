'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, UserCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { nombreRol, permisosActivos, rolEnEmpresaActiva, tieneAlgunPermiso } from '@/lib/auth';
import { puedeVer, type Miembro } from '@/lib/configuracion';
import { CabeceraBloque, Etiqueta, Mensaje } from '../componentes';
import { useConfiguracion } from '../contexto';

/**
 * Tu acceso y usuarios: el perfil del usuario en la empresa activa (rol y lo
 * que puede hacer) y, para el administrador de la empresa, la lista de quien
 * tiene acceso (solo lectura). Las altas y los cambios se hacen en
 * Configuracion > Usuarios.
 */

const AREAS: Array<{ recurso: string; nombre: string }> = [
  { recurso: 'ventas', nombre: 'Ventas y facturas' },
  { recurso: 'compras', nombre: 'Compras y gastos' },
  { recurso: 'contabilidad', nombre: 'Contabilidad' },
  { recurso: 'tesoreria', nombre: 'Tesorería y bancos' },
  { recurso: 'impuestos', nombre: 'Impuestos' },
  { recurso: 'nominas', nombre: 'Nóminas' },
];

/** «Ventas y facturas: ver y cambiar · Contabilidad: solo ver» (sin las areas a las que no entra). */
function resumenAMedida(areas: NonNullable<Miembro['areas']>): string {
  const partes = AREAS.flatMap((a) => {
    const nivel = areas[a.recurso as keyof typeof areas];
    if (nivel === 'modificar') return [`${a.nombre}: ver y cambiar`];
    if (nivel === 'ver') return [`${a.nombre}: solo ver`];
    return [];
  });
  return partes.length ? partes.join(' · ') : 'Sin acceso a ninguna área.';
}

export default function AccesoPage() {
  const { user, listo, empresa } = useConfiguracion();
  const verMiembros = puedeVer(user, 'miembros');
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!listo || !verMiembros) return;
    apiFetch<Miembro[]>(companyPath('/miembros'))
      .then(setMiembros)
      .catch((e) => setError(errorMessage(e)));
  }, [listo, verMiembros]);

  if (!listo) return null;

  const total = permisosActivos(user).includes('*');
  const rol = rolEnEmpresaActiva(user);
  const nombreEmpresa =
    empresa?.denominacion || user?.empresas?.find((e) => e.companyId === (user?.empresaActiva ?? user?.companies?.[0]))?.nombre || 'esta empresa';

  return (
    <>
      <CabeceraBloque icono={UserCircle} titulo="Tu acceso y usuarios" descripcion="Con qué usuario entras, qué puedes hacer en esta empresa y quién más tiene acceso." />

      <section aria-labelledby="perfil" className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <h2 id="perfil" className="font-semibold text-slate-900">
          Tu perfil
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Usuario</dt>
            <dd className="truncate text-slate-900">{user?.email ?? '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Tu rol en {nombreEmpresa}</dt>
            <dd className={user?.esAdminGlobal ? 'font-medium text-indigo-700' : 'text-slate-900'}>{rol ?? 'Sin datos todavía'}</dd>
          </div>
        </dl>

        <h3 className="mt-5 text-sm font-medium text-slate-700">Lo que puedes hacer</h3>
        {total ? (
          <p className="mt-1 text-sm text-slate-600">
            Control total de la empresa: ver y cambiar todo, incluida su configuración.
            {user?.esAdminGlobal && ' Además, como administrador de la plataforma, gestionas todas las empresas y usuarios.'}
          </p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {AREAS.map((a) => {
              const escribe = tieneAlgunPermiso(user, [`${a.recurso}:write`]);
              const lee = escribe || tieneAlgunPermiso(user, [`${a.recurso}:read`]);
              return (
                <li key={a.recurso} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="text-slate-800">{a.nombre}</span>
                  {escribe ? (
                    <Etiqueta tono="verde">Ver y cambiar</Etiqueta>
                  ) : lee ? (
                    <Etiqueta tono="azul">Solo ver</Etiqueta>
                  ) : (
                    <Etiqueta tono="gris">Sin acceso</Etiqueta>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {verMiembros && (
        <section aria-labelledby="miembros" className="rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-200 px-4 py-3 md:px-5">
            <h2 id="miembros" className="font-semibold text-slate-900">
              Quién tiene acceso a {nombreEmpresa}
            </h2>
          </header>
          {error ? (
            <div className="p-4 md:p-5">
              <Mensaje mensaje={{ ok: false, texto: error }} />
            </div>
          ) : !miembros ? (
            <p className="px-4 py-4 text-sm text-slate-500 md:px-5">Cargando…</p>
          ) : miembros.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-600 md:px-5">Nadie tiene acceso directo a esta empresa.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {miembros.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 md:px-5">
                  <div className="min-w-0 flex-1">
                    {m.nombre && <p className="truncate text-sm font-medium text-slate-900">{m.nombre}</p>}
                    <p className={`truncate text-sm ${m.nombre ? 'text-slate-600' : 'text-slate-900'}`}>{m.email}</p>
                  </div>
                  <Etiqueta tono="azul">{nombreRol(m.rol)}</Etiqueta>
                  {m.personalizado && <Etiqueta tono="ambar">A medida</Etiqueta>}
                  {m.activo ? <Etiqueta tono="verde">Activo</Etiqueta> : <Etiqueta tono="gris">Desactivado</Etiqueta>}
                  {m.personalizado && m.areas && (
                    <p className="basis-full text-xs text-slate-500">
                      Permisos distintos de los de su perfil. {resumenAMedida(m.areas)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600 md:px-5">
            Además, los administradores de la plataforma pueden entrar en todas las empresas, aunque no salgan en esta lista.
          </p>
          <p className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 md:px-5">
            <Link href="/dashboard/configuracion/usuarios" className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">
              Dar de alta, cambiar permisos o quitar el acceso en «Usuarios» <ArrowRight size={14} />
            </Link>
            {user?.esAdminGlobal && (
              <Link href="/dashboard/admin" className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">
                Administración global <ArrowRight size={14} />
              </Link>
            )}
          </p>
        </section>
      )}
    </>
  );
}
