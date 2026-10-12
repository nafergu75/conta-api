'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { CaretLeft } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';
import SelectorAnio from '@/components/SelectorAnio';
import { usePeriodoTrimestral } from '../components/periodoModelo';
import { CargandoModelo, ErrorModelo } from '../components/BorradorAeat';
import {
  AvisosBorrador,
  CamposRegistro,
  DescargarFichero,
  ESTADO_MODELO,
  Seccion,
  TablaRegistros,
  type CampoLeido,
  type Columna,
} from '../components/RegistroAeat';
import { Declaraciones } from '../components/Declaraciones';

/**
 * Modelo 349 (operaciones intracomunitarias): borrador con el diseño de
 * registro de la AEAT. Las casillas y las líneas salen del fichero que se
 * descarga, leído campo a campo.
 */

interface Movimiento {
  id?: string;
  factura: string;
  tipo: 'venta' | 'compra';
  fecha: string;
  nifIva: string;
  nombre: string;
  clave: string;
  base: number;
  rectifica?: { ejercicio: number; periodo: string };
}

interface Borrador349 {
  ejercicio: number;
  periodo: string;
  estado: string;
  /** «Presentado · complementaria en preparación» cuando hay una presentada y otra en curso (el estado de la fila dice 'vigente'). */
  estadoTexto?: string | null;
  /** Tipo y anterior los pone el historial de declaraciones; cambioPeriodicidad, la persona. */
  opciones: { tipoDeclaracion: 'C' | 'S' | null; declaracionAnterior: string | null; cambioPeriodicidad: boolean };
  /** Número identificativo; null hasta la primera descarga o la presentación. */
  numeroDeclaracion: string | null;
  errores: string[];
  avisos: string[];
  pantalla: {
    declarante: CampoLeido[];
    columnasOperador: Columna[];
    operadores: Array<Record<string, string | number>>;
    columnasRectificacion: Columna[];
    rectificaciones: Array<Record<string, string | number>>;
  } | null;
  movimientos: Movimiento[];
}

const PERIODOS = ['1T', '2T', '3T', '4T', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const NOMBRE_PERIODO: Record<string, string> = {
  '1T': '1.er trimestre',
  '2T': '2.º trimestre',
  '3T': '3.er trimestre',
  '4T': '4.º trimestre',
};
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const etiquetaPeriodo = (p: string) => NOMBRE_PERIODO[p] ?? MESES[Number(p) - 1] ?? p;
const CLAVES: Record<string, string> = {
  E: 'Entregas de bienes',
  A: 'Compras de bienes',
  S: 'Servicios prestados',
  I: 'Servicios recibidos',
  T: 'Triangulares',
  M: 'Entregas tras importación exenta',
  H: 'Entregas tras importación exenta (representante fiscal)',
  R: 'Envíos en consigna',
  D: 'Devoluciones de consigna',
  C: 'Sustitución en consigna',
};

export default function Modelo349Page() {
  return (
    <Suspense fallback={<CargandoModelo />}>
      <Modelo349 />
    </Suspense>
  );
}

function Modelo349() {
  // Periodo de la URL o el trimestre que toca presentar, nunca antes del primer año de la empresa.
  const { ejercicio, setEjercicio, periodo, setPeriodo, anios, listo } = usePeriodoTrimestral();
  const [b, setB] = useState<Borrador349 | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [cambio, setCambio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!listo) return;
    let vivo = true;
    setCargando(true);
    setError('');
    apiFetch<Borrador349>(companyPath(`/tax-models/349?ejercicio=${ejercicio}&periodo=${periodo}`))
      .then((r) => {
        if (!vivo) return;
        setB(r);
        setCambio(r.opciones.cambioPeriodicidad);
      })
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [listo, ejercicio, periodo, recarga]);

  const guardarOpciones = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    try {
      const r = await apiFetch<Borrador349>(companyPath('/tax-models/349/opciones'), {
        method: 'PUT',
        body: JSON.stringify({ ejercicio, periodo, cambioPeriodicidad: cambio }),
      });
      setB(r);
      setMensaje('Guardado.');
    } catch (err) {
      setMensaje(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarClave = async (m: Movimiento, clave: string) => {
    if (!m.id) return;
    try {
      await apiFetch(companyPath(`/tax-models/349/compras/${m.id}/clave`), { method: 'PUT', body: JSON.stringify({ clave: clave || null }) });
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const bloqueado = !b || b.errores.length > 0 || !b.pantalla;
  const presentado = b?.estado === 'presentado';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/fiscal" className="mb-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Modelo 349 – Operaciones intracomunitarias</h1>
        <p className="mt-2 text-slate-600">
          Ventas y compras con empresas de otros países de la UE, por operador y clave. Lo que ves es lo que lleva el fichero para la sede de la AEAT.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <SelectorAnio id="m349-ej" valor={ejercicio} anios={anios} onChange={(a) => a !== null && setEjercicio(a)} />
        <div>
          <label htmlFor="m349-pe" className="block text-sm font-medium text-slate-700">
            Periodo
          </label>
          <select id="m349-pe" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                {etiquetaPeriodo(p)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Mensual solo si las entregas y servicios pasan de 50.000 € en el trimestre.</p>
        </div>
      </div>

      {cargando && !b ? (
        <CargandoModelo />
      ) : error ? (
        <ErrorModelo mensaje={error} />
      ) : (
        b && (
          <div className={`space-y-6 ${cargando ? 'opacity-60' : ''}`}>
            <AvisosBorrador errores={b.errores} avisos={b.avisos} />

            {b.pantalla && (
              <>
                <Seccion
                  titulo={`Declarante – ${etiquetaPeriodo(b.periodo)} de ${b.ejercicio}`}
                  extra={<span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">{b.estadoTexto ?? ESTADO_MODELO[b.estado] ?? b.estado}</span>}
                >
                  <CamposRegistro campos={b.pantalla.declarante} />
                </Seccion>

                <Seccion titulo="Operadores intracomunitarios">
                  <TablaRegistros
                    columnas={b.pantalla.columnasOperador}
                    filas={b.pantalla.operadores}
                    vacio="No hay operaciones intracomunitarias en el periodo."
                    principales={['nombreOperador', 'clave']}
                  />
                </Seccion>

                <Seccion titulo="Rectificaciones de periodos anteriores">
                  <TablaRegistros
                    columnas={b.pantalla.columnasRectificacion}
                    filas={b.pantalla.rectificaciones}
                    vacio="No hay rectificaciones."
                    principales={['nombreOperador', 'clave']}
                  />
                </Seccion>
              </>
            )}

            <Seccion titulo="Facturas que entran">
              {b.movimientos.length === 0 ? (
                <p className="text-sm text-slate-500">Ninguna factura del periodo va al 349.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-600">
                        <th className="px-2 py-2 font-medium">Fecha</th>
                        <th className="px-2 py-2 font-medium">Factura</th>
                        <th className="px-2 py-2 font-medium">Operador</th>
                        <th className="px-2 py-2 font-medium">Clave</th>
                        <th className="px-2 py-2 text-right font-medium">Base</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.movimientos.map((m, i) => (
                        <tr key={`${m.factura}-${i}`} className="border-b border-slate-100">
                          <td className="whitespace-nowrap px-2 py-2">{m.fecha}</td>
                          <td className="px-2 py-2">
                            {m.factura}
                            <span className="ml-1 text-xs text-slate-500">({m.tipo})</span>
                            {m.rectifica && <span className="ml-1 text-xs text-amber-700">rectifica {m.rectifica.periodo} de {m.rectifica.ejercicio}</span>}
                          </td>
                          <td className="px-2 py-2">
                            {m.nombre} <span className="font-mono text-xs text-slate-500">{m.nifIva}</span>
                          </td>
                          <td className="px-2 py-2">
                            {m.tipo === 'compra' && m.id && !presentado ? (
                              <select
                                aria-label={`Clave del 349 de la factura ${m.factura}`}
                                value={m.clave}
                                onChange={(e) => cambiarClave(m, e.target.value)}
                                className="rounded border border-slate-300 px-2 py-1 text-xs"
                              >
                                <option value="A">A – {CLAVES.A}</option>
                                <option value="I">I – {CLAVES.I}</option>
                              </select>
                            ) : (
                              <span title={CLAVES[m.clave]}>{m.clave}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">{formatoImporte(m.base, 'EUR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-500">
                En las compras la clave sale del tipo de gasto (compras de mercancía = A; servicios, alquileres y suministros = I). Si no acierta, cámbiala aquí.
              </p>
            </Seccion>

            {/* La X solo cabe en el segundo mes del trimestre; en otro mes se enseña solo para poder quitarla. */}
            {!presentado && (/^(02|05|08|11)$/.test(periodo) || (/^\d{2}$/.test(periodo) && b.opciones.cambioPeriodicidad)) && (
              <Seccion titulo="Cambio de periodicidad">
                <form onSubmit={guardarOpciones} className="space-y-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={cambio} onChange={(e) => setCambio(e.target.checked)} />
                    En este mes se superan los 50.000 € y es la primera declaración mensual: recoge este mes y el anterior
                  </label>
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={guardando} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                      {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    {mensaje && <span className="text-sm text-slate-600">{mensaje}</span>}
                  </div>
                </form>
              </Seccion>
            )}

            <DescargarFichero
              ruta={companyPath(`/tax-models/349/fichero?ejercicio=${ejercicio}&periodo=${periodo}`)}
              nombre={`349_${ejercicio}_${periodo}.txt`}
              bloqueado={bloqueado}
              numero={{ codigo: '349', ejercicio, periodo }}
              onDescargado={() => setRecarga((n) => n + 1)}
            />
            <p className="text-xs text-slate-500">
              {b.numeroDeclaracion ? `Número identificativo de la declaración: ${b.numeroDeclaracion}. ` : ''}La persona de contacto y el teléfono se cambian en Más &gt; Datos de la empresa, apartado Contacto.
            </p>

            <Declaraciones codigo="349" ejercicio={ejercicio} periodo={periodo} recarga={recarga} onCambio={() => setRecarga((n) => n + 1)} />
          </div>
        )
      )}
    </div>
  );
}
