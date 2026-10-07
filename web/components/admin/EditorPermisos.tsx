'use client';

import { Info, WarningCircle } from '@phosphor-icons/react';
import type { Area, Areas, CatalogoPermisos } from '@/lib/auth';
import { nombreRol } from '@/lib/auth';
import {
  aplicarPulsacion,
  areasDelPerfil,
  casillas,
  esAdministrador,
  perfilDe,
  todoNinguno,
  type Columna,
} from './permisos';

interface Props {
  catalogo: CatalogoPermisos;
  /** Perfil de partida del acceso ('contable', 'ventas', 'solo_lectura' o 'admin'). */
  rol: string;
  /** Areas que se estan editando. null = las del perfil. */
  areas: Areas | null;
  onChange: (areas: Areas) => void;
  /** false: Impuestos y Nominas llevan el aviso de que no se usan en la empresa. */
  empresaEspanola: boolean;
  /** Avisa de que, mientras lo sea, lo marcado aqui no le recorta nada. */
  esAdminGlobal?: boolean;
  deshabilitado?: boolean;
}

const AREAS_DE_LIBROS = new Set(['ventas', 'compras']);
const AREAS_SOLO_ESPANA = new Set(['impuestos', 'nominas']);

const CLASE_CASILLA_LABEL =
  'inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-100 has-[:disabled]:cursor-not-allowed has-[:disabled]:hover:bg-transparent cursor-pointer';

/**
 * Matriz de permisos por area de un acceso a una empresa: una fila por area con
 * "Ver" y "Modificar". Marcar Modificar marca Ver y quitar Ver quita Modificar.
 * El perfil Administrador sale todo marcado y sin poder tocarse.
 */
export default function EditorPermisos({ catalogo, rol, areas, onChange, empresaEspanola, esAdminGlobal, deshabilitado }: Props) {
  const esAdmin = esAdministrador(rol);
  const perfil = areasDelPerfil(catalogo, rol);
  const actuales = areas ?? perfil;
  const nombrePerfil = perfilDe(catalogo, rol)?.nombre ?? nombreRol(rol);
  const personalizado = !esAdmin && !!perfil && !!actuales && catalogo.areas.some((a) => actuales[a.clave] !== perfil[a.clave]);
  const vacio = !esAdmin && !!actuales && todoNinguno(actuales);
  const conContabilidad = !!actuales && actuales.contabilidad !== 'ninguno';

  const pulsar = (area: Area, columna: Columna, marcado: boolean) => {
    if (!actuales || esAdmin || deshabilitado) return;
    onChange(aplicarPulsacion(actuales, area, columna, marcado));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span>
          Perfil de partida: <strong className="font-semibold text-slate-900">{nombrePerfil}</strong>
        </span>
        {personalizado && (
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            Personalizado
          </span>
        )}
      </div>

      {esAdminGlobal && (
        <p className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 text-xs text-indigo-700">
          <Info size={16} className="mt-px shrink-0" aria-hidden />
          Es administrador global: puede con todo en todas las empresas. Lo que marques aquí solo contará si deja de serlo.
        </p>
      )}

      {esAdmin && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
          El administrador puede hacer todo en esta empresa, también cambiar sus plantillas y los ajustes de Carmen y del lector de
          facturas. No se puede recortar.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[72px]" />
            <col className="w-[72px]" />
          </colgroup>
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                Qué puede hacer
              </th>
              <th scope="col" className="px-1 py-2 text-center">
                Ver
              </th>
              <th scope="col" className="px-1 py-2 text-center">
                Modificar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {catalogo.areas.map((a) => {
              const nivel = esAdmin ? 'modificar' : (actuales?.[a.clave] ?? 'ninguno');
              const marcas = casillas(nivel);
              const cambiada = !esAdmin && !!perfil && perfil[a.clave] !== nivel;
              const bloqueada = esAdmin || deshabilitado || !actuales;
              const veEnLibros = !esAdmin && AREAS_DE_LIBROS.has(a.clave) && nivel === 'ninguno' && conContabilidad;
              const noSeUsa = !empresaEspanola && AREAS_SOLO_ESPANA.has(a.clave);
              return (
                <tr key={a.clave} className="align-top">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                      <span className="min-w-0 break-words">{a.nombre}</span>
                      {cambiada && (
                        <>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                          <span className="sr-only">(cambiado respecto al perfil)</span>
                        </>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{a.descripcion}</span>
                    {noSeUsa && (
                      <span className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                        <WarningCircle size={14} className="mt-px shrink-0" aria-hidden />
                        En esta empresa no se usa: no está establecida en España.
                      </span>
                    )}
                    {veEnLibros && (
                      <span className="mt-1 block text-xs text-slate-500">Aun así puede consultarlas, porque tiene «Ver» en Contabilidad.</span>
                    )}
                  </th>
                  {(['ver', 'modificar'] as const).map((col) => (
                    <td key={col} className="px-1 py-1 text-center">
                      <label className={CLASE_CASILLA_LABEL}>
                        <input
                          type="checkbox"
                          checked={marcas[col]}
                          disabled={bloqueada}
                          onChange={(e) => pulsar(a.clave, col, e.target.checked)}
                          aria-label={`${col === 'ver' ? 'Ver' : 'Modificar'} ${a.nombre}`}
                          className="h-5 w-5 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed"
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {vacio && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
          <WarningCircle size={18} className="mt-px shrink-0" aria-hidden />
          Marca al menos un permiso, o quita el acceso a la empresa.
        </p>
      )}

      <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-slate-500">
        <li>Ver Contabilidad deja consultar también facturas, clientes, proveedores y movimientos, porque salen en los libros. No incluye las nóminas.</li>
        <li>Modificar Contabilidad deja también cambiar los datos de la empresa y el catálogo de productos, y apuntar cobros y pagos de facturas.</li>
        <li>Impuestos incluye los modelos y ficheros para la AEAT.</li>
        <li>Las plantillas de documentos y los ajustes de Carmen y del lector de facturas solo los cambia el perfil Administrador.</li>
      </ul>
    </div>
  );
}
