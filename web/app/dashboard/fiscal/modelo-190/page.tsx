'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDownloadConCabeceras, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { ejercicioAnualAPresentar, ejerciciosSeleccionables } from '@/lib/aeatCalendar';
import { CaretLeft, Info, Download } from '@phosphor-icons/react';
import { FormPresentar } from '../components/FormPresentar';
import { AvisosModelo } from '../components/AvisosModelo';

interface Modelo190 {
  id: string;
  ejercicio: number;
  totalBase: number;
  totalRetenido: number;
  estado: 'vigente' | 'presentado';
  casillas: Record<string, any>;
  desgloseTrimestral: Array<{
    numero: number;
    retenciones: Array<{
      tipo: string;
      porcentaje: number;
      base: number;
      cuota: number;
      operaciones: number;
    }>;
    base: number;
    cuota: number;
  }>;
  /** Nominas en borrador, datos que faltan, atrasos sin ejercicio, cuadre con los 111 presentados... */
  avisos?: string[];
  cuadre111?: { total: number; coincide: boolean };
  /** Casillas del resumen del formulario (las del registro de declarante del fichero). */
  formulario?: { titulo: string; fuente: string; resumen: CasillaResumen[] };
  /** Aviso fijo si el ejercicio aun no tiene diseño de registro publicado. */
  avisoDiseno?: string | null;
}

interface CasillaResumen {
  casilla: string;
  rotulo: string;
  valor: number;
  signo: 'N' | ' ';
  tipo: 'numero' | 'importe';
}

/** Registro de perceptor del fichero (GET /nominas/190/:ejercicio/perceptores, permiso de nominas). */
interface Perceptor190 {
  /** Identificador del registro: con el se eligen los perceptores de una complementaria. */
  id: string;
  clave: string;
  subclave: string | null;
  nif: string;
  nombre: string;
  provincia: string | null;
  percepcionIntegra: number;
  retenciones: number;
  valoracionEspecie: number;
  ingresosACuentaEfectuados: number;
  ejercicioDevengo: number | null;
  faltan: string[];
}

/** Ultimo numero identificativo que genero la app y justificante con que se marco presentado. */
interface Numeracion190 {
  ultimo: { numero: string; tipo: 'N' | 'C' | 'S'; emitidoEn: string } | null;
  presentado: boolean;
  justificantePresentado: string | null;
}

/**
 * Datos de la cabecera del fichero que no guarda la app (persona de contacto,
 * tipo de declaracion). El numero identificativo lo pone la app.
 */
interface DatosFichero {
  telefono: string;
  contacto: string;
  email: string;
  tipoDeclaracion: '' | 'C' | 'S';
  numeroAnterior: string;
}
const DATOS_VACIOS: DatosFichero = { telefono: '', contacto: '', email: '', tipoDeclaracion: '', numeroAnterior: '' };

/**
 * Retenciones del ano por tipo: se suman los trimestres por su tipo (los
 * profesionales ya vienen por el tipo real de sus facturas, "Profesionales (15 %)").
 * Sin columna de porcentaje: en el trabajo es un tipo medio que cambia cada
 * trimestre y partiria la misma clase de perceptor en varias filas.
 */
function retencionesPorTipo(desglose: Modelo190['desgloseTrimestral']) {
  const grupos = new Map<string, { tipo: string; base: number; cuota: number }>();
  for (const t of desglose) {
    for (const r of t.retenciones) {
      const g = grupos.get(r.tipo) ?? { tipo: r.tipo, base: 0, cuota: 0 };
      g.base = Math.round((g.base + r.base) * 100) / 100;
      g.cuota = Math.round((g.cuota + r.cuota) * 100) / 100;
      grupos.set(r.tipo, g);
    }
  }
  return Array.from(grupos.values());
}

export default function Modelo190Page() {
  const [modelo, setModelo] = useState<Modelo190 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avisoDescarga, setAvisoDescarga] = useState('');
  const [perceptores, setPerceptores] = useState<Perceptor190[] | null>(null);
  const [datosFichero, setDatosFichero] = useState<DatosFichero>(DATOS_VACIOS);
  const [numeracion, setNumeracion] = useState<Numeracion190 | null>(null);
  // Complementaria: registros que se quedaron fuera de la declaracion anterior.
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [recargaPerceptores, setRecargaPerceptores] = useState(0);
  // Modelo anual: se presenta por el ejercicio anterior.
  const [ejercicio, setEjercicio] = useState(ejercicioAnualAPresentar);

  useEffect(() => {
    const fetchModelo = async () => {
      try {
        setLoading(true);
        setError('');
        setModelo(await apiFetch<Modelo190>(companyPath(`/tax-models/190?ejercicio=${ejercicio}`)));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchModelo();
  }, [ejercicio]);

  // El fichero y el informe por perceptor llevan datos de cada trabajador: solo con permiso de nominas.
  const conNominas = tieneAlgunPermiso(getUser(), ['nominas:read']);

  // Relacion de perceptores (los registros de tipo 2 del fichero).
  useEffect(() => {
    if (!conNominas) return;
    let vivo = true;
    setPerceptores(null);
    apiFetch<{ perceptores: Perceptor190[]; numeracion?: Numeracion190 }>(companyPath(`/nominas/190/${ejercicio}/perceptores`))
      .then((r) => {
        if (!vivo) return;
        setPerceptores(r.perceptores ?? []);
        setNumeracion(r.numeracion ?? null);
        // Si cambian los registros, la seleccion de la complementaria se queda solo con los que siguen.
        setSeleccion((s) => new Set(Array.from(s).filter((id) => (r.perceptores ?? []).some((p) => p.id === id))));
      })
      .catch(() => vivo && setPerceptores([]));
    return () => {
      vivo = false;
    };
  }, [ejercicio, conNominas, recargaPerceptores]);

  // Otro ejercicio: otra declaracion.
  useEffect(() => {
    setSeleccion(new Set());
    setDatosFichero((d) => ({ ...d, tipoDeclaracion: '', numeroAnterior: '' }));
  }, [ejercicio]);

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const [numeroGenerado, setNumeroGenerado] = useState('');

  const descargar = async (ruta: string, nombre: string, init?: RequestInit): Promise<Headers | null> => {
    setAvisoDescarga('');
    setNumeroGenerado('');
    if (!conNominas) {
      setAvisoDescarga('El fichero lleva los datos de cada trabajador: solo lo pueden descargar el administrador y el contable.');
      return null;
    }
    try {
      return await apiDownloadConCabeceras(companyPath(ruta), nombre, init);
    } catch (err) {
      // 409 si el diseno de registro de ese ejercicio aun no esta publicado; 400 si faltan datos.
      setAvisoDescarga(errorMessage(err));
      return null;
    }
  };
  const complementaria = datosFichero.tipoDeclaracion === 'C';
  // Los datos de la persona de contacto van en el cuerpo (POST), no en la URL.
  const descargarAEAT = async () => {
    const cuerpo = { ...datosFichero, ...(complementaria ? { perceptores: Array.from(seleccion) } : {}) };
    const cabeceras = await descargar(`/nominas/190/${ejercicio}/fichero`, `190_${ejercicio}.txt`, { method: 'POST', body: JSON.stringify(cuerpo) });
    const numero = cabeceras?.get('X-Numero-Declaracion');
    if (numero) {
      setNumeroGenerado(numero);
      setRecargaPerceptores((n) => n + 1);
    }
  };
  const campoFichero = (k: keyof DatosFichero) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDatosFichero((d) => ({ ...d, [k]: e.target.value }));
  // Complementaria o sustitutiva: se propone como anterior el justificante con que se marco presentado.
  const cambiarTipo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tipo = e.target.value as DatosFichero['tipoDeclaracion'];
    setDatosFichero((d) => ({ ...d, tipoDeclaracion: tipo, numeroAnterior: tipo && !d.numeroAnterior ? (numeracion?.justificantePresentado ?? '') : d.numeroAnterior }));
  };
  const marcar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const descargarPerceptores = () => descargar(`/nominas/190/${ejercicio}/perceptores?formato=xlsx`, `modelo190_${ejercicio}.xlsx`);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-96 animate-pulse rounded-lg bg-slate-200" />
      </div>
    );
  }

  if (error || !modelo) {
    const isNotAvailable = error?.includes('no encontrado') || error?.includes('404');
    return (
      <div className="space-y-6">
        {/* Header con botón de vuelta */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Modelo 190 – Resumen Anual de Retenciones</h1>
            <p className="mt-2 text-slate-600">Consolidación de los 4 trimestres (111) en resumen anual de retenciones</p>
          </div>
          <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <CaretLeft size={18} />
            Volver
          </Link>
        </div>

        {/* Estado: No disponible */}
        <div className={`rounded-lg border-l-4 p-6 ${isNotAvailable ? 'border-l-amber-500 bg-amber-50' : 'border-l-red-500 bg-red-50'}`}>
          <h3 className={`text-lg font-semibold ${isNotAvailable ? 'text-amber-900' : 'text-red-900'}`}>
            {isNotAvailable ? 'Modelo no disponible' : 'Error al cargar'}
          </h3>
          <p className={`mt-2 ${isNotAvailable ? 'text-amber-800' : 'text-red-800'}`}>
            {isNotAvailable
              ? `No hay datos del Modelo 190 para el ejercicio ${ejercicio}.`
              : error}
          </p>

          {isNotAvailable && (
            <div className={`mt-4 space-y-2 text-sm ${isNotAvailable ? 'text-amber-700' : 'text-red-700'}`}>
              <p><strong>Posibles razones:</strong></p>
              <ul className="list-inside list-disc space-y-1">
                <li>Aún no se han generado los 4 trimestres del Modelo 111 para este ejercicio.</li>
                <li>Los trimestres del Modelo 111 aún no han sido procesados correctamente.</li>
              </ul>
              <p className="mt-3"><strong>Qué hacer:</strong></p>
              <p>
                Dirígete a{' '}
                <Link href="/dashboard/fiscal" className="font-semibold underline hover:no-underline">
                  Modelos Fiscales
                </Link>
                {' '}y genera primero los 4 trimestres del Modelo 111 (Q1, Q2, Q3, Q4) para el ejercicio {ejercicio}.
              </p>
            </div>
          )}

          <Link href="/dashboard/fiscal" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <CaretLeft size={18} />
            Ir a Modelos Fiscales
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con botón de vuelta siempre visible */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Modelo 190 – Resumen Anual de Retenciones</h1>
              <p className="mt-2 text-slate-600">Consolidación de los 4 trimestres (111) en resumen anual de retenciones e ingresos a cuenta</p>
            </div>
            {/* Tooltip informativo */}
            <div className="group relative">
              <button
                type="button"
                className="mt-1 inline-flex items-center justify-center rounded-full bg-indigo-100 p-1.5 text-indigo-600 hover:bg-indigo-200"
                title="Información sobre este modelo"
              >
                <Info size={18} />
              </button>
              <div className="pointer-events-none absolute right-0 top-8 z-50 hidden w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg group-hover:pointer-events-auto group-hover:block">
                <p className="font-semibold text-slate-900">¿Qué es el Modelo 190?</p>
                <p className="mt-2">
                  Es el resumen anual de retenciones e ingresos a cuenta, con un registro por perceptor. Sale de las nóminas y de las facturas de profesionales del año, y se compara con los cuatro 111.
                </p>
              </div>
            </div>
          </div>
        </div>
        <Link
          href="/dashboard/fiscal"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          <CaretLeft size={18} />
          Volver
        </Link>
      </div>

      {/* Período Selector */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Ejercicio</label>
          <select
            value={ejercicio}
            onChange={(e) => setEjercicio(parseInt(e.target.value))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ejerciciosSeleccionables().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      <AvisosModelo avisos={modelo.avisos} ejercicio={modelo.ejercicio} />

      {modelo.avisoDiseno && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Borrador</p>
          <p className="mt-1">{modelo.avisoDiseno}</p>
        </div>
      )}

      {/* Resumen con las casillas del formulario oficial (las del registro de declarante del fichero) */}
      {modelo.formulario && (
        <section className="overflow-hidden rounded-lg border border-slate-300 bg-white">
          <h2 className="bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">Resumen de los datos incluidos en la declaración</h2>
          <div className="space-y-2 p-3">
            {modelo.formulario.resumen.map((r) => (
              <div key={r.casilla} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                <span className="text-sm text-slate-700">{r.rotulo}</span>
                <div className="flex items-center justify-between gap-2 rounded border border-slate-300 bg-white px-2 py-1.5">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs font-semibold text-white">{r.casilla}</span>
                  <span className="font-mono text-sm text-slate-900">
                    {r.tipo === 'numero' ? r.valor.toLocaleString('es-ES') : `${r.signo === 'N' ? 'N ' : ''}${eur.format(Math.abs(r.valor))}`}
                  </span>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Diseño de registro: {modelo.formulario.fuente}.
              {modelo.cuadre111 &&
                ` Suma de los cuatro 111: ${eur.format(modelo.cuadre111.total)} (${modelo.cuadre111.coincide ? 'coincide' : 'no coincide'} con las retenciones del 190).`}
            </p>
          </div>
        </section>
      )}

      {/* Desglose Trimestral */}
      {modelo.desgloseTrimestral && modelo.desgloseTrimestral.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Desglose Trimestral (Modelo 111)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3">Trimestre</th>
                  <th className="text-right py-3">Base Total</th>
                  <th className="text-right py-3">Retenciones Practicadas</th>
                  <th className="text-right py-3">Nº Operaciones</th>
                </tr>
              </thead>
              <tbody>
                {modelo.desgloseTrimestral.map((trimestre) => (
                  <tr key={trimestre.numero} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 font-medium">Q{trimestre.numero}</td>
                    <td className="text-right py-3">{eur.format(trimestre.base)}</td>
                    <td className="text-right py-3 font-medium text-amber-600">{eur.format(trimestre.cuota)}</td>
                    <td className="text-right py-3 text-slate-600">
                      {trimestre.retenciones.reduce((sum, r) => sum + r.operaciones, 0)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td className="py-3">Total Anual</td>
                  <td className="text-right py-3">{eur.format(modelo.totalBase)}</td>
                  <td className="text-right py-3 text-amber-900">{eur.format(modelo.totalRetenido)}</td>
                  <td className="text-right py-3 text-slate-900">
                    {modelo.desgloseTrimestral.reduce(
                      (sum, t) => sum + t.retenciones.reduce((s, r) => s + r.operaciones, 0),
                      0
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Desglose por Tipo de Retención */}
      {modelo.desgloseTrimestral && retencionesPorTipo(modelo.desgloseTrimestral).length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Retenciones por Tipo (Total Anual)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3">Tipo de Retención</th>
                  <th className="text-right py-3">Base Anual</th>
                  <th className="text-right py-3">Retención Anual</th>
                </tr>
              </thead>
              <tbody>
                {retencionesPorTipo(modelo.desgloseTrimestral).map((ret) => (
                  <tr key={ret.tipo} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3">{ret.tipo}</td>
                    <td className="text-right py-3">{eur.format(ret.base)}</td>
                    <td className="text-right py-3 font-medium text-amber-600">{eur.format(ret.cuota)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Los trimestres van por fecha de pago, como el 111. La base anual de arriba suma además las dietas y las indemnizaciones exentas (registros L del 190), que no tienen retención.
          </p>
        </div>
      )}

      {/* Relacion de perceptores: los registros de tipo 2 del fichero (con permiso de nominas) */}
      {conNominas && perceptores && perceptores.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          <h3 className="mb-3 font-semibold text-slate-900">Relación de perceptores</h3>
          {complementaria && (
            <p className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
              Complementaria: marca solo los perceptores que se quedaron fuera de la declaración anterior. El fichero llevará esos registros y nada más ({seleccion.size} marcado{seleccion.size === 1 ? '' : 's'}).
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  {complementaria && (
                    <th className="py-2 pr-2 font-medium">
                      <span className="sr-only">Incluir en la complementaria</span>
                    </th>
                  )}
                  <th className="py-2 font-medium">NIF</th>
                  <th className="py-2 font-medium">Apellidos y nombre o razón social</th>
                  <th className="py-2 font-medium">Prov.</th>
                  <th className="py-2 font-medium">Clave</th>
                  <th className="py-2 font-medium">Subclave</th>
                  <th className="py-2 text-right font-medium">Percepción íntegra</th>
                  <th className="py-2 text-right font-medium">Retenciones</th>
                  <th className="py-2 text-right font-medium">Especie</th>
                  <th className="py-2 text-right font-medium">Ingresos a cuenta</th>
                  <th className="py-2 text-right font-medium">Devengo</th>
                </tr>
              </thead>
              <tbody>
                {perceptores.map((p, i) => (
                  <tr key={p.id ?? `${p.nif}-${p.clave}-${p.subclave ?? ''}-${p.ejercicioDevengo ?? ''}-${i}`} className={`border-b border-slate-100 ${complementaria && seleccion.has(p.id) ? 'bg-indigo-50' : ''}`}>
                    {complementaria && (
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={seleccion.has(p.id)}
                          onChange={() => marcar(p.id)}
                          aria-label={`Incluir a ${p.nombre} (clave ${p.clave}${p.subclave ?? ''}) en la complementaria`}
                        />
                      </td>
                    )}
                    <td className="py-2 font-mono">{p.nif}</td>
                    <td className="py-2">
                      {p.nombre}
                      {p.faltan.length > 0 && <span className="block text-xs text-amber-700">Falta: {p.faltan.join(', ')}</span>}
                    </td>
                    <td className="py-2 font-mono">{p.provincia ?? '—'}</td>
                    <td className="py-2 font-mono">{p.clave}</td>
                    <td className="py-2 font-mono">{p.subclave ?? ''}</td>
                    <td className="py-2 text-right font-mono">{`${p.percepcionIntegra < 0 ? 'N ' : ''}${eur.format(Math.abs(p.percepcionIntegra))}`}</td>
                    <td className="py-2 text-right font-mono">{eur.format(p.retenciones)}</td>
                    <td className="py-2 text-right font-mono">{eur.format(p.valoracionEspecie)}</td>
                    <td className="py-2 text-right font-mono">{eur.format(p.ingresosACuentaEfectuados)}</td>
                    <td className="py-2 text-right font-mono">{p.ejercicioDevengo ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">N delante del importe: reintegro de lo cobrado de más en un ejercicio anterior.</p>
        </section>
      )}

      {/* Sección de ayuda */}
      <div className="space-y-4">
        <div className="rounded-lg border-l-4 border-l-indigo-500 bg-indigo-50 p-4">
          <div className="flex gap-3">
            <Info size={18} className="mt-0.5 flex-shrink-0 text-indigo-600" />
            <div className="text-sm text-indigo-900">
              <p className="font-semibold">¿Cómo funciona este resumen?</p>
              <p className="mt-1">
                El 190 suma, por perceptor, las nóminas (clave A y rentas exentas L) y las facturas de profesionales (clave G) pagadas en el año.
                Los alquileres no van aquí: van al 115 y a su resumen anual, el 180.
              </p>
            </div>
          </div>
        </div>

        {/* Próximos pasos */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Próximos pasos</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            <li>✓ Revisa los datos del desglose trimestral para verificar que son correctos.</li>
            <li>✓ Consulta el desglose por tipo de retención para ver el detalle de cada tipo.</li>
            <li>✓ Consulta las casillas AEAT para ver el detalle técnico de tu declaración.</li>
            <li>✓ Una vez verificado, marca el modelo como presentado cuando lo hayas declarado a Hacienda.</li>
          </ul>
        </div>
      </div>

      {/* Acciones Finales */}
      <div className="space-y-4">
        {/* Botón de Descarga AEAT (tambien presentado: complementaria o sustitutiva) */}
        {(modelo.estado === 'vigente' || modelo.estado === 'presentado') && (
          <>
            {modelo.estado === 'presentado' && conNominas && (
              <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                El 190 de {ejercicio} ya está presentado. Para añadir perceptores que se quedaron fuera, descarga una complementaria; para rehacerlo entero, una sustitutiva.
              </p>
            )}
            {conNominas && (
              <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
                <legend className="px-1 text-sm font-semibold text-slate-900">Datos del fichero</legend>
                <label className="text-sm text-slate-700">
                  Teléfono de contacto
                  <input value={datosFichero.telefono} onChange={campoFichero('telefono')} inputMode="tel" maxLength={9} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" placeholder="9 cifras" />
                </label>
                <label className="text-sm text-slate-700">
                  Apellidos y nombre de la persona de contacto
                  <input value={datosFichero.contacto} onChange={campoFichero('contacto')} maxLength={40} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  Correo electrónico (opcional)
                  <input value={datosFichero.email} onChange={campoFichero('email')} type="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-slate-700">
                  Tipo de declaración
                  <select value={datosFichero.tipoDeclaracion} onChange={cambiarTipo} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Normal</option>
                    <option value="C">Complementaria (solo los perceptores que faltaron)</option>
                    <option value="S">Sustitutiva (reemplaza a la anterior)</option>
                  </select>
                </label>
                {datosFichero.tipoDeclaracion && (
                  <label className="text-sm text-slate-700">
                    Número de la declaración anterior
                    <input
                      value={datosFichero.numeroAnterior}
                      onChange={(e) => setDatosFichero((d) => ({ ...d, numeroAnterior: e.target.value.replace(/\D/g, '') }))}
                      inputMode="numeric"
                      maxLength={13}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                      placeholder="13 cifras, empieza por 190"
                    />
                    <span className="mt-1 block text-xs text-slate-500">El del justificante de presentación de la declaración que complementas o sustituyes.</span>
                  </label>
                )}
                <p className="text-xs text-slate-500 sm:col-span-2">
                  El número identificativo de esta declaración lo pone la app en el fichero y no se repite en el ejercicio.
                  {numeracion?.ultimo && ` Último generado: ${numeracion.ultimo.numero}.`}
                </p>
              </fieldset>
            )}
            <button
              onClick={descargarAEAT}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition"
            >
              <Download size={18} />
              Descargar Fichero AEAT (TXT)
            </button>
            {conNominas && (
              <button
                onClick={descargarPerceptores}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <Download size={18} />
                Informe por perceptor (Excel)
              </button>
            )}
            {numeroGenerado && (
              <p role="status" className="mt-2 text-sm text-emerald-800">
                Fichero descargado con el número identificativo {numeroGenerado}. Al presentarlo, guarda el justificante: si luego hay que complementarlo o sustituirlo, te pedirá su número.
              </p>
            )}
            {avisoDescarga && (
              <p role="status" className="mt-2 text-sm text-amber-700">{avisoDescarga}</p>
            )}
          </>
        )}

        {/* Formulario de Presentación */}
        {modelo.estado === 'vigente' && <FormPresentar codigo="190" ejercicio={ejercicio} />}
      </div>
    </div>
  );
}
