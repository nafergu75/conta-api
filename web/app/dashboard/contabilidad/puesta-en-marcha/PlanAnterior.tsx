'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, LinkSimple, UserPlus, WarningCircle, X } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { BuscadorTercero } from '@/components/contabilidad/BuscadorTercero';
import type { TerceroEncontrado } from '@/lib/subcuentas';
import { boton, botonSecundario, campo, Dato, Mensajes, SubidaFichero, subirPorTrozos, TAM_DIRECTO, TAM_MAXIMO } from '../importacion';

/**
 * Paso «Plan de cuentas» de la puesta en marcha: se sube el plan (o el listado
 * de subcuentas) del programa anterior y se crean TODAS sus cuentas, tambien
 * las de saldo cero, con su nombre y su numero de digitos. Las subcuentas de
 * clientes (430) y proveedores (400 y 410) se enlazan con su ficha por el NIF;
 * las que no se pueden enlazar solas se enlazan a mano en «Subcuentas sin
 * enlazar».
 */

type Accion = 'enlazar' | 'crear' | 'pendiente' | 'ya-enlazada' | 'no-se-enlaza';

interface VistaPlan {
  lectura: { formato: string; filas: number; avisos: string[] } | null;
  cuentasLeidas: number;
  cuentasNuevas: Array<{ codigo: string; nombre: string; madre: string }>;
  cuentasExistentes: number;
  omitidas: Array<{ codigo: string; motivo: string }>;
  longitud: { delPlan: number | null; actual: number; seFija: boolean; motivo: string | null };
  terceros: Array<{
    codigo: string;
    nombre: string;
    tipo: 'cliente' | 'proveedor';
    nif: string | null;
    accion: Accion;
    ficha: { id: string | null; nombre: string } | null;
    sustituye?: string;
    motivo?: string;
  }>;
  resumen: { enlazar: number; crear: number; pendientes: number; yaEnlazadas: number; noSeEnlazan: number };
  errores: string[];
  avisos: string[];
  puedeConfirmar: boolean;
}

interface ResultadoPlan {
  cuentasCreadas: number;
  fichasEnlazadas: number;
  fichasCreadas: number;
  pendientes: number;
  longitudFijada: number | null;
}

const TEXTO_ACCION: Record<Accion, { texto: string; color: string }> = {
  enlazar: { texto: 'Se enlaza', color: 'bg-emerald-100 text-emerald-800' },
  crear: { texto: 'Ficha nueva', color: 'bg-blue-100 text-blue-800' },
  pendiente: { texto: 'Pendiente', color: 'bg-amber-100 text-amber-800' },
  'ya-enlazada': { texto: 'Ya enlazada', color: 'bg-slate-100 text-slate-700' },
  'no-se-enlaza': { texto: 'No se enlaza', color: 'bg-red-100 text-red-800' },
};

/**
 * Sin NIF, el servidor propone enlazar con la ficha que tiene el mismo nombre
 * (si solo hay una) y lo dice en `motivo`: hay que comprobarlas antes de confirmar.
 */
const porNombre = (t: VistaPlan['terceros'][number]) => t.accion === 'enlazar' && !!t.motivo;

type TipoFicha = 'cliente' | 'proveedor';

/** Permiso que hace falta para dar de alta una ficha nueva de ese tipo (el administrador siempre lo tiene). */
const PERMISO_ALTA: Record<TipoFicha, string> = { cliente: 'ventas:write', proveedor: 'compras:write' };

const NOMBRE_AREA: Record<string, string> = {
  ventas: 'Ventas',
  compras: 'Compras',
  contabilidad: 'Contabilidad',
  tesoreria: 'Tesorería',
  impuestos: 'Impuestos',
  nominas: 'Nóminas',
};

/** 'ventas:write' -> 'Ventas «Modificar»', como en la pantalla de permisos. */
function textoPermiso(p: string): string {
  const [area, nivel] = p.split(':');
  return `${NOMBRE_AREA[area] ?? area} «${nivel === 'read' ? 'Ver' : 'Modificar'}»`;
}

/** Permisos que faltan segun un 403 del servidor (details.permisos), o null si no es eso. */
function permisosQueFaltan(e: unknown): string[] | null {
  if (!(e instanceof ApiError) || e.status !== 403) return null;
  const p = e.detalles && typeof e.detalles === 'object' ? (e.detalles as { permisos?: unknown }).permisos : undefined;
  return Array.isArray(p) && p.length && p.every((x) => typeof x === 'string') ? (p as string[]) : null;
}

/** El plan trae otra longitud y ya hay terceros con la de la app: convivirian las dos. */
const longitudDistinta = (v: VistaPlan) => !!v.longitud.motivo && !!v.longitud.delPlan && v.longitud.delPlan !== v.longitud.actual && !v.longitud.seFija;

function datos(fuente: File | string): FormData {
  const d = new FormData();
  if (typeof fuente === 'string') d.append('subidaId', fuente);
  else d.append('archivo', fuente);
  return d;
}

export function PlanAnterior({ onHecho }: { onHecho: (t: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fuente, setFuente] = useState<File | string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [vista, setVista] = useState<VistaPlan | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const eleccion = useRef(0);

  // Vista previa en cuanto hay fichero (o su subida por trozos).
  useEffect(() => {
    if (!fuente) return;
    let vigente = true;
    setOcupado(true);
    setError('');
    apiFetch<VistaPlan>(companyPath('/puesta-en-marcha/plan/vista-previa'), { method: 'POST', body: datos(fuente) })
      .then((v) => vigente && setVista(v))
      .catch((e) => {
        if (!vigente) return;
        setVista(null);
        setError(errorMessage(e));
      })
      .finally(() => vigente && setOcupado(false));
    return () => {
      vigente = false;
    };
  }, [fuente]);

  const elegir = (f: File) => {
    const n = ++eleccion.current;
    setArchivo(f);
    setFuente(null);
    setVista(null);
    setError('');
    if (f.size > TAM_MAXIMO) {
      setError(`El fichero pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${TAM_MAXIMO / 1024 / 1024} MB.`);
      return;
    }
    if (f.size <= TAM_DIRECTO) {
      setFuente(f);
      return;
    }
    setProgreso(0);
    subirPorTrozos(f, (p) => n === eleccion.current && setProgreso(p))
      .then((id) => n === eleccion.current && setFuente(id))
      .catch((e) => n === eleccion.current && setError(`No se pudo subir el fichero: ${errorMessage(e)}`))
      .finally(() => n === eleccion.current && setProgreso(null));
  };

  const limpiar = () => {
    eleccion.current++;
    setArchivo(null);
    setFuente(null);
    setVista(null);
    setError('');
  };

  const confirmar = async () => {
    if (!fuente || !vista) return;
    const r = vista.resumen;
    const partes = [
      `${vista.cuentasNuevas.length} cuentas nuevas en el plan`,
      r.enlazar && `${r.enlazar} subcuentas enlazadas a fichas que ya tienes`,
      r.crear && `${r.crear} fichas nuevas de clientes o proveedores`,
    ].filter(Boolean);
    const dosLongitudes = longitudDistinta(vista) ? `\n\nOjo: ${vista.longitud.motivo}` : '';
    const nPorNombre = vista.terceros.filter(porNombre).length;
    const comprobar = nPorNombre
      ? `\n\nOjo: ${nPorNombre === 1 ? 'una subcuenta se enlaza' : `${nPorNombre} subcuentas se enlazan`} solo porque el nombre coincide con el de una ficha. ¿Las has comprobado en la lista?`
      : '';
    if (!window.confirm(`Se van a crear ${partes.join(', ')}.${dosLongitudes}${comprobar}\n\n¿Continuar?`)) return;
    setOcupado(true);
    setError('');
    try {
      const res = await apiFetch<ResultadoPlan>(companyPath('/puesta-en-marcha/plan'), { method: 'POST', body: datos(fuente) });
      limpiar();
      setVuelta((n) => n + 1);
      onHecho(
        [
          `Plan contable traído: ${res.cuentasCreadas} cuentas creadas`,
          res.fichasEnlazadas ? `${res.fichasEnlazadas} subcuentas enlazadas a sus fichas` : '',
          res.fichasCreadas ? `${res.fichasCreadas} fichas nuevas` : '',
          res.longitudFijada ? `las subcuentas de clientes y proveedores tendrán ${res.longitudFijada} dígitos` : '',
          res.pendientes ? `${res.pendientes} subcuentas quedan por enlazar (abajo, en «Subcuentas sin enlazar»)` : '',
        ]
          .filter(Boolean)
          .join('; ') + '.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Sube el <strong>plan de cuentas</strong> (o el listado de subcuentas) que llevabas en el programa anterior. Se crean <strong>todas</strong> sus cuentas y subcuentas,
        también las de saldo cero, con su nombre y su número de dígitos, para seguir con el mismo plan. Las subcuentas de clientes (430) y de proveedores (400 y 410) se
        enlazan con su ficha por el NIF: si el fichero trae una columna NIF, se usa; si no, se busca la ficha con ese NIF.
        <p className="mt-2 font-medium text-slate-800">
          Hazlo antes de dar de alta clientes o proveedores y antes de importar el balance de apertura: con el primer cliente o proveedor queda fijado el número de
          dígitos de sus subcuentas.
        </p>
      </div>

      <SubidaFichero
        archivo={archivo}
        ocupado={ocupado}
        progreso={progreso}
        texto="Haz clic o arrastra el plan de cuentas"
        ayuda="Excel (.xlsx, .xls) o CSV con las columnas Cuenta, Nombre y, si la tiene, NIF"
        onElegir={elegir}
      />

      {error && <Mensajes errores={[error]} />}

      {vista && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato titulo="Cuentas en el fichero" valor={vista.cuentasLeidas} />
            <Dato titulo="Cuentas nuevas" valor={vista.cuentasNuevas.length} />
            <Dato titulo="Ya en tu plan" valor={vista.cuentasExistentes} />
            <Dato titulo="No se importan" valor={vista.omitidas.length} tono={vista.omitidas.length ? 'mal' : 'normal'} />
          </div>

          <p
            className={`rounded-lg border p-3 text-sm ${longitudDistinta(vista) ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}
          >
            {vista.longitud.motivo
              ? vista.longitud.motivo
              : vista.longitud.seFija && vista.longitud.delPlan
                ? `Las subcuentas de clientes y proveedores tendrán ${vista.longitud.delPlan} dígitos, como en tu plan anterior. Los nuevos seguirán la misma numeración.`
                : vista.longitud.delPlan
                  ? `Tus subcuentas tienen ${vista.longitud.delPlan} dígitos, igual que las de la app.`
                  : `El fichero no trae subcuentas de clientes ni de proveedores: se mantienen ${vista.longitud.actual} dígitos.`}
          </p>

          {/* El aviso de la longitud ya sale justo encima: no se repite. */}
          <Mensajes errores={vista.errores} avisos={[...(vista.lectura?.avisos ?? []), ...vista.avisos.filter((a) => a !== vista.longitud.motivo)]} />

          {vista.terceros.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Subcuentas de clientes y proveedores ({vista.terceros.length})
              </h3>
              <p className="text-xs text-slate-500">
                {vista.resumen.enlazar} se enlazan con una ficha que ya tienes · {vista.resumen.crear} crean una ficha nueva con su NIF · {vista.resumen.pendientes} quedan
                pendientes (cada una dice por qué) · {vista.resumen.yaEnlazadas} ya estaban enlazadas
                {vista.resumen.noSeEnlazan ? ` · ${vista.resumen.noSeEnlazan} no se enlazan (revísalas)` : ''}.
              </p>
              <AvisoPorNombre n={vista.terceros.filter(porNombre).length} />
              <AvisoSinPermisoAlta terceros={vista.terceros} />
              <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm">
                {vista.terceros.map((t) => (
                  <li key={t.codigo} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
                    <span className="shrink-0 font-mono text-slate-700 sm:w-28">{t.codigo}</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-slate-900">{t.nombre || '(sin nombre)'}</span>
                      <span className="text-slate-500">
                        {' '}
                        · {t.tipo === 'cliente' ? 'cliente' : 'proveedor'}
                        {t.nif ? ` · ${t.nif}` : ''}
                      </span>
                      {t.ficha && t.accion !== 'crear' && <span className="block text-xs text-slate-600">Ficha: {t.ficha.nombre}</span>}
                      {t.sustituye && <span className="block text-xs text-slate-600">Sustituye a su subcuenta {t.sustituye}, que no tiene movimientos.</span>}
                      {t.motivo && (
                        <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-700">
                          {porNombre(t) && <WarningCircle size={14} className="mt-px shrink-0" aria-hidden />}
                          <span>{t.motivo}</span>
                        </span>
                      )}
                    </span>
                    {porNombre(t) ? (
                      <span className="self-start whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Se enlaza por nombre</span>
                    ) : (
                      <span className={`self-start whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TEXTO_ACCION[t.accion].color}`}>{TEXTO_ACCION[t.accion].texto}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {vista.cuentasNuevas.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-900">Ver las {vista.cuentasNuevas.length} cuentas nuevas</summary>
              <ul className="mt-2 max-h-72 overflow-y-auto">
                {vista.cuentasNuevas.slice(0, 1000).map((c) => (
                  <li key={c.codigo} className="flex gap-3 py-0.5">
                    <span className="w-28 shrink-0 font-mono text-slate-700">{c.codigo}</span>
                    <span className="min-w-0 flex-1 text-slate-800">{c.nombre}</span>
                    <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">cuelga de {c.madre}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {vista.omitidas.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-900">Ver las {vista.omitidas.length} cuentas que no se importan</summary>
              <ul className="mt-2 max-h-60 overflow-y-auto">
                {vista.omitidas.map((c) => (
                  <li key={c.codigo} className="flex gap-3 py-0.5">
                    <span className="w-28 shrink-0 font-mono text-slate-700">{c.codigo}</span>
                    <span className="min-w-0 flex-1 text-slate-600">{c.motivo}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={limpiar} disabled={ocupado} className={botonSecundario}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={ocupado || !vista.puedeConfirmar} className={boton}>
              {ocupado ? 'Procesando...' : 'Traer el plan contable'}
            </button>
          </div>
        </div>
      )}

      <SubcuentasSinEnlazar vuelta={vuelta} />
    </div>
  );
}

/**
 * Sin permiso de Ventas o de Compras «Modificar», las subcuentas que crearian
 * una ficha nueva quedan pendientes (cada una lo dice en su motivo). El recuadro
 * explica que falta y a quien pedirlo.
 */
function AvisoSinPermisoAlta({ terceros }: { terceros: VistaPlan['terceros'] }) {
  const usuario = getUser();
  const tipos = (['cliente', 'proveedor'] as const).filter(
    (tipo) => !tieneAlgunPermiso(usuario, [PERMISO_ALTA[tipo]]) && terceros.some((t) => t.tipo === tipo && t.accion === 'pendiente'),
  );
  if (!tipos.length) return null;
  const quien = tipos.map((t) => (t === 'cliente' ? 'clientes' : 'proveedores')).join(' ni ');
  const permisos = tipos.map((t) => textoPermiso(PERMISO_ALTA[t])).join(' y ');
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        No puedes dar de alta {quien} nuevos: te falta el permiso {permisos}. Las subcuentas que necesitan una ficha nueva quedan pendientes. Pide ese permiso al
        administrador de la empresa, o enlázalas después a fichas que ya existan en «Subcuentas sin enlazar».
      </span>
    </p>
  );
}

/** Recuadro sobre la lista: las que se enlazan solo por coincidir el nombre se comprueban antes de confirmar. */
function AvisoPorNombre({ n }: { n: number }) {
  if (!n) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {n === 1 ? 'Una subcuenta no trae NIF y se enlaza' : `${n} subcuentas no traen NIF y se enlazan`} con la ficha que tiene el mismo nombre (las marcadas «Se enlaza
        por nombre»). Compruébalo antes de confirmar. Si alguna no es la buena, pon su NIF en el fichero, o cambia allí el nombre, y vuelve a subirlo.
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Subcuentas 430/400/410 que no son de ninguna ficha: se enlazan a mano
// ---------------------------------------------------------------------------

interface SinEnlazar {
  codigo: string;
  nombre: string;
  tipo: 'cliente' | 'proveedor';
  activa: boolean;
  apuntes: number;
}

function SubcuentasSinEnlazar({ vuelta }: { vuelta: number }) {
  const [lista, setLista] = useState<SinEnlazar[] | null>(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [hecho, setHecho] = useState('');

  const cargar = useCallback(() => {
    apiFetch<SinEnlazar[]>(companyPath('/puesta-en-marcha/plan/sin-enlazar'))
      .then((l) => {
        setLista(l);
        setError('');
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, vuelta]);

  if (error) return <Mensajes errores={[`No se han podido leer las subcuentas sin enlazar: ${error}`]} />;
  if (!lista) return null;

  return (
    <section aria-labelledby="sin-enlazar" className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <h3 id="sin-enlazar" className="text-sm font-semibold text-slate-900">
        Subcuentas sin enlazar {lista.length > 0 && `(${lista.length})`}
      </h3>
      {hecho && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
          <CheckCircle size={16} className="mt-0.5 shrink-0" /> <span>{hecho}</span>
        </p>
      )}
      {lista.length === 0 ? (
        <p className="text-sm text-slate-600">Todas las subcuentas de clientes y proveedores de tu plan están enlazadas a su ficha.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Estas subcuentas de clientes o proveedores están en tu plan pero no son de ninguna ficha. Enlázalas con el cliente o proveedor que corresponde, o crea su
            ficha: así su saldo sale en su mayor y sus facturas nuevas van a esa subcuenta.
          </p>
          <ul className="divide-y divide-slate-100 text-sm">
            {lista.map((s) => (
              <li key={s.codigo} className="py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-slate-700">{s.codigo}</span>
                  <span className="min-w-0 flex-1 text-slate-900">
                    {s.nombre}
                    <span className="text-slate-500">
                      {' '}
                      · {s.tipo}
                      {s.apuntes ? ` · ${s.apuntes} apuntes` : ' · sin movimientos'}
                      {!s.activa && ' · desactivada'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAbierta(abierta === s.codigo ? null : s.codigo)}
                    aria-expanded={abierta === s.codigo}
                    className="inline-flex min-h-[44px] items-center gap-1 font-medium text-emerald-700 hover:underline sm:min-h-0"
                  >
                    <LinkSimple size={14} /> {abierta === s.codigo ? 'Cerrar' : 'Enlazar'}
                  </button>
                </div>
                {abierta === s.codigo && (
                  <Enlazar
                    subcuenta={s}
                    onHecho={(texto) => {
                      setAbierta(null);
                      setHecho(texto);
                      cargar();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Enlazar({ subcuenta, onHecho }: { subcuenta: SinEnlazar; onHecho: (texto: string) => void }) {
  const [modo, setModo] = useState<'existente' | 'nueva'>('existente');
  const [ficha, setFicha] = useState<TerceroEncontrado | null>(null);
  const [nombre, setNombre] = useState(subcuenta.nombre);
  const [nif, setNif] = useState('');
  const [error, setError] = useState('');
  const [campoMal, setCampoMal] = useState<string | undefined>();
  const [guardando, setGuardando] = useState(false);
  // Permisos que el servidor dice que faltan (403 con details.permisos).
  const [faltan, setFaltan] = useState<string[] | null>(null);
  const ids = `enl-${subcuenta.codigo}`;
  const permisoAlta = PERMISO_ALTA[subcuenta.tipo];
  const sinPermisoAlta = faltan !== null || !tieneAlgunPermiso(getUser(), [permisoAlta]);

  const enlazar = async () => {
    setError('');
    setCampoMal(undefined);
    if (modo === 'existente' && !ficha) return setError(`Elige el ${subcuenta.tipo}.`);
    if (modo === 'nueva' && !nif.trim()) {
      setCampoMal('nueva.nifCif');
      return setError(`Escribe el NIF del nuevo ${subcuenta.tipo}.`);
    }
    setGuardando(true);
    try {
      const cuerpo = modo === 'existente' ? { codigo: subcuenta.codigo, fichaId: ficha!.id } : { codigo: subcuenta.codigo, nueva: { nombreFiscal: nombre.trim(), nifCif: nif.trim() } };
      const r = await apiFetch<{ fichaCreada: boolean; sustituida: string | null }>(companyPath('/puesta-en-marcha/plan/enlazar'), {
        method: 'POST',
        body: JSON.stringify(cuerpo),
      });
      const quien = modo === 'existente' ? ficha!.nombre : nombre.trim() || subcuenta.nombre;
      onHecho(
        `${subcuenta.codigo} enlazada con ${quien}${r.fichaCreada ? ' (ficha nueva)' : ''}.${r.sustituida ? ` Su subcuenta anterior ${r.sustituida} queda desactivada.` : ''}`,
      );
    } catch (e) {
      const sinPermiso = permisosQueFaltan(e);
      if (sinPermiso) {
        // El recuadro de abajo dice que falta y a quien pedirlo.
        setFaltan(sinPermiso);
        return;
      }
      setError(errorMessage(e));
      setCampoMal(campoDelError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="inline-flex w-full rounded-lg border border-slate-300 bg-white p-0.5 sm:w-auto">
        {(
          [
            ['existente', `Elegir ${subcuenta.tipo}`],
            ['nueva', `Crear ${subcuenta.tipo} nuevo`],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setModo(valor)}
            aria-pressed={modo === valor}
            className={`flex-1 rounded-md px-3 py-1.5 text-center sm:whitespace-nowrap ${modo === valor ? 'bg-emerald-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {texto}
          </button>
        ))}
      </div>

      {modo === 'existente' ? (
        <div>
          <label htmlFor={`${ids}-buscar`} className="block text-xs font-medium text-slate-600">
            {subcuenta.tipo === 'cliente' ? 'Cliente' : 'Proveedor'}
          </label>
          <BuscadorTercero id={`${ids}-buscar`} tipo={subcuenta.tipo} elegido={ficha} onElegir={setFicha} textoInicial={subcuenta.nombre} />
          {ficha && ficha.subcuentas.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Ya tiene {ficha.subcuentas.join(' y ')}: si no tiene movimientos, se cambia por la {subcuenta.codigo}.
            </p>
          )}
        </div>
      ) : sinPermisoAlta ? (
        <div role={faltan ? 'alert' : undefined} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Para crear un {subcuenta.tipo} nuevo hace falta el permiso {(faltan ?? [permisoAlta]).map(textoPermiso).join(' o ')}, y no lo tienes en esta empresa. Pídeselo
            al administrador de la empresa, o enlaza la subcuenta a un {subcuenta.tipo} que ya exista con «Elegir {subcuenta.tipo}».
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">
            Nombre fiscal
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            NIF
            <input value={nif} onChange={(e) => setNif(e.target.value)} aria-invalid={campoMal === 'nueva.nifCif'} className={`${campo} font-mono`} autoComplete="off" />
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          <X size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={enlazar} disabled={guardando || (modo === 'nueva' && sinPermisoAlta)} className={boton}>
          {modo === 'nueva' ? <UserPlus size={16} /> : <LinkSimple size={16} />} {guardando ? 'Guardando…' : modo === 'nueva' ? 'Crear y enlazar' : 'Enlazar'}
        </button>
      </div>
    </div>
  );
}
