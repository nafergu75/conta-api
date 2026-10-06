'use client';

import { useCallback, useEffect, useState } from 'react';
import { FilePdf, FileXls, MagnifyingGlass } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { TablaInforme, type Tabla } from './TablaInforme';

/**
 * Informes contables de cualquier ejercicio (tambien los ya cerrados), en
 * pantalla y para descargar en PDF o Excel. Todos salen de los asientos
 * contabilizados, sin los de regularizacion ni cierre.
 */

type TipoInforme = 'balance' | 'pyg' | 'sumas' | 'mayor' | 'diario';

const INFORMES: Array<{ id: TipoInforme; nombre: string; ruta: string; ayuda: string }> = [
  { id: 'balance', nombre: 'Balance de situación', ruta: 'balance', ayuda: 'Modelo PYMES del PGC, con la columna del ejercicio anterior.' },
  { id: 'pyg', nombre: 'Pérdidas y ganancias', ruta: 'perdidas-ganancias', ayuda: 'Modelo PYMES del PGC, con la columna del ejercicio anterior.' },
  { id: 'sumas', nombre: 'Sumas y saldos', ruta: 'sumas-saldos', ayuda: 'Saldo inicial, debe, haber y saldo de cada cuenta.' },
  { id: 'mayor', nombre: 'Libro mayor', ruta: 'mayor', ayuda: 'Movimientos de una cuenta o de un rango, con el saldo acumulado.' },
  { id: 'diario', nombre: 'Libro diario', ruta: 'diario', ayuda: 'Todos los asientos del periodo, por fecha.' },
];

interface Consulta {
  tipo: TipoInforme;
  ejercicio: number;
  desde: string;
  hasta: string;
  nivel: string;
  cuentaDesde: string;
  cuentaHasta: string;
  incluirCierre: boolean;
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
  if (c.tipo === 'sumas') p.set('nivel', c.nivel);
  if (c.tipo === 'mayor') {
    const d = c.cuentaDesde.trim();
    const h = c.cuentaHasta.trim();
    if (d && !h) p.set('cuenta', d);
    else {
      if (d) p.set('cuentaDesde', d);
      if (h) p.set('cuentaHasta', h);
    }
  }
  if (c.tipo === 'diario' && c.incluirCierre) p.set('incluirCierre', '1');
  return p;
}

const faltaCuenta = (c: Consulta) => c.tipo === 'mayor' && !c.cuentaDesde.trim() && !c.cuentaHasta.trim();

export default function InformesContablesPage() {
  const anioActual = new Date().getFullYear();
  const [ejercicios, setEjercicios] = useState<number[]>([anioActual]);
  const [form, setForm] = useState<Consulta>({
    tipo: 'balance',
    ejercicio: anioActual,
    desde: '',
    hasta: '',
    nivel: 'subcuenta',
    cuentaDesde: '',
    cuentaHasta: '',
    incluirCierre: false,
  });
  const [aplicada, setAplicada] = useState<Consulta | null>(null);
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState<'' | 'pdf' | 'xlsx'>('');
  const [error, setError] = useState('');

  // Ejercicios con asientos y, si se llega desde un enlace antiguo, el informe pedido (?tipo=pyg).
  useEffect(() => {
    const tipo = new URLSearchParams(window.location.search).get('tipo');
    const inicial = INFORMES.some((i) => i.id === tipo) ? (tipo as TipoInforme) : 'balance';
    apiFetch<number[]>(companyPath('/informes-contables/ejercicios'))
      .then((lista) => {
        const anios = lista.length ? lista : [anioActual];
        setEjercicios(anios);
        const c = { ...form, tipo: inicial, ejercicio: anios[0] };
        setForm(c);
        setAplicada(c);
      })
      .catch((e) => {
        setError(errorMessage(e));
        const c = { ...form, tipo: inicial };
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
      const r = await apiFetch<{ tabla: Tabla }>(companyPath(`/informes-contables/${ruta}?${parametros(c)}`));
      setTabla(r.tabla);
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
    const nombre = `${info.nombre} ${aplicada.desde || aplicada.hasta ? `${p.get('desde')} a ${p.get('hasta')}` : aplicada.ejercicio}`
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
            onClick={() => cambiarYAplicar({ tipo: i.id })}
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
          <label htmlFor="inf-ej" className="block text-xs font-medium text-slate-600">Ejercicio</label>
          <select id="inf-ej" value={form.ejercicio} onChange={(e) => cambiarYAplicar({ ejercicio: Number(e.target.value) })} className={campo}>
            {ejercicios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
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
          <div className="col-span-2 sm:col-span-1 sm:w-44">
            <label htmlFor="inf-nivel" className="block text-xs font-medium text-slate-600">Nivel</label>
            <select id="inf-nivel" value={form.nivel} onChange={(e) => cambiarYAplicar({ nivel: e.target.value })} className={campo}>
              <option value="subcuenta">Subcuenta</option>
              <option value="4">Cuentas de 4 dígitos</option>
              <option value="3">Cuentas de 3 dígitos</option>
            </select>
          </div>
        )}
        {form.tipo === 'mayor' && (
          <>
            <div className="sm:w-36">
              <label htmlFor="inf-cta" className="block text-xs font-medium text-slate-600">Cuenta</label>
              <input id="inf-cta" inputMode="numeric" value={form.cuentaDesde} onChange={(e) => setForm({ ...form, cuentaDesde: e.target.value })} placeholder="572" className={`${campo} font-mono`} />
            </div>
            <div className="sm:w-36">
              <label htmlFor="inf-cta2" className="block text-xs font-medium text-slate-600">Hasta cuenta (opcional)</label>
              <input id="inf-cta2" inputMode="numeric" value={form.cuentaHasta} onChange={(e) => setForm({ ...form, cuentaHasta: e.target.value })} placeholder="579" className={`${campo} font-mono`} />
            </div>
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
        {form.tipo === 'mayor' && ' Escribe una cuenta (572 trae todas las 572…) o un rango con «Hasta cuenta».'}
      </p>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {aplicada && faltaCuenta(aplicada) ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Indica una cuenta para ver su mayor.
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
