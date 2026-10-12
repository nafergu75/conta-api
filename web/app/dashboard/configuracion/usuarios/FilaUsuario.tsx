'use client';

import Link from 'next/link';
import { Key, PencilSimple, Power, Trash } from '@phosphor-icons/react';
import { nombreRol, RUTA_CAMBIAR_CONTRASENA, type CatalogoPermisos } from '@/lib/auth';
import { perfilDe, resumenAreas, resumenPerfil } from '@/components/admin/permisos';
import { Etiqueta, fechaYHora } from '@/components/admin/comunes';
import { fechaHoraCorta, type UsuarioEmpresa } from '@/lib/usuarios-empresa';

/**
 * Una persona con acceso a la empresa elegida: quien es, con que perfil y
 * permisos entra, en que punto esta su contraseña y las acciones que el
 * servidor deja hacer a quien mira (usuario.puedes).
 */

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2';
const BASE_BOTON = `inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCO}`;
export const BOTON_SECUNDARIO = `${BASE_BOTON} border-slate-200 text-slate-700 hover:bg-slate-50`;
export const BOTON_PELIGRO = `${BASE_BOTON} border-rose-200 text-rose-700 hover:bg-rose-50`;

function EstadoCuenta({ usuario }: { usuario: UsuarioEmpresa }) {
  switch (usuario.estado) {
    case 'desactivado':
      return <Etiqueta tono="gris">Desactivado</Etiqueta>;
    case 'contrasena_caducada':
      return <Etiqueta tono="rojo">Contraseña provisional caducada</Etiqueta>;
    case 'contrasena_pendiente':
      return <Etiqueta tono="ambar">Contraseña provisional pendiente</Etiqueta>;
    default:
      return <Etiqueta tono="verde">Activo</Etiqueta>;
  }
}

/** La frase que acompaña al estado, si hace falta explicar algo. */
function detalleEstado(u: UsuarioEmpresa): string | null {
  if (u.estado === 'contrasena_caducada') return 'Su contraseña provisional ya no vale y no puede entrar. Genérale otra.';
  if (u.estado === 'contrasena_pendiente') {
    return u.contrasenaProvisionalHasta
      ? `Aún no ha puesto su propia contraseña. La provisional vale hasta el ${fechaYHora(u.contrasenaProvisionalHasta)}.`
      : 'Tendrá que cambiar su contraseña la próxima vez que entre.';
  }
  if (u.estado === 'desactivado') return 'Su cuenta está desactivada: no puede entrar en ninguna empresa.';
  return null;
}

interface Props {
  usuario: UsuarioEmpresa;
  catalogo: CatalogoPermisos | null;
  esYo: boolean;
  /** Quien mira es administrador global (solo el puede desactivar cuentas). */
  soyAdminGlobal: boolean;
  ocupado: boolean;
  onEditar: () => void;
  onNuevaContrasena: () => void;
  onQuitar: () => void;
  onActivar: () => void;
}

export default function FilaUsuario({ usuario: u, catalogo, esYo, soyAdminGlobal, ocupado, onEditar, onNuevaContrasena, onQuitar, onActivar }: Props) {
  const nombrePerfil = perfilDe(catalogo, u.rol)?.nombre ?? nombreRol(u.rol);
  const permisos = catalogo ? (u.personalizado && u.areas ? resumenAreas(catalogo, u.areas) : resumenPerfil(catalogo, u.rol)) : '';
  const detalle = detalleEstado(u);
  const ultimoAdmin = u.puedes.editarAcceso && !u.puedes.quitarAcceso;
  // Puede tocar su acceso pero no su contraseña: la cuenta entra en empresas que no administra.
  const cuentaAjena = u.puedes.editarAcceso && !u.puedes.nuevaContrasena && !esYo;
  const titulo = u.nombre || u.email;
  const hayAcciones = u.puedes.editarAcceso || u.puedes.nuevaContrasena || u.puedes.quitarAcceso || (soyAdminGlobal && !esYo);

  return (
    <li className="flex flex-col gap-3 px-4 py-4 md:px-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="min-w-0 break-words font-semibold text-slate-900">{titulo}</p>
            {esYo && <Etiqueta tono="gris">Eres tú</Etiqueta>}
            {u.esAdminGlobal && <Etiqueta tono="indigo">Administrador global</Etiqueta>}
          </div>
          {u.nombre && <p className="break-all text-sm text-slate-600">{u.email}</p>}
          {u.telefono && <p className="text-sm text-slate-600">Tel. {u.telefono}</p>}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 lg:hidden">Rol y permisos</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-slate-900">{nombrePerfil}</span>
            {u.personalizado && <Etiqueta tono="ambar">A medida</Etiqueta>}
          </div>
          {permisos && <p className="mt-0.5 text-xs text-slate-600">{permisos}</p>}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 lg:hidden">Estado</p>
          <EstadoCuenta usuario={u} />
          {detalle && <p className="mt-1 text-xs text-slate-600">{detalle}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {u.ultimoAcceso ? `Último acceso: ${fechaHoraCorta(u.ultimoAcceso)}` : 'Todavía no ha entrado.'}
          </p>
        </div>
      </div>

      {hayAcciones ? (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {u.puedes.editarAcceso && (
            <button type="button" onClick={onEditar} disabled={ocupado} className={BOTON_SECUNDARIO} aria-label={`Editar acceso de ${titulo}`}>
              <PencilSimple size={16} aria-hidden /> Editar acceso
            </button>
          )}
          {u.puedes.nuevaContrasena && (
            <button
              type="button"
              onClick={onNuevaContrasena}
              disabled={ocupado}
              className={BOTON_SECUNDARIO}
              aria-label={`Nueva contraseña provisional para ${titulo}`}
            >
              <Key size={16} aria-hidden /> Nueva contraseña provisional
            </button>
          )}
          {u.puedes.quitarAcceso && (
            <button type="button" onClick={onQuitar} disabled={ocupado} className={BOTON_PELIGRO} aria-label={`Quitar a ${titulo} el acceso a esta empresa`}>
              <Trash size={16} aria-hidden /> Quitar acceso a esta empresa
            </button>
          )}
          {soyAdminGlobal && !esYo && (
            <button
              type="button"
              onClick={onActivar}
              disabled={ocupado}
              className={u.activo ? BOTON_PELIGRO : BOTON_SECUNDARIO}
              aria-label={`${u.activo ? 'Desactivar' : 'Reactivar'} a ${titulo}`}
            >
              <Power size={16} aria-hidden /> {u.activo ? 'Desactivar usuario' : 'Reactivar usuario'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Solo lo puede cambiar el administrador global de la plataforma.</p>
      )}

      {ultimoAdmin && (
        <p className="text-xs text-slate-500">
          Es el único administrador de esta empresa: no se le puede quitar el acceso ni el perfil Administrador hasta que haya otro.
        </p>
      )}
      {cuentaAjena && (
        <p className="text-xs text-slate-500">
          También entra en empresas que tú no administras: su contraseña solo se la puede cambiar el administrador global.
        </p>
      )}
      {esYo && (
        <p className="text-xs text-slate-500">
          Tu contraseña la cambias tú en{' '}
          <Link href={RUTA_CAMBIAR_CONTRASENA} className="font-medium text-emerald-700 hover:underline">
            «Cambiar contraseña»
          </Link>
          .
        </p>
      )}
    </li>
  );
}
