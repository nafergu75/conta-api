'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, DownloadSimple, FileXls } from '@phosphor-icons/react';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  AJUSTES_INICIALES,
  esNecesitaMapeo,
  formulario,
  MapeoColumnas,
  Mensajes,
  SubidaFichero,
  subirPorTrozos,
  TAM_DIRECTO,
  TAM_MAXIMO,
  type AjustesLectura,
  type Columna,
} from '../../contabilidad/importacion';
import {
  pagina,
  Alerta,
  boton,
  botonSecundario,
  CabeceraNominas,
  campo,
  Dato,
  etiqueta,
  eur,
  MarcaCuadre,
  mesCapital,
  MESES,
  num,
  periodoTexto,
  permisosNominas,
  SinPermiso,
  textoTipo,
  type Cuadre,
  type Importes,
  type Totales,
} from '../comun';

/**
 * Importar el Excel de nominas que manda la gestoria cada mes (A3, Nominasol,
 * Sage...): se reconocen las columnas por su titulo, se puede corregir el
 * mapeo y se ve el cuadre de cada trabajador antes de guardar nada. El
 * servidor no guarda estado: la vista previa se recalcula con cada cambio.
 */

interface FilaVista extends Importes {
  fila: number;
  nif: string;
  nombre: string;
  apellidos: string;
  ejercicio: number | null;
  mes: number | null;
  tipo: string;
  naf: string | null;
  porcentajeIrpf: number | null;
  cuadre: Cuadre;
  errores: string[];
  avisos: string[];
  empleado: { id: string | null; nombreCompleto: string; nuevo: boolean };
  accion: 'crear' | 'sustituir' | 'error';
}

interface VistaImportacion {
  lectura: { formato: string; filaCabecera: number; columnas: Columna[]; mapeo: Record<string, number>; filasIgnoradas: number } | null;
  campos: Record<string, string>;
  filas: FilaVista[];
  resumen: {
    filas: number;
    validas: number;
    conErrores: number;
    empleadosNuevos: number;
    empleadosExistentes: number;
    sustituyen: number;
    periodos: Array<{ ejercicio: number; mes: number; nominas: number; estadoPeriodo: string }>;
    totales: Totales;
  };
  puedeConfirmar: boolean;
  avisos: string[];
}

interface NecesitaMapeoNominas {
  necesitaMapeo: true;
  mensaje: string;
  columnas: Columna[];
  mapeo?: Record<string, number>;
  campos: Record<string, string>;
}

interface Resultado {
  nominasCreadas: number;
  nominasSustituidas: number;
  empleadosCreados: number;
  periodos: Array<{ ejercicio: number; mes: number }>;
  avisos: string[];
  contabilizacion?: Array<{ ejercicio: number; mes: number; contabilizadas: number; asientos: Array<{ numero: string }> }>;
}

/** Campos de la fila que acepta el servidor al importar filas ya revisadas. */
const CAMPOS_FILA = [
  'fila',
  'nif',
  'nombre',
  'apellidos',
  'naf',
  'ejercicio',
  'mes',
  'tipo',
  'porcentajeIrpf',
  'brutoDinerario',
  'dietasExentas',
  'especieValoracion',
  'ingresoACuenta',
  'ingresoACuentaRepercutido',
  'indemnizacionExenta',
  'indemnizacionSujeta',
  'ssTrabajador',
  'irpf',
  'anticipos',
  'embargos',
  'otrasDeducciones',
  'liquido',
  'ssEmpresa',
] as const;

export default function ImportarNominasPage() {
  return (
    <Suspense fallback={<p className={`${pagina} text-sm text-slate-500`}>Cargando...</p>}>
      <Importar />
    </Suspense>
  );
}

function Importar() {
  const params = useSearchParams();
  const { escribir } = permisosNominas();
  const hoy = new Date();
  const [mesFijo, setMesFijo] = useState(() => ({
    activo: false,
    ejercicio: Number(params.get('ejercicio')) || hoy.getFullYear(),
    mes: Number(params.get('mes')) || hoy.getMonth() + 1,
  }));
  const [especie, setEspecie] = useState<'auto' | 'si' | 'no'>('auto');
  const [archivo, setArchivo] = useState<File | null>(null);
  // Lo que se manda: el fichero si es pequeno, o el id de su subida por trozos.
  const [fuente, setFuente] = useState<File | string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState<AjustesLectura>(AJUSTES_INICIALES);
  const [vista, setVista] = useState<VistaImportacion | NecesitaMapeoNominas | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [contabilizar, setContabilizar] = useState(false);
  const [soloErrores, setSoloErrores] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const eleccion = useRef(0);

  const opciones = useMemo(
    () => ({ ...(mesFijo.activo ? { ejercicio: mesFijo.ejercicio, mes: mesFijo.mes } : {}), brutoIncluyeEspecie: especie }),
    [mesFijo, especie],
  );
  const clave = JSON.stringify(opciones);

  // Vista previa: con cada cambio de fichero, mapeo u opciones (no guarda nada).
  useEffect(() => {
    if (!fuente) return;
    let vigente = true;
    setOcupado(true);
    setError('');
    apiFetch<VistaImportacion | NecesitaMapeoNominas>(companyPath('/nominas/importar/vista-previa'), { method: 'POST', body: formulario(fuente, ajustes, JSON.parse(clave)) })
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
  }, [fuente, ajustes, clave]);

  const descartarSubida = (f: File | string | null) => {
    if (typeof f === 'string') apiFetch(companyPath(`/nominas/importar/subidas/${encodeURIComponent(f)}`), { method: 'DELETE' }).catch(() => undefined);
  };

  const elegir = (f: File) => {
    const n = ++eleccion.current;
    descartarSubida(fuente);
    setArchivo(f);
    setFuente(null);
    setAjustes(AJUSTES_INICIALES);
    setVista(null);
    setResultado(null);
    setError('');
    setSoloErrores(false);
    if (f.size > TAM_MAXIMO) {
      setError(`El fichero pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${TAM_MAXIMO / 1024 / 1024} MB.`);
      return;
    }
    if (f.size <= TAM_DIRECTO) {
      setFuente(f);
      return;
    }
    setProgreso(0);
    subirPorTrozos(f, (p) => n === eleccion.current && setProgreso(p), '/nominas/importar/subidas')
      .then((id) => n === eleccion.current && setFuente(id))
      .catch((e) => n === eleccion.current && setError(`No se pudo subir el fichero: ${errorMessage(e)}`))
      .finally(() => n === eleccion.current && setProgreso(null));
  };

  const limpiar = () => {
    eleccion.current++;
    descartarSubida(fuente);
    setArchivo(null);
    setFuente(null);
    setProgreso(null);
    setVista(null);
    setAjustes(AJUSTES_INICIALES);
    setError('');
  };

  const v = vista && !esNecesitaMapeo(vista) ? (vista as VistaImportacion) : null;
  const mapeo = vista && esNecesitaMapeo(vista) ? (vista as NecesitaMapeoNominas) : null;
  const campos = Object.entries((v ?? mapeo)?.campos ?? {}) as Array<[string, string]>;
  const validas = v ? v.filas.filter((f) => f.accion !== 'error') : [];
  const cerrados = v ? v.resumen.periodos.filter((p) => p.estadoPeriodo !== 'abierto') : [];
  const conEspecie = v ? v.filas.some((f) => f.especieValoracion > 0) : false;
  const filasVisibles = v ? (soloErrores ? v.filas.filter((f) => f.errores.length) : v.filas) : [];

  const importar = async (soloValidas: boolean) => {
    if (!fuente || !v) return;
    setOcupado(true);
    setError('');
    try {
      const r = soloValidas
        ? await apiFetch<Resultado>(companyPath('/nominas/importar'), {
            method: 'POST',
            body: JSON.stringify({
              filas: validas.map((f) => Object.fromEntries(CAMPOS_FILA.map((k) => [k, f[k]]))),
              ...(contabilizar ? { contabilizar: true } : {}),
            }),
          })
        : await apiFetch<Resultado>(companyPath('/nominas/importar'), { method: 'POST', body: formulario(fuente, ajustes, { ...opciones, contabilizar }) });
      if (soloValidas) descartarSubida(fuente);
      eleccion.current++;
      setResultado(r);
      setArchivo(null);
      setFuente(null);
      setVista(null);
      setAjustes(AJUSTES_INICIALES);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const plantilla = async () => {
    try {
      await apiDownload(companyPath('/nominas/plantilla'), 'plantilla-nominas.xlsx');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!escribir) {
    return (
      <div className={pagina}>
        <CabeceraNominas titulo="Importar nóminas" subtitulo="El Excel que manda la gestoría cada mes." />
        <SinPermiso />
      </div>
    );
  }

  const paso = resultado ? 3 : v ? 2 : 1;

  return (
    <div className={pagina}>
      <CabeceraNominas
        titulo="Importar nóminas"
        subtitulo="Sube el Excel de la gestoría: una fila por trabajador. Antes de guardar nada verás el cuadre de cada nómina."
        acciones={
          <button type="button" onClick={plantilla} className={botonSecundario}>
            <DownloadSimple size={16} /> Plantilla de ejemplo
          </button>
        }
      />

      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pasos">
        {['Subir el Excel', 'Revisar', 'Hecho'].map((t, i) => (
          <li
            key={t}
            aria-current={paso === i + 1 ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${paso === i + 1 ? 'border-blue-200 bg-blue-50 font-medium text-blue-700' : paso > i + 1 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}
          >
            {i + 1}. {t}
          </li>
        ))}
      </ol>

      {resultado && <ResultadoImportacion r={resultado} onOtro={() => setResultado(null)} />}

      {!resultado && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          <SubidaFichero
            archivo={archivo}
            ocupado={ocupado}
            progreso={progreso}
            texto="Haz clic o arrastra el Excel de nóminas"
            ayuda="Excel (.xlsx, .xls) o CSV con una fila por trabajador"
            onElegir={elegir}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className={etiqueta}>Mes de las nóminas</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="mes-fijo" checked={!mesFijo.activo} onChange={() => setMesFijo({ ...mesFijo, activo: false })} className="h-4 w-4" />
                El que diga el fichero (columna Mes o el título)
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="mes-fijo" checked={mesFijo.activo} onChange={() => setMesFijo({ ...mesFijo, activo: true })} className="h-4 w-4" />
                Todas son de
                <select aria-label="Mes" value={mesFijo.mes} onChange={(e) => setMesFijo({ ...mesFijo, activo: true, mes: Number(e.target.value) })} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {mesCapital(i + 1)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Ejercicio"
                  type="number"
                  value={mesFijo.ejercicio}
                  onChange={(e) => setMesFijo({ ...mesFijo, activo: true, ejercicio: Number(e.target.value) || mesFijo.ejercicio })}
                  className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                />
              </label>
            </fieldset>
            <div>
              <label htmlFor="imp-especie" className={etiqueta}>
                El bruto del fichero, ¿incluye la retribución en especie?
              </label>
              <select id="imp-especie" value={especie} onChange={(e) => setEspecie(e.target.value as 'auto' | 'si' | 'no')} className={campo}>
                <option value="auto">Detectarlo con el cuadre de cada fila</option>
                <option value="si">Sí, es el total devengado (dinero + especie)</option>
                <option value="no">No, es solo lo que se cobra en dinero</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">Solo importa si algún trabajador tiene especie (seguro médico, coche...).</p>
            </div>
          </div>

          {error && <Alerta tipo="error">{error}</Alerta>}

          {mapeo && (
            <div className="space-y-3">
              <Mensajes avisos={[mapeo.mensaje]} />
              <MapeoColumnas
                campos={campos}
                columnas={mapeo.columnas}
                mapeoDetectado={mapeo.mapeo ?? {}}
                filaDetectada={ajustes.filaCabecera ?? 1}
                ajustes={ajustes}
                abierto
                onCambiar={setAjustes}
              />
            </div>
          )}

          {v && (
            <div className="space-y-4">
              {v.lectura && (
                <MapeoColumnas
                  campos={campos}
                  columnas={v.lectura.columnas}
                  mapeoDetectado={v.lectura.mapeo}
                  filaDetectada={v.lectura.filaCabecera}
                  ajustes={ajustes}
                  // Plegada si se reconocio sola; abierta si se esta mapeando a mano, para no cerrarse a mitad.
                  abierto={ajustes.mapeo !== undefined || ajustes.filaCabecera !== undefined}
                  onCambiar={setAjustes}
                />
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Dato titulo="Nóminas" valor={v.resumen.filas} nota={v.resumen.conErrores ? `${v.resumen.conErrores} con errores` : 'todas cuadran'} tono={v.resumen.conErrores ? 'mal' : 'bien'} />
                <Dato
                  titulo="Trabajadores"
                  valor={v.resumen.empleadosNuevos + v.resumen.empleadosExistentes}
                  nota={v.resumen.empleadosNuevos ? `${v.resumen.empleadosNuevos} ${v.resumen.empleadosNuevos === 1 ? 'nuevo, se dará de alta' : 'nuevos, se darán de alta'}` : 'todos dados de alta'}
                />
                <Dato titulo="Líquido" valor={eur.format(v.resumen.totales.liquido)} nota={`Bruto ${eur.format(v.resumen.totales.brutoDinerario)}`} />
                <Dato titulo="Coste empresa" valor={eur.format(v.resumen.totales.costeEmpresa)} nota={`SS empresa ${eur.format(v.resumen.totales.ssEmpresa)}`} />
              </div>
              {v.resumen.periodos.length > 0 && (
                <p className="text-sm text-slate-600">
                  {v.resumen.periodos.map((p) => `${mesCapital(p.mes)} de ${p.ejercicio}: ${p.nominas} ${p.nominas === 1 ? 'nómina' : 'nóminas'}${p.estadoPeriodo !== 'abierto' ? ` (periodo ${p.estadoPeriodo})` : ''}`).join(' · ')}
                  {v.resumen.sustituyen > 0 && ` · ${v.resumen.sustituyen} sustituyen a nóminas en borrador ya registradas`}
                  {v.lectura && v.lectura.filasIgnoradas > 0 && ` · ${v.lectura.filasIgnoradas} ${v.lectura.filasIgnoradas === 1 ? 'fila de totales o vacía ignorada' : 'filas de totales o vacías ignoradas'}`}
                </p>
              )}
              <Mensajes avisos={v.avisos} />

              {v.resumen.conErrores > 0 && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Ver solo las filas con errores
                </label>
              )}

              <div className="relative overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Fila</th>
                      <th className="px-3 py-2 font-medium">Trabajador</th>
                      <th className="px-3 py-2 font-medium">Mes</th>
                      <th className="px-3 py-2 text-right font-medium">Bruto</th>
                      {conEspecie && <th className="px-3 py-2 text-right font-medium">Especie</th>}
                      <th className="px-3 py-2 text-right font-medium">SS trab.</th>
                      <th className="px-3 py-2 text-right font-medium">IRPF</th>
                      <th className="px-3 py-2 text-right font-medium" title="Anticipos, embargos y otras deducciones">
                        Otras ded.
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Líquido</th>
                      <th className="px-3 py-2 text-right font-medium">SS emp.</th>
                      <th className="px-3 py-2 text-center font-medium">Cuadre</th>
                      <th className="px-3 py-2 font-medium">Se hará</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasVisibles.map((f) => {
                      const mal = f.errores.length > 0;
                      const columnas = conEspecie ? 12 : 11;
                      return (
                        <FilaImportada key={f.fila} f={f} mal={mal} conEspecie={conEspecie} columnas={columnas} />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={contabilizar} disabled={cerrados.length > 0} onChange={(e) => setContabilizar(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                  <span>
                    Contabilizarlas ahora (un asiento por trabajador)
                    <span className="block text-xs text-slate-500">
                      {cerrados.length > 0 ? 'No se puede: el periodo está cerrado.' : 'Si no, quedan en borrador y las contabilizas desde Nóminas del mes después de revisarlas.'}
                    </span>
                  </span>
                </label>
                {v.puedeConfirmar ? (
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={limpiar} disabled={ocupado} className={botonSecundario}>
                      Cancelar
                    </button>
                    <button type="button" onClick={() => importar(false)} disabled={ocupado} className={boton}>
                      {ocupado ? 'Importando...' : `Importar ${v.resumen.filas} ${v.resumen.filas === 1 ? 'nómina' : 'nóminas'}`}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-red-700">
                      {v.resumen.conErrores} {v.resumen.conErrores === 1 ? 'fila tiene errores' : 'filas tienen errores'} (en rojo). Corrige el Excel y vuelve a subirlo
                      {validas.length > 0 ? ', o importa solo las correctas y añade el resto después.' : '.'}
                    </p>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button type="button" onClick={limpiar} disabled={ocupado} className={botonSecundario}>
                        Cancelar
                      </button>
                      {validas.length > 0 && (
                        <button type="button" onClick={() => importar(true)} disabled={ocupado} className={boton}>
                          {ocupado ? 'Importando...' : validas.length === 1 ? 'Importar solo la fila correcta' : `Importar solo las ${validas.length} filas correctas`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!vista && !archivo && (
            <div className="space-y-1 text-xs text-slate-500">
              <p className="font-medium text-slate-600">Columnas que se reconocen (con los nombres habituales de A3, Nominasol o Sage, en cualquier orden):</p>
              <p>
                Trabajador · Apellidos · NIF/DNI · Nº afiliación SS · Mes · Tipo (ordinaria, extra...) · Total devengado o bruto · Retribución en especie · Ingreso a cuenta · Dietas ·
                Indemnización · SS trabajador · IRPF · % IRPF · Embargos · Anticipos · Otras deducciones · Líquido a percibir · SS empresa · Coste total.
              </p>
              <p>Hacen falta como mínimo el NIF, el bruto y el líquido. Las filas de totales se saltan y los trabajadores nuevos se dan de alta por su NIF.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilaImportada({ f, mal, conEspecie, columnas }: { f: FilaVista; mal: boolean; conEspecie: boolean; columnas: number }) {
  const otras = Math.round((f.anticipos + f.embargos + f.otrasDeducciones) * 100) / 100;
  const nombre = f.empleado.nombreCompleto || [f.nombre, f.apellidos].filter(Boolean).join(' ') || '—';
  const fondo = mal ? 'bg-red-50' : '';
  return (
    <>
      <tr className={`border-t border-slate-100 ${fondo}`}>
        <td className="px-3 py-2 tabular-nums text-slate-500">{f.fila}</td>
        <td className="px-3 py-2">
          <span className="font-medium text-slate-900">{nombre}</span>
          {f.empleado.nuevo && f.nif && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">nuevo</span>}
          {f.tipo !== 'ORDINARIA' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{textoTipo(f.tipo).toLowerCase()}</span>}
          <span className="block font-mono text-xs text-slate-500">{f.nif || 'sin NIF'}</span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{f.mes && f.ejercicio ? `${String(f.mes).padStart(2, '0')}/${f.ejercicio}` : '—'}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(f.brutoDinerario)}</td>
        {conEspecie && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{f.especieValoracion ? num.format(f.especieValoracion) : ''}</td>}
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(f.ssTrabajador)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(f.irpf)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{otras ? num.format(otras) : ''}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-slate-900">{num.format(f.liquido)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(f.ssEmpresa)}</td>
        <td className="px-3 py-2 text-center">
          <MarcaCuadre cuadre={f.cuadre} />
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          {f.accion === 'error' ? (
            <span className="text-xs font-medium text-red-700">No se importa</span>
          ) : f.accion === 'sustituir' ? (
            <span className="text-xs font-medium text-amber-700">Sustituye</span>
          ) : (
            <span className="text-xs font-medium text-emerald-700">Crear</span>
          )}
        </td>
      </tr>
      {(f.errores.length > 0 || f.avisos.length > 0) && (
        <tr className={fondo}>
          <td />
          <td colSpan={columnas - 1} className="px-3 pb-2 pt-0 text-xs">
            {f.errores.map((e) => (
              <p key={e} className="text-red-700">
                {e}
              </p>
            ))}
            {f.avisos.map((a) => (
              <p key={a} className="text-amber-700">
                {a}
              </p>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

function ResultadoImportacion({ r, onOtro }: { r: Resultado; onOtro: () => void }) {
  const asientos = (r.contabilizacion ?? []).reduce((a, c) => a + c.contabilizadas, 0);
  return (
    <div className="space-y-4 rounded-lg border border-emerald-200 bg-white p-4 md:p-6">
      <p className="flex items-start gap-2 text-slate-900">
        <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" />
        <span>
          <strong>
            {r.nominasCreadas + r.nominasSustituidas} {r.nominasCreadas + r.nominasSustituidas === 1 ? 'nómina importada' : 'nóminas importadas'}
          </strong>
          {r.nominasSustituidas > 0 && ` (${r.nominasSustituidas} sustituyen a las que había en borrador)`}
          {r.empleadosCreados > 0 && `. ${r.empleadosCreados} ${r.empleadosCreados === 1 ? 'trabajador nuevo dado de alta' : 'trabajadores nuevos dados de alta'}`}
          {asientos > 0
            ? `. ${asientos} ${asientos === 1 ? 'asiento creado' : 'asientos creados'}.`
            : r.nominasCreadas + r.nominasSustituidas === 1
              ? '. Queda en borrador hasta que la contabilices.'
              : '. Quedan en borrador hasta que las contabilices.'}
        </span>
      </p>
      <Mensajes avisos={r.avisos} />
      <div className="flex flex-wrap gap-2">
        {r.periodos.map((p) => (
          <Link key={`${p.ejercicio}-${p.mes}`} href={`/dashboard/nominas?ejercicio=${p.ejercicio}&mes=${p.mes}`} className={boton}>
            Ver las nóminas de {periodoTexto(p.ejercicio, p.mes)}
          </Link>
        ))}
        <button type="button" onClick={onOtro} className={botonSecundario}>
          <FileXls size={16} /> Importar otro fichero
        </button>
      </div>
    </div>
  );
}
