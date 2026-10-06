'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Trash, XCircle } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import {
  AJUSTES_INICIALES,
  boton,
  botonSecundario,
  campo,
  Dato,
  esNecesitaMapeo,
  eur,
  fechaEs,
  FilasDescartadas,
  formulario,
  MapeoColumnas,
  Mensajes,
  num,
  SubidaFichero,
  subirPorTrozos,
  TAM_DIRECTO,
  TAM_MAXIMO,
  type AjustesLectura,
  type Lectura,
  type NecesitaMapeo,
} from '../importacion';

/**
 * Puesta en marcha: cargar la contabilidad que se llevaba en otro programa.
 *  1. Balance de sumas y saldos al cierre -> asiento de apertura.
 *  2. Diario o mayor del año en curso hasta hoy (opcional).
 *  3. Balance y PyG de años anteriores, solo para comparar (columna N-1).
 */

type Pestana = 'apertura' | 'diario' | 'anteriores';

interface Estado {
  ejercicios: Array<{ label: string; estado: string }>;
  aperturas: Array<{ ejercicio: number; id: string; numero: string; fecha: string; importe: number; apuntes: number }>;
  diariosImportados: Array<{ ejercicio: number; asientos: number; desde: string; hasta: string }>;
  comparativos: Array<{ ejercicio: number; cuentasBalance: number; cuentasPyg: number; resultado: number; actualizado: string }>;
}

const CAMPOS_BALANCE: Array<[string, string]> = [
  ['cuenta', 'Cuenta'],
  ['nombre', 'Nombre de la cuenta'],
  ['saldoDeudor', 'Saldo deudor'],
  ['saldoAcreedor', 'Saldo acreedor'],
  ['saldo', 'Saldo (una sola columna)'],
  ['debe', 'Sumas Debe'],
  ['haber', 'Sumas Haber'],
];

const CAMPOS_DIARIO: Array<[string, string]> = [
  ['fecha', 'Fecha'],
  ['asiento', 'Nº de asiento'],
  ['cuenta', 'Cuenta'],
  ['nombre', 'Nombre de la cuenta'],
  ['concepto', 'Concepto'],
  ['debe', 'Debe'],
  ['haber', 'Haber'],
  ['importe', 'Importe (una sola columna)'],
  ['signo', 'Lado D/H'],
];

const anioActual = new Date().getFullYear();

export default function PuestaEnMarchaPage() {
  const puedeEditar = tieneAlgunPermiso(getUser(), ['contabilidad:write']);
  const [pestana, setPestana] = useState<Pestana>('apertura');
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try {
      setEstado(await apiFetch<Estado>(companyPath('/puesta-en-marcha')));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const hecho = (texto: string) => {
    setAviso(texto);
    setError('');
    cargar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const anular = async (ruta: string, pregunta: string, texto: string) => {
    if (!window.confirm(pregunta)) return;
    try {
      await apiFetch(companyPath(ruta), { method: 'DELETE' });
      hecho(texto);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Puesta en marcha</h1>
          <Tooltip text="Trae los saldos y movimientos que llevabas en otro programa (A3, Contasol, Sage, Holded, FacturaScripts...). Vale cualquier Excel o CSV: se reconocen las columnas y puedes corregirlas." />
        </div>
        <p className="mt-2 text-slate-600">
          Carga el balance del último cierre para crear el asiento de apertura y, si empiezas a mitad de año, los movimientos del año en curso.
        </p>
      </div>

      {aviso && (
        <p className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle size={18} className="mt-0.5 shrink-0" /> <span>{aviso}</span>
        </p>
      )}
      {error && <Mensajes errores={[error]} />}

      {estado && (estado.aperturas.length > 0 || estado.diariosImportados.length > 0 || estado.comparativos.length > 0) && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Ya cargado</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {estado.aperturas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-700">
                  Apertura {a.ejercicio}: <span className="font-mono">{a.numero}</span> del {fechaEs(a.fecha)}, {a.apuntes} apuntes, {eur.format(a.importe)}
                </span>
                {puedeEditar && (
                  <button
                    onClick={() => anular(`/puesta-en-marcha/apertura?ejercicio=${a.ejercicio}`, `¿Anular el asiento de apertura ${a.numero} del ${a.ejercicio}?`, `Apertura del ${a.ejercicio} anulada.`)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                  >
                    <Trash size={14} /> Anular
                  </button>
                )}
              </li>
            ))}
            {estado.diariosImportados.map((d) => (
              <li key={`d${d.ejercicio}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-700">
                  Diario {d.ejercicio}: {d.asientos} asientos importados ({fechaEs(d.desde)} a {fechaEs(d.hasta)})
                </span>
                {puedeEditar && (
                  <button
                    onClick={() => anular(`/puesta-en-marcha/diario?ejercicio=${d.ejercicio}`, `¿Anular los ${d.asientos} asientos importados del ${d.ejercicio}?`, `Asientos importados del ${d.ejercicio} anulados.`)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                  >
                    <Trash size={14} /> Anular
                  </button>
                )}
              </li>
            ))}
            {estado.comparativos.map((c) => (
              <li key={`c${c.ejercicio}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-700">
                  Comparativo {c.ejercicio}: {c.cuentasBalance} cuentas de balance, {c.cuentasPyg} de resultados (resultado {eur.format(c.resultado)})
                </span>
                {puedeEditar && (
                  <button
                    onClick={() => anular(`/puesta-en-marcha/comparativo/${c.ejercicio}`, `¿Borrar los datos comparativos del ${c.ejercicio}?`, `Comparativo del ${c.ejercicio} borrado.`)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                  >
                    <Trash size={14} /> Borrar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!puedeEditar ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Necesitas permiso de escritura en contabilidad para importar datos.</p>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
            {(
              [
                ['apertura', '1. Balance de apertura'],
                ['diario', '2. Movimientos del año'],
                ['anteriores', '3. Años anteriores'],
              ] as Array<[Pestana, string]>
            ).map(([id, texto]) => (
              <button
                key={id}
                role="tab"
                aria-selected={pestana === id}
                onClick={() => {
                  setPestana(id);
                  setAviso('');
                }}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                  pestana === id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>

          {pestana === 'apertura' && <ImportarApertura onHecho={hecho} />}
          {pestana === 'diario' && <ImportarDiario onHecho={hecho} />}
          {pestana === 'anteriores' && <ImportarComparativo onHecho={hecho} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logica comun: vista previa automatica al cambiar fichero, ajustes u opciones
// ---------------------------------------------------------------------------

function useImportacion<V>(ruta: string, opciones: Record<string, string | number | boolean | undefined>) {
  const [archivo, setArchivo] = useState<File | null>(null);
  // Lo que se manda al servidor: el fichero si es pequeno, o el id de su subida por trozos.
  const [fuente, setFuente] = useState<File | string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState<AjustesLectura>(AJUSTES_INICIALES);
  const [vista, setVista] = useState<V | NecesitaMapeo | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const eleccion = useRef(0);
  const clave = JSON.stringify(opciones);

  useEffect(() => {
    if (!fuente) return;
    let vigente = true;
    setOcupado(true);
    setError('');
    apiFetch<V | NecesitaMapeo>(companyPath(`${ruta}/vista-previa`), { method: 'POST', body: formulario(fuente, ajustes, JSON.parse(clave)) })
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
  }, [fuente, ajustes, clave, ruta]);

  // `extra`: opciones que solo cuentan al confirmar (no cambian la vista previa).
  const confirmar = async <R,>(extra: Record<string, string | number | boolean | undefined> = {}): Promise<R | null> => {
    if (!fuente) return null;
    setOcupado(true);
    setError('');
    try {
      return await apiFetch<R>(companyPath(ruta), { method: 'POST', body: formulario(fuente, ajustes, { ...opciones, ...extra }) });
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const elegir = (f: File) => {
    const n = ++eleccion.current;
    setArchivo(f);
    setFuente(null);
    setAjustes(AJUSTES_INICIALES);
    setVista(null);
    setError('');
    if (f.size > TAM_MAXIMO) {
      setError(`El fichero pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${TAM_MAXIMO / 1024 / 1024} MB. Exporta un periodo más corto o quita columnas que no hagan falta.`);
      return;
    }
    if (f.size <= TAM_DIRECTO) {
      setFuente(f);
      return;
    }
    // Fichero grande: se sube antes por trozos y luego se trabaja con su id.
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
    setProgreso(null);
    setVista(null);
    setAjustes(AJUSTES_INICIALES);
    setError('');
  };

  return { archivo, elegir, limpiar, ajustes, setAjustes, vista, error, ocupado: ocupado || progreso !== null, progreso, confirmar };
}

function BloqueMapeo({
  vista,
  campos,
  ajustes,
  setAjustes,
  conSigno,
}: {
  vista: { lectura: Lectura | null } | NecesitaMapeo;
  campos: Array<[string, string]>;
  ajustes: AjustesLectura;
  setAjustes: (a: AjustesLectura) => void;
  conSigno?: boolean;
}) {
  if (esNecesitaMapeo(vista)) {
    return (
      <div className="space-y-3">
        <Mensajes avisos={[vista.mensaje]} />
        <MapeoColumnas
          campos={campos}
          columnas={vista.columnas}
          mapeoDetectado={vista.mapeo ?? {}}
          filaDetectada={ajustes.filaCabecera ?? 1}
          ajustes={ajustes}
          abierto
          conSigno={conSigno}
          onCambiar={setAjustes}
        />
      </div>
    );
  }
  if (!vista.lectura) return null;
  return (
    <>
      <MapeoColumnas
        campos={campos}
        columnas={vista.lectura.columnas}
        mapeoDetectado={vista.lectura.mapeo}
        filaDetectada={vista.lectura.filaCabecera}
        ajustes={ajustes}
        abierto={false}
        conSigno={conSigno}
        onCambiar={setAjustes}
      />
      <FilasDescartadas filas={vista.lectura.filasDescartadas} />
    </>
  );
}

function TablaLineas({ lineas, nuevas, totalDebe, totalHaber }: { lineas: Array<{ cuenta: string; nombre: string; debe: number; haber: number }>; nuevas?: Set<string>; totalDebe?: number; totalHaber?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Cuenta</th>
            <th className="px-3 py-2 font-medium">Nombre</th>
            <th className="px-3 py-2 text-right font-medium">Debe</th>
            <th className="px-3 py-2 text-right font-medium">Haber</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lineas.map((l, i) => (
            <tr key={`${l.cuenta}-${i}`}>
              <td className="px-3 py-1.5 font-mono">{l.cuenta}</td>
              <td className="px-3 py-1.5 text-slate-700">
                {l.nombre}
                {nuevas?.has(l.cuenta) && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">nueva</span>}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.debe ? num.format(l.debe) : ''}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.haber ? num.format(l.haber) : ''}</td>
            </tr>
          ))}
        </tbody>
        {totalDebe !== undefined && (
          <tfoot className="bg-slate-50 font-semibold text-slate-900">
            <tr>
              <td className="px-3 py-2" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{num.format(totalDebe)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num.format(totalHaber ?? 0)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const Check = ({ ok }: { ok: boolean }) => (ok ? <CheckCircle size={18} className="inline text-emerald-600" /> : <XCircle size={18} className="inline text-red-600" />);

// ---------------------------------------------------------------------------
// 1. Balance de apertura
// ---------------------------------------------------------------------------

interface VistaApertura {
  ejercicio: number;
  fecha: string;
  lectura: Lectura | null;
  cuentas: Array<{ codigo: string; nombre: string; saldo: number; nueva: boolean; pyg: boolean }>;
  totales: { deudor: number; acreedor: number; diferencia: number; cuadra: boolean };
  pyg: { cuentas: number; resultado: number; cuentaResultado: string };
  asiento: { fecha: string; concepto: string; lineas: Array<{ cuenta: string; nombre: string; debe: number; haber: number }>; debe: number; haber: number; cuadra: boolean };
  cuentasNuevas: Array<{ codigo: string; nombre: string; padre: string }>;
  aperturaExistente: { id: string; numero: string; fecha: string } | null;
  errores: string[];
  avisos: string[];
  puedeConfirmar: boolean;
}

function ImportarApertura({ onHecho }: { onHecho: (t: string) => void }) {
  const [ejercicio, setEjercicio] = useState(anioActual);
  const [fecha, setFecha] = useState('');
  const [reemplazar, setReemplazar] = useState(false);
  const [guardarComparativo, setGuardarComparativo] = useState(true);
  const imp = useImportacion<VistaApertura>('/puesta-en-marcha/apertura', { ejercicio, fecha, reemplazar });
  const v = imp.vista && !esNecesitaMapeo(imp.vista) ? imp.vista : null;

  const confirmar = async () => {
    if (!v) return;
    if (!window.confirm(`Se creará el asiento de apertura del ${v.ejercicio} con ${v.asiento.lineas.length} apuntes (${eur.format(v.asiento.debe)}). ¿Continuar?`)) return;
    const r = await imp.confirmar<{ asiento: { numero: string }; cuentasCreadas: number; comparativoGuardado: boolean }>({ guardarComparativo });
    if (!r) return;
    imp.limpiar();
    onHecho(
      `Asiento de apertura ${r.asiento.numero} creado${r.cuentasCreadas ? `; ${r.cuentasCreadas} subcuentas nuevas en el plan` : ''}${r.comparativoGuardado ? `; guardado también como comparativo del ${v.ejercicio - 1}` : ''}.`,
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Exporta del programa anterior el <strong>balance de sumas y saldos por subcuentas</strong> a la fecha de cierre del último ejercicio (normalmente el 31/12). Con él se crea el
        asiento de apertura del ejercicio que eliges. Si el balance aún tiene gastos e ingresos (grupos 6 y 7), su resultado va a la cuenta 129.
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">
          Ejercicio que se abre
          <input type="number" className={campo} value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value) || anioActual)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Fecha del asiento
          <input type="date" className={campo} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Vacía: 1 de enero del ejercicio.</span>
        </label>
      </div>

      <SubidaFichero
        archivo={imp.archivo}
        ocupado={imp.ocupado}
        progreso={imp.progreso}
        texto="Haz clic o arrastra el balance de sumas y saldos"
        ayuda="Excel (.xlsx, .xls) o CSV, de cualquier programa"
        onElegir={imp.elegir}
      />

      {imp.error && <Mensajes errores={[imp.error]} />}
      {imp.vista && <BloqueMapeo vista={imp.vista} campos={CAMPOS_BALANCE} ajustes={imp.ajustes} setAjustes={imp.setAjustes} conSigno />}

      {v && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato titulo="Cuentas con saldo" valor={v.cuentas.length} />
            <Dato titulo="Saldos deudores" valor={eur.format(v.totales.deudor)} />
            <Dato titulo="Saldos acreedores" valor={eur.format(v.totales.acreedor)} />
            <Dato
              titulo="Cuadre"
              valor={
                <>
                  <Check ok={v.totales.cuadra} /> {v.totales.cuadra ? 'Cuadra' : `Diferencia ${eur.format(v.totales.diferencia)}`}
                </>
              }
              tono={v.totales.cuadra ? 'bien' : 'mal'}
            />
          </div>
          {v.pyg.cuentas > 0 && (
            <p className="text-sm text-slate-600">
              Resultado de las {v.pyg.cuentas} cuentas de gastos e ingresos: <strong>{eur.format(v.pyg.resultado)}</strong> → cuenta {v.pyg.cuentaResultado}.
            </p>
          )}

          <Mensajes errores={v.errores} avisos={v.avisos} />

          <h3 className="text-sm font-semibold text-slate-900">
            {v.asiento.concepto} · {fechaEs(v.asiento.fecha)}
          </h3>
          <TablaLineas lineas={v.asiento.lineas} nuevas={new Set(v.cuentasNuevas.map((c) => c.codigo))} totalDebe={v.asiento.debe} totalHaber={v.asiento.haber} />
          {v.cuentasNuevas.length > 0 && (
            <p className="text-xs text-slate-500">
              {v.cuentasNuevas.length} cuenta(s) marcadas como <em>nueva</em> se darán de alta en el plan contable colgando de su cuenta del PGC (por ejemplo{' '}
              {v.cuentasNuevas[0].codigo} → {v.cuentasNuevas[0].padre}).
            </p>
          )}

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            {v.aperturaExistente && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
                <span>
                  Reemplazar la apertura anterior ({v.aperturaExistente.numero} del {fechaEs(v.aperturaExistente.fecha)}): se anula y queda como rastro.
                </span>
              </label>
            )}
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={guardarComparativo} onChange={(e) => setGuardarComparativo(e.target.checked)} />
              <span>Guardar también estos saldos como comparativo del {v.ejercicio - 1} (columna del año anterior en balance y cuenta de resultados).</span>
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={imp.limpiar} disabled={imp.ocupado} className={botonSecundario}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={imp.ocupado || !v.puedeConfirmar} className={boton}>
              {imp.ocupado ? 'Procesando...' : 'Crear asiento de apertura'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Diario / mayor del año en curso
// ---------------------------------------------------------------------------

interface VistaDiario {
  ejercicio: number;
  agrupacion: 'asiento' | 'fecha' | 'mes';
  lectura: Lectura | null;
  resumen: { asientos: number; apuntes: number; debe: number; haber: number; desde: string; hasta: string };
  descuadrados: Array<{ clave: string; fecha: string; debe: number; haber: number; diferencia: number }>;
  excluidos: Array<{ clave: string; fecha: string; tipo: string; importe: number }>;
  fueraDeEjercicio: number;
  muestra: Array<{ clave: string; fecha: string; concepto: string; lineas: Array<{ cuenta: string; nombre: string; debe: number; haber: number }>; debe: number; haber: number }>;
  cuentasNuevas: Array<{ codigo: string; nombre: string; padre: string }>;
  apertura: { numero: string; fecha: string } | null;
  importacionPrevia: { asientos: number } | null;
  errores: string[];
  avisos: string[];
  puedeConfirmar: boolean;
}

function ImportarDiario({ onHecho }: { onHecho: (t: string) => void }) {
  const [ejercicio, setEjercicio] = useState<number | ''>('');
  const [agrupacion, setAgrupacion] = useState<'auto' | 'asiento' | 'fecha' | 'mes'>('auto');
  const [incluirEspeciales, setIncluirEspeciales] = useState(false);
  const [reemplazar, setReemplazar] = useState(false);
  const imp = useImportacion<VistaDiario>('/puesta-en-marcha/diario', { ejercicio, agrupacion, incluirEspeciales, reemplazar });
  const v = imp.vista && !esNecesitaMapeo(imp.vista) ? imp.vista : null;

  const confirmar = async () => {
    if (!v) return;
    if (!window.confirm(`Se crearán ${v.resumen.asientos} asientos (${v.resumen.apuntes} apuntes) en el ${v.ejercicio}. ¿Continuar?`)) return;
    const r = await imp.confirmar<{ asientosCreados: number; cuentasCreadas: number; anulados: number }>();
    if (!r) return;
    imp.limpiar();
    onHecho(`${r.asientosCreados} asientos importados${r.anulados ? ` (${r.anulados} de la importación anterior anulados)` : ''}${r.cuentasCreadas ? `; ${r.cuentasCreadas} subcuentas nuevas` : ''}.`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Solo si empiezas a usar la aplicación a mitad de año: exporta el <strong>libro diario</strong> (o el mayor de todas las cuentas) desde el 1 de enero hasta la fecha de
        arranque. Los apuntes se agrupan por número de asiento; si el fichero no lo trae, por día. Cada asiento tiene que cuadrar.
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">
          Ejercicio
          <input type="number" placeholder="El del fichero" className={campo} value={ejercicio} onChange={(e) => setEjercicio(e.target.value ? Number(e.target.value) : '')} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Agrupar apuntes en asientos
          <select className={campo} value={agrupacion} onChange={(e) => setAgrupacion(e.target.value as typeof agrupacion)}>
            <option value="auto">Automático</option>
            <option value="asiento">Por número de asiento</option>
            <option value="fecha">Por día</option>
            <option value="mes">Un asiento resumen por mes</option>
          </select>
        </label>
      </div>

      <SubidaFichero archivo={imp.archivo} ocupado={imp.ocupado} progreso={imp.progreso} texto="Haz clic o arrastra el libro diario o el mayor" ayuda="Excel (.xlsx, .xls) o CSV con fecha, cuenta e importes" onElegir={imp.elegir} />

      {imp.error && <Mensajes errores={[imp.error]} />}
      {imp.vista && <BloqueMapeo vista={imp.vista} campos={CAMPOS_DIARIO} ajustes={imp.ajustes} setAjustes={imp.setAjustes} />}

      {v && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato titulo={`Asientos (${v.agrupacion === 'asiento' ? 'por número' : v.agrupacion === 'fecha' ? 'por día' : 'por mes'})`} valor={v.resumen.asientos} />
            <Dato titulo="Apuntes" valor={v.resumen.apuntes} />
            <Dato titulo="Periodo" valor={v.resumen.desde ? `${fechaEs(v.resumen.desde)} – ${fechaEs(v.resumen.hasta)}` : '—'} />
            <Dato titulo="Total Debe / Haber" valor={`${num.format(v.resumen.debe)} / ${num.format(v.resumen.haber)}`} tono={v.descuadrados.length ? 'mal' : 'bien'} />
          </div>

          <Mensajes errores={v.errores} avisos={v.avisos} />

          {v.descuadrados.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-red-200 bg-white">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-red-50 text-left text-red-700">
                  <tr>
                    <th className="px-3 py-2 font-medium">Asiento / día</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 text-right font-medium">Debe</th>
                    <th className="px-3 py-2 text-right font-medium">Haber</th>
                    <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {v.descuadrados.map((d) => (
                    <tr key={d.clave}>
                      <td className="px-3 py-1.5 font-mono">{d.clave}</td>
                      <td className="px-3 py-1.5">{fechaEs(d.fecha)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{num.format(d.debe)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{num.format(d.haber)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-red-700">{num.format(d.diferencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {v.muestra.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">Ver los primeros {v.muestra.length} asientos</summary>
              <div className="mt-3 space-y-4">
                {v.muestra.map((a) => (
                  <div key={a.clave} className="space-y-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-mono text-slate-500">{a.clave}</span> · {fechaEs(a.fecha)} · {a.concepto}
                    </p>
                    <TablaLineas lineas={a.lineas} />
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            {v.excluidos.length > 0 && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={incluirEspeciales} onChange={(e) => setIncluirEspeciales(e.target.checked)} />
                <span>Importar también los {v.excluidos.length} asiento(s) de apertura/regularización/cierre del fichero (normalmente no: la apertura sale del balance).</span>
              </label>
            )}
            {v.importacionPrevia && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
                <span>Reemplazar la importación anterior ({v.importacionPrevia.asientos} asientos del {v.ejercicio}): se anulan y se cargan los de este fichero.</span>
              </label>
            )}
            {!v.excluidos.length && !v.importacionPrevia && <p className="text-slate-500">Los asientos se guardan como definitivos con origen «importación».</p>}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={imp.limpiar} disabled={imp.ocupado} className={botonSecundario}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={imp.ocupado || !v.puedeConfirmar} className={boton}>
              {imp.ocupado ? 'Procesando...' : `Importar ${v.resumen.asientos} asientos`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Balance y PyG de años anteriores (comparativo)
// ---------------------------------------------------------------------------

interface VistaComparativo {
  ejercicio: number;
  parte: 'todo' | 'balance' | 'pyg';
  lectura: Lectura | null;
  cuentas: Array<{ codigo: string; nombre: string; saldo: number }>;
  resumen: { cuentasBalance: number; cuentasPyg: number; ingresos: number; gastos: number; resultado: number };
  existente: { cuentas: number; actualizado: string } | null;
  avisos: string[];
  errores: string[];
}

function ImportarComparativo({ onHecho }: { onHecho: (t: string) => void }) {
  const [ejercicio, setEjercicio] = useState(anioActual - 1);
  const [parte, setParte] = useState<'todo' | 'balance' | 'pyg'>('todo');
  const imp = useImportacion<VistaComparativo>('/puesta-en-marcha/comparativo', { ejercicio, parte });
  const v = imp.vista && !esNecesitaMapeo(imp.vista) ? imp.vista : null;

  const confirmar = async () => {
    if (!v) return;
    const r = await imp.confirmar<VistaComparativo>();
    if (!r) return;
    imp.limpiar();
    onHecho(`Datos comparativos del ${r.ejercicio} guardados (${r.cuentas.length} cuentas). No se ha creado ningún asiento.`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Balance y cuenta de pérdidas y ganancias de un ejercicio anterior, <strong>solo como información</strong>: rellenan la columna del año anterior en las cuentas anuales y
        los informes. No se crea ningún asiento. Puedes subir un fichero con todo o el balance y la PyG por separado.
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">
          Ejercicio
          <input type="number" className={campo} value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value) || anioActual - 1)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          El fichero contiene
          <select className={campo} value={parte} onChange={(e) => setParte(e.target.value as typeof parte)}>
            <option value="todo">Balance y PyG (sumas y saldos)</option>
            <option value="balance">Solo el balance (grupos 1 a 5)</option>
            <option value="pyg">Solo la cuenta de resultados (grupos 6 y 7)</option>
          </select>
        </label>
      </div>

      <SubidaFichero archivo={imp.archivo} ocupado={imp.ocupado} progreso={imp.progreso} texto="Haz clic o arrastra el balance o la PyG" ayuda="Excel o CSV por cuentas o subcuentas, con su saldo" onElegir={imp.elegir} />

      {imp.error && <Mensajes errores={[imp.error]} />}
      {imp.vista && <BloqueMapeo vista={imp.vista} campos={CAMPOS_BALANCE} ajustes={imp.ajustes} setAjustes={imp.setAjustes} conSigno />}

      {v && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato titulo="Cuentas de balance" valor={v.resumen.cuentasBalance} />
            <Dato titulo="Ingresos" valor={eur.format(v.resumen.ingresos)} />
            <Dato titulo="Gastos" valor={eur.format(v.resumen.gastos)} />
            <Dato titulo="Resultado" valor={eur.format(v.resumen.resultado)} tono={v.resumen.resultado >= 0 ? 'bien' : 'mal'} />
          </div>
          <Mensajes
            errores={v.errores}
            avisos={[...v.avisos, ...(v.existente ? [`Ya hay datos del ${v.ejercicio} (${v.existente.cuentas} cuentas): se sustituye la parte que trae este fichero.`] : [])]}
          />
          <details className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-800">Ver las {v.cuentas.length} cuentas</summary>
            <div className="mt-3">
              <TablaLineas lineas={v.cuentas.map((c) => ({ cuenta: c.codigo, nombre: c.nombre, debe: c.saldo > 0 ? c.saldo : 0, haber: c.saldo < 0 ? -c.saldo : 0 }))} />
            </div>
          </details>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={imp.limpiar} disabled={imp.ocupado} className={botonSecundario}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={imp.ocupado || v.errores.length > 0} className={boton}>
              {imp.ocupado ? 'Guardando...' : `Guardar comparativo del ${v.ejercicio}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
