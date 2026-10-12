'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilePdf, FileXls, MagnifyingGlass } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { TablaInforme, type Tabla } from './TablaInforme';
import { BuscadorTercero } from '@/components/contabilidad/BuscadorTercero';
import { BuscadorCuenta } from '@/components/contabilidad/BuscadorCuenta';
import SelectorAnio from '@/components/SelectorAnio';
import { anioDeTexto, anioEspana, rangoAnios } from '@/lib/anios';
import { ponerEnUrl } from '@/lib/urlEstado';

/**
 * Informes contables de cualquier ejercicio (tambien los ya cerrados), en
 * pantalla y para descargar en PDF o Excel. Todos salen de los asientos
 * contabilizados, sin los de regularizacion ni cierre.
 */

type TipoInforme = 'balance' | 'pyg' | 'sumas' | 'mayor' | 'diario';

const INFORMES: Array<{ id: TipoInforme; nombre: string; ruta: string; ayuda: string }> = [
  { id: 'balance', nombre: 'Balance de situación', ruta: 'balance', ayuda: 'Modelo PYMES del PGC, con la columna del ejercicio anterior.' },
  { id: 'pyg', nombre: 'Pérdidas y ganancias', ruta: 'perdidas-ganancias', ayuda: 'Modelo PYMES del PGC, con la columna del ejercicio anterior.' },
  { id: 'sumas', nombre: 'Sumas y saldos', ruta: 'sumas-saldos', ayuda: 'Saldo inicial, debe, haber y saldo de cada cuenta, con un subtotal por cuenta de 3 dígitos.' },
  { id: 'mayor', nombre: 'Libro mayor', ruta: 'mayor', ayuda: 'Movimientos de una cuenta, de un rango o de un cliente o proveedor, con el saldo acumulado.' },
  { id: 'diario', nombre: 'Libro diario', ruta: 'diario', ayuda: 'Todos los asientos del periodo, por fecha.' },
];

/** Cliente o proveedor elegido para el Libro mayor (el nombre llega con la respuesta si se abre con un enlace). */
interface TerceroMayor {
  tipo: 'cliente' | 'proveedor';
  id: string;
  nombre: string;
  nif: string | null;
  subcuentas: string[];
}

interface Consulta {
  tipo: TipoInforme;
  ejercicio: number;
  desde: string;
  hasta: string;
  nivel: string;
  cuentaDesde: string;
  cuentaHasta: string;
  incluirCierre: boolean;
  /** Libro mayor: por cuenta (o rango) o por cliente o proveedor. */
  mayorPor: 'cuenta' | 'tercero';
  tercero: TerceroMayor | null;
  /** Sumas y saldos: sin las subcuentas que no se han movido. */
  ocultarSinMovimiento: boolean;
}

/** Cuenta (prefijo) o rango cuentaDesde-cuentaHasta. */
function ponerCuentas(p: URLSearchParams, c: Consulta) {
  const d = c.cuentaDesde.trim();
  const h = c.cuentaHasta.trim();
  if (d && !h) p.set('cuenta', d);
  else {
    if (d) p.set('cuentaDesde', d);
    if (h) p.set('cuentaHasta', h);
  }
}

/** Parametros de la API para una consulta (sin el formato). */
function parametros(c: Consulta): URLSearchParams {
  const p = new URLSearchParams();
  const desde = c.tipo === 'balance' ? '' : c.desde;
  if (desde || c.hasta) {
    p.set('desde', desde || `${c.ejercicio}-01-01`);
    p.set('hasta', c.hasta || `${c.ejercicio}-12-31`);
  } else {
    p.set('ejercicio', String(c.ejercicio));
  }
  if (c.tipo === 'sumas') {
    p.set('nivel', c.nivel);
    ponerCuentas(p, c);
    if (!c.ocultarSinMovimiento) p.set('ocultarSinMovimiento', 'false');
  }
  if (c.tipo === 'mayor') {
    if (c.mayorPor === 'tercero' && c.tercero) {
      p.set('tercero', c.tercero.id);
      p.set('tipoTercero', c.tercero.tipo);
    } else ponerCuentas(p, c);
  }
  if (c.tipo === 'diario' && c.incluirCierre) p.set('incluirCierre', '1');
  return p;
}

const faltaCuenta = (c: Consulta) =>
  c.tipo === 'mayor' && (c.mayorPor === 'tercero' ? !c.tercero : !c.cuentaDesde.trim() && !c.cuentaHasta.trim());

const soloDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Lo que trae la URL para el Libro mayor (enlaces de las fichas, de Carmen o de otros informes). */
function mayorDeLaUrl(sp: URLSearchParams | null): Pick<Consulta, 'mayorPor' | 'tercero' | 'cuentaDesde' | 'cuentaHasta'> | null {
  if (!sp) return null;
  const tercero = sp.get('tercero');
  const tipoTercero = sp.get('tipoTercero');
  if (tercero && (tipoTercero === 'cliente' || tipoTercero === 'proveedor')) {
    return { mayorPor: 'tercero', tercero: { tipo: tipoTercero, id: tercero, nombre: '', nif: null, subcuentas: [] }, cuentaDesde: '', cuentaHasta: '' };
  }
  const cuenta = soloDigitos(sp.get('cuenta'));
  const d = soloDigitos(sp.get('cuentaDesde'));
  const h = soloDigitos(sp.get('cuentaHasta'));
  if (cuenta) return { mayorPor: 'cuenta', tercero: null, cuentaDesde: cuenta, cuentaHasta: '' };
  if (d || h) return { mayorPor: 'cuenta', tercero: null, cuentaDesde: d, cuentaHasta: h };
  return null;
}

/** Informe pedido en la URL (?tipo=pyg), o null si no hay o no es uno de la lista. */
function tipoValido(tipo: string | null | undefined): TipoInforme | null {
  return INFORMES.some((i) => i.id === tipo) ? (tipo as TipoInforme) : null;
}

export default function InformesContablesPage() {
  // useSearchParams necesita un Suspense para generar la página.
  return (
    <Suspense fallback={<p className="p-6 text-slate-500">Cargando…</p>}>
      <InformesContables />
    </Suspense>
  );
}

function InformesContables() {
  // ?tipo=pyg cambia el informe también si ya se está en esta pantalla (por ejemplo, con un
  // enlace de Carmen): Next no vuelve a montar la página cuando solo cambia la consulta.
  const sp = useSearchParams();
  const tipoUrl = tipoValido(sp?.get('tipo'));
  const tipoVisto = useRef(tipoUrl);
  // Cliente, proveedor o cuenta que pide la URL (?tercero=&tipoTercero= o ?cuenta=), como texto para ver si cambia.
  const mayorUrl = mayorDeLaUrl(sp);
  const claveMayorUrl = mayorUrl ? JSON.stringify([mayorUrl.tercero?.id, mayorUrl.tercero?.tipo, mayorUrl.cuentaDesde, mayorUrl.cuentaHasta]) : '';
  const mayorVisto = useRef(claveMayorUrl);
  const router = useRouter();
  // Año en curso en España; el de la URL (?ejercicio=2026), si viene, manda.
  const anioActual = anioEspana();
  const ejercicioUrl = anioDeTexto(sp?.get('ejercicio'));
  const [ejercicios, setEjercicios] = useState<number[]>([anioActual]);
  const [form, setForm] = useState<Consulta>({
    tipo: 'balance',
    ejercicio: ejercicioUrl ?? anioActual,
    desde: '',
    hasta: '',
    nivel: 'subcuenta',
    cuentaDesde: '',
    cuentaHasta: '',
    incluirCierre: false,
    mayorPor: 'cuenta',
    tercero: null,
    ocultarSinMovimiento: true,
  });
  /** Datos del tercero que devuelve el servidor (nombre y subcuentas si se llega con un enlace). */
  const [terceroLeido, setTerceroLeido] = useState<TerceroMayor | null>(null);
  const [aplicada, setAplicada] = useState<Consulta | null>(null);
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState<'' | 'pdf' | 'xlsx'>('');
  const [error, setError] = useState('');

  // Ejercicios del servidor (con asientos, dados de alta, el actual y el siguiente) y, si se llega
  // con un enlace, el informe pedido (?tipo=pyg). Se abre en el año en curso, no en el siguiente.
  useEffect(() => {
    const inicial = tipoVisto.current ?? (mayorUrl ? 'mayor' : 'balance');
    const delEnlace = mayorUrl ?? {};
    const elegido = ejercicioUrl ?? anioActual;
    apiFetch<number[]>(companyPath('/informes-contables/ejercicios'))
      .then((lista) => {
        setEjercicios(rangoAnios({ primero: anioActual, actual: anioActual, incluir: lista }));
        const c = { ...form, ...delEnlace, tipo: inicial, ejercicio: elegido };
        setForm(c);
        setAplicada(c);
      })
      .catch((e) => {
        setError(errorMessage(e));
        // Sin la lista del servidor, la de respaldo: de actual − 4 a actual + 1.
        setEjercicios(rangoAnios({ primero: anioActual - 4, actual: anioActual }));
        const c = { ...form, ...delEnlace, tipo: inicial, ejercicio: elegido };
        setForm(c);
        setAplicada(c);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(async (c: Consulta) => {
    setError('');
    if (faltaCuenta(c)) {
      setTabla(null);
      return;
    }
    const ruta = INFORMES.find((i) => i.id === c.tipo)!.ruta;
    setCargando(true);
    try {
      const r = await apiFetch<{ tabla: Tabla; tercero?: TerceroMayor | null }>(companyPath(`/informes-contables/${ruta}?${parametros(c)}`));
      setTabla(r.tabla);
      if (r.tercero) setTerceroLeido(r.tercero);
    } catch (e) {
      setTabla(null);
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (aplicada) cargar(aplicada);
  }, [aplicada, cargar]);

  // Un enlace a esta misma pantalla con otro ?tipo= (la página ya está montada): se cambia de informe.
  useEffect(() => {
    if (!tipoUrl || tipoUrl === tipoVisto.current) return;
    tipoVisto.current = tipoUrl;
    setForm((f) => ({ ...f, tipo: tipoUrl }));
    setAplicada((a) => (a ? { ...a, tipo: tipoUrl } : a));
  }, [tipoUrl]);

  // Un enlace al mayor de otro cliente, proveedor o cuenta con la pantalla ya abierta.
  useEffect(() => {
    if (!claveMayorUrl || claveMayorUrl === mayorVisto.current) return;
    mayorVisto.current = claveMayorUrl;
    const m = mayorDeLaUrl(sp);
    if (!m) return;
    setForm((f) => ({ ...f, ...m, tipo: 'mayor' }));
    setAplicada((a) => (a ? { ...a, ...m, tipo: 'mayor' } : a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveMayorUrl]);

  /** Cambios que se aplican al momento (informe, ejercicio, nivel...). */
  const cambiarYAplicar = (cambios: Partial<Consulta>) => {
    const c = { ...form, ...cambios };
    // Al cambiar de ejercicio, unas fechas de otro año ya no valen.
    if (cambios.ejercicio !== undefined) {
      c.desde = '';
      c.hasta = '';
    }
    setForm(c);
    setAplicada(c);
  };

  const descargar = async (formato: 'pdf' | 'xlsx') => {
    if (!aplicada || faltaCuenta(aplicada)) return;
    const info = INFORMES.find((i) => i.id === aplicada.tipo)!;
    const p = parametros(aplicada);
    p.set('formato', formato);
    const deQuien = aplicada.tipo === 'mayor' && aplicada.mayorPor === 'tercero' ? ` ${terceroLeido?.nombre || aplicada.tercero?.nombre || ''}` : '';
    const nombre = `${info.nombre}${deQuien} ${aplicada.desde || aplicada.hasta ? `${p.get('desde')} a ${p.get('hasta')}` : aplicada.ejercicio}`
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w-]+/g, '_');
    setDescargando(formato);
    setError('');
    try {
      await apiDownload(companyPath(`/informes-contables/${info.ruta}?${p}`), `${nombre}.${formato}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDescargando('');
    }
  };

  const info = INFORMES.find((i) => i.id === form.tipo)!;
  const minFecha = `${form.ejercicio}-01-01`;
  const maxFecha = `${form.ejercicio}-12-31`;
  const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  const puedeDescargar = !!aplicada && !faltaCuenta(aplicada) && !!tabla && !cargando;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Informes contables</h1>
          <Tooltip text="Salen de los asientos contabilizados. No cuentan los asientos de regularización ni de cierre, así que un ejercicio ya cerrado se ve con sus cifras reales." />
        </div>
        <p className="mt-2 text-slate-600">Balance, pérdidas y ganancias, sumas y saldos, mayor y diario de cualquier ejercicio, en PDF o Excel.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {INFORMES.map((i) => (
          <button
            key={i.id}
            role="tab"
            aria-selected={form.tipo === i.id}
            onClick={() => {
              // La URL sigue al informe elegido: un enlace posterior a ?tipo=... siempre es un cambio.
              tipoVisto.current = i.id;
              router.replace(`/dashboard/informes?tipo=${i.id}&ejercicio=${form.ejercicio}`, { scroll: false });
              cambiarYAplicar({ tipo: i.id });
            }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium sm:px-4 ${form.tipo === i.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {i.nombre}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAplicada({ ...form });
        }}
        className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex sm:flex-wrap sm:items-end"
      >
        <div className="col-span-2 sm:col-span-1 sm:w-32">
          <SelectorAnio
            id="inf-ej"
            valor={form.ejercicio}
            anios={ejercicios}
            onChange={(a) => {
              if (a === null) return;
              // El año va a la URL: al volver atrás, el informe sigue en él.
              ponerEnUrl({ ejercicio: a });
              cambiarYAplicar({ ejercicio: a });
            }}
            className={campo}
            claseEtiqueta="block text-xs font-medium text-slate-600"
          />
        </div>
        {form.tipo !== 'balance' && (
          <div className="sm:w-40">
            <label htmlFor="inf-desde" className="block text-xs font-medium text-slate-600">Desde</label>
            <input id="inf-desde" type="date" min={minFecha} max={maxFecha} value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} className={campo} />
          </div>
        )}
        <div className="sm:w-40">
          <label htmlFor="inf-hasta" className="block text-xs font-medium text-slate-600">{form.tipo === 'balance' ? 'A fecha' : 'Hasta'}</label>
          <input id="inf-hasta" type="date" min={minFecha} max={maxFecha} value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} className={campo} />
        </div>

        {form.tipo === 'sumas' && (
          <>
            <div className="col-span-2 sm:col-span-1 sm:w-44">
              <label htmlFor="inf-nivel" className="block text-xs font-medium text-slate-600">Nivel</label>
              <select id="inf-nivel" value={form.nivel} onChange={(e) => cambiarYAplicar({ nivel: e.target.value })} className={campo}>
                <option value="subcuenta">Subcuenta</option>
                <option value="4">Cuentas de 4 dígitos</option>
                <option value="3">Cuentas de 3 dígitos</option>
              </select>
            </div>
            <div className="sm:w-36">
              <label htmlFor="inf-scta" className="block text-xs font-medium text-slate-600">Cuenta</label>
              <BuscadorCuenta id="inf-scta" valor={form.cuentaDesde} onCambiar={(v) => setForm((f) => ({ ...f, cuentaDesde: v }))} placeholder="430 o nombre" />
            </div>
            <div className="sm:w-36">
              <label htmlFor="inf-scta2" className="block text-xs font-medium text-slate-600">Hasta cuenta (opcional)</label>
              <BuscadorCuenta id="inf-scta2" derecha valor={form.cuentaHasta} onCambiar={(v) => setForm((f) => ({ ...f, cuentaHasta: v }))} placeholder="430 o nombre" />
            </div>
            {form.nivel === 'subcuenta' && (
              <label className="col-span-2 flex items-center gap-2 pb-2 text-sm text-slate-600 sm:col-span-1">
                <input type="checkbox" checked={form.ocultarSinMovimiento} onChange={(e) => cambiarYAplicar({ ocultarSinMovimiento: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                Ocultar subcuentas sin movimientos
              </label>
            )}
          </>
        )}
        {form.tipo === 'mayor' && (
          <>
            <fieldset className="col-span-2 sm:col-span-1">
              <legend className="block text-xs font-medium text-slate-600">Ver el mayor de</legend>
              <div className="mt-1 inline-flex w-full rounded-lg border border-slate-300 p-0.5 text-sm sm:w-auto">
                {(
                  [
                    ['cuenta', 'Una cuenta o rango'],
                    ['tercero', 'Un cliente o proveedor'],
                  ] as const
                ).map(([valor, texto]) => (
                  <label
                    key={valor}
                    className={`flex flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-1 ${form.mayorPor === valor ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <input type="radio" name="inf-mayor-por" value={valor} checked={form.mayorPor === valor} onChange={() => cambiarYAplicar({ mayorPor: valor })} className="sr-only" />
                    {texto}
                  </label>
                ))}
              </div>
            </fieldset>
            {form.mayorPor === 'tercero' ? (
              <div className="col-span-2 sm:w-80">
                <label htmlFor="inf-tercero" className="block text-xs font-medium text-slate-600">Cliente o proveedor</label>
                <BuscadorTercero
                  elegido={form.tercero ? { ...form.tercero, ...(terceroLeido && terceroLeido.id === form.tercero.id && !form.tercero.nombre ? terceroLeido : {}) } : null}
                  onElegir={(t) => cambiarYAplicar({ tercero: t })}
                />
              </div>
            ) : (
              <>
                <div className="sm:w-36">
                  <label htmlFor="inf-cta" className="block text-xs font-medium text-slate-600">Cuenta</label>
                  <BuscadorCuenta id="inf-cta" valor={form.cuentaDesde} onCambiar={(v) => setForm((f) => ({ ...f, cuentaDesde: v }))} placeholder="572 o banco" />
                </div>
                <div className="sm:w-36">
                  <label htmlFor="inf-cta2" className="block text-xs font-medium text-slate-600">Hasta cuenta (opcional)</label>
                  <BuscadorCuenta id="inf-cta2" derecha valor={form.cuentaHasta} onCambiar={(v) => setForm((f) => ({ ...f, cuentaHasta: v }))} placeholder="579 o nombre" />
                </div>
              </>
            )}
          </>
        )}
        {form.tipo === 'diario' && (
          <label className="col-span-2 flex items-center gap-2 pb-2 text-sm text-slate-600 sm:col-span-1">
            <input type="checkbox" checked={form.incluirCierre} onChange={(e) => cambiarYAplicar({ incluirCierre: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Incluir regularización y cierre
          </label>
        )}

        <button type="submit" className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:col-span-1">
          <MagnifyingGlass size={16} /> Ver informe
        </button>
        <div className="col-span-2 flex gap-2 sm:ml-auto">
          <button
            type="button"
            disabled={!puedeDescargar || !!descargando}
            onClick={() => descargar('pdf')}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none"
          >
            <FilePdf size={16} /> {descargando === 'pdf' ? 'Preparando…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            disabled={!puedeDescargar || !!descargando}
            onClick={() => descargar('xlsx')}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 sm:flex-none"
          >
            <FileXls size={16} /> {descargando === 'xlsx' ? 'Preparando…' : 'Descargar Excel'}
          </button>
        </div>
      </form>

      <p className="text-sm text-slate-500">
        {info.ayuda} {form.tipo === 'balance' ? 'Sin fecha, a 31 de diciembre.' : 'Sin fechas, el ejercicio completo.'}
        {form.tipo === 'mayor' &&
          (form.mayorPor === 'tercero'
            ? ' Busca al cliente o proveedor por su nombre, su NIF o su subcuenta: salen los movimientos de sus subcuentas.'
            : ' Escribe el código de una cuenta (572 trae todas las 572…) o búscala por su nombre («banco», «luz») y elígela. Con «Hasta cuenta» sacas un rango (430 a 430: todos los clientes, cada uno con su subcuenta).')}
        {form.tipo === 'sumas' && ' Con «Cuenta» sacas solo esa cuenta y sus subcuentas (430: los clientes); con «Hasta cuenta», un rango (400 a 410: proveedores y acreedores). Las cuentas se pueden buscar por su nombre.'}
      </p>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {aplicada && faltaCuenta(aplicada) ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {aplicada.mayorPor === 'tercero' ? 'Elige un cliente o proveedor para ver el mayor de sus subcuentas.' : 'Indica una cuenta para ver su mayor.'}
        </div>
      ) : cargando ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Calculando el informe…</div>
      ) : tabla ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{tabla.titulo}</h2>
            <span className="text-sm text-slate-500">{tabla.periodo}</span>
          </div>
          <TablaInforme tabla={tabla} maxFilas={3000} />
        </section>
      ) : null}
    </div>
  );
}
