'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CaretLeft, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';
import { ejercicioAnualAPresentar } from '@/lib/aeatCalendar';
import {
  AvisosBorrador,
  CamposRegistro,
  DescargarFichero,
  ESTADO_MODELO,
  Seccion,
  TablaRegistros,
  ejerciciosBorrador,
  type CampoLeido,
  type Columna,
} from '../components/RegistroAeat';
import { Declaraciones } from '../components/Declaraciones';

/**
 * Modelo 180 (resumen anual de retenciones por alquileres): borrador con el
 * diseño de registro de la AEAT, un registro por arrendador, inmueble y año de
 * devengo, y el cuadre con los 115 del año. Aquí se dan de alta los locales
 * alquilados (referencia catastral y dirección), que la AEAT pide en el 180.
 */

interface FacturaAlquiler {
  id: string;
  factura: string;
  fecha: string;
  proveedor: string;
  supplierId: string;
  inmuebleArrendadoId: string | null;
  base: number;
  retencion: number;
}

interface Borrador180 {
  ejercicio: number;
  estado: string;
  /** Tipo y anterior: los pone el historial de declaraciones. */
  opciones: { tipoDeclaracion: 'C' | 'S' | null; declaracionAnterior: string | null };
  /** Número identificativo; null hasta la primera descarga o la presentación. */
  numeroDeclaracion: string | null;
  errores: string[];
  avisos: string[];
  pantalla: { declarante: CampoLeido[]; columnasPerceptor: Columna[]; perceptores: Array<Record<string, string | number>> } | null;
  cuadre: {
    coincide: boolean;
    base180: number;
    retenciones180: number;
    base115: number;
    retenciones115: number;
    faltan: string[];
    periodos: Array<{ periodo: string; base: number; retenciones: number; fuente: 'guardado' | 'calculado'; estado: string }>;
  };
  facturas: FacturaAlquiler[];
  sinInmueble: FacturaAlquiler[];
}

interface Inmueble {
  id: string;
  supplierId: string;
  situacion: number;
  referenciaCatastral: string | null;
  tipoVia: string;
  nombreVia: string;
  tipoNumeracion: string;
  numeroCasa: string | null;
  planta: string | null;
  puerta: string | null;
  municipio: string;
  codigoMunicipio: string;
  codigoProvincia: string;
  codigoPostal: string;
  activo: boolean;
  supplier?: { nombreFiscal: string; nifCif: string };
}

const eur = (n: number) => formatoImporte(n, 'EUR');
const SITUACIONES: Record<number, string> = {
  1: 'Con referencia catastral (resto de España)',
  2: 'Con referencia catastral, País Vasco',
  3: 'Con referencia catastral, Navarra',
  4: 'Sin referencia catastral',
};
const TIPOS_VIA = [
  ['CL', 'Calle'],
  ['AV', 'Avenida'],
  ['PZ', 'Plaza'],
  ['PS', 'Paseo'],
  ['CR', 'Carretera'],
  ['CM', 'Camino'],
  ['RD', 'Ronda'],
  ['TR', 'Travesía'],
  ['PJ', 'Pasaje'],
  ['GV', 'Gran vía'],
  ['UR', 'Urbanización'],
  ['PG', 'Polígono'],
];

type Formulario = Record<string, string>;
const FORM_VACIO: Formulario = {
  supplierId: '',
  situacion: '',
  referenciaCatastral: '',
  tipoVia: 'CL',
  nombreVia: '',
  tipoNumeracion: 'NUM',
  numeroCasa: '',
  calificadorNumero: '',
  bloque: '',
  portal: '',
  escalera: '',
  planta: '',
  puerta: '',
  complemento: '',
  localidad: '',
  municipio: '',
  codigoMunicipio: '',
  codigoPostal: '',
};

function Texto({ id, label, valor, onChange, max, ayuda, className = '' }: { id: string; label: string; valor: string; onChange: (v: string) => void; max: number; ayuda?: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input id={id} value={valor} maxLength={max} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {ayuda && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>}
    </div>
  );
}

export default function Modelo180Page() {
  const [ejercicio, setEjercicio] = useState(() => ejercicioAnualAPresentar());
  const [b, setB] = useState<Borrador180 | null>(null);
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [form, setForm] = useState<Formulario>(FORM_VACIO);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    Promise.all([apiFetch<Borrador180>(companyPath(`/tax-models/180?ejercicio=${ejercicio}`)), apiFetch<Inmueble[]>(companyPath('/tax-models/180/inmuebles'))])
      .then(([r, i]) => {
        if (!vivo) return;
        setB(r);
        setInmuebles(i);
      })
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [ejercicio, recarga]);

  // Arrendadores con facturas de alquiler del año (para dar de alta sus inmuebles).
  const arrendadores = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of b?.facturas ?? []) m.set(f.supplierId, f.proveedor);
    for (const i of inmuebles) if (i.supplier) m.set(i.supplierId, i.supplier.nombreFiscal);
    return Array.from(m.entries()).sort((x, y) => x[1].localeCompare(y[1], 'es'));
  }, [b, inmuebles]);

  const presentado = b?.estado === 'presentado';
  const bloqueado = !b || b.errores.length > 0 || !b.pantalla;
  const campo = (k: string) => ({ id: `inm-${k}`, valor: form[k] ?? '', onChange: (v: string) => setForm((f) => ({ ...f, [k]: v })) });

  const altaInmueble = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    try {
      const cuerpo = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      if (cuerpo.situacion) (cuerpo as Record<string, unknown>).situacion = Number(cuerpo.situacion);
      await apiFetch(companyPath('/tax-models/180/inmuebles'), { method: 'POST', body: JSON.stringify(cuerpo) });
      setForm(FORM_VACIO);
      setAbierto(false);
      setMensaje('Inmueble guardado.');
      setRecarga((n) => n + 1);
    } catch (err) {
      setMensaje(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const darDeBaja = async (i: Inmueble) => {
    try {
      await apiFetch(companyPath(`/tax-models/180/inmuebles/${i.id}`), { method: 'PUT', body: JSON.stringify({ activo: !i.activo }) });
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const asignar = async (f: FacturaAlquiler, inmuebleId: string) => {
    try {
      await apiFetch(companyPath(`/tax-models/180/facturas/${f.id}/inmueble`), { method: 'PUT', body: JSON.stringify({ inmuebleArrendadoId: inmuebleId || null }) });
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/fiscal" className="mb-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Modelo 180 – Resumen anual de alquileres</h1>
        <p className="mt-2 text-slate-600">
          Las retenciones de los alquileres del año por arrendador y local, como las pide la AEAT. Tiene que cuadrar con los cuatro 115. Se presenta del 1 al 31 de enero.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="m180-ej" className="block text-sm font-medium text-slate-700">
            Ejercicio
          </label>
          <select id="m180-ej" value={ejercicio} onChange={(e) => setEjercicio(parseInt(e.target.value))} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {ejerciciosBorrador().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {cargando && !b ? (
        <div className="h-96 animate-pulse rounded-lg bg-slate-200" />
      ) : error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-800">
          {error}
        </div>
      ) : (
        b && (
          <div className={`space-y-6 ${cargando ? 'opacity-60' : ''}`}>
            <AvisosBorrador errores={b.errores} avisos={b.avisos} />

            <Seccion
              titulo="Cuadre con los 115 del año"
              extra={
                b.cuadre.coincide ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
                    <CheckCircle size={18} /> Cuadra
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
                    <WarningCircle size={18} /> No cuadra
                  </span>
                )
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-600">
                      <th className="py-2 font-medium">115</th>
                      <th className="py-2 text-right font-medium">Base</th>
                      <th className="py-2 text-right font-medium">Retenciones</th>
                      <th className="py-2 pl-3 font-medium">De dónde sale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.cuadre.periodos.map((p) => (
                      <tr key={p.periodo} className="border-b border-slate-100">
                        <td className="py-2 font-medium">{p.periodo}</td>
                        <td className="py-2 text-right font-mono">{eur(p.base)}</td>
                        <td className="py-2 text-right font-mono">{eur(p.retenciones)}</td>
                        <td className="py-2 pl-3 text-xs text-slate-600">
                          {p.fuente === 'guardado' ? 'Guardado en la app' : 'Calculado con las facturas'} · {ESTADO_MODELO[p.estado] ?? p.estado}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2">Total 115</td>
                      <td className="py-2 text-right font-mono">{eur(b.cuadre.base115)}</td>
                      <td className="py-2 text-right font-mono">{eur(b.cuadre.retenciones115)}</td>
                      <td />
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-2">Total 180</td>
                      <td className="py-2 text-right font-mono">{eur(b.cuadre.base180)}</td>
                      <td className="py-2 text-right font-mono">{eur(b.cuadre.retenciones180)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </Seccion>

            {b.pantalla && (
              <>
                <Seccion
                  titulo={`Declarante – ${b.ejercicio}`}
                  extra={<span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">{ESTADO_MODELO[b.estado] ?? b.estado}</span>}
                >
                  <CamposRegistro campos={b.pantalla.declarante} />
                </Seccion>
                <Seccion titulo="Perceptores (un registro por arrendador, inmueble y año de devengo)">
                  <TablaRegistros
                    columnas={b.pantalla.columnasPerceptor}
                    filas={b.pantalla.perceptores}
                    vacio="No hay facturas de alquiler con retención en el año."
                    principales={['nombrePerceptor', 'nifPerceptor']}
                  />
                </Seccion>
              </>
            )}

            {b.sinInmueble.length > 0 && !presentado && (
              <Seccion titulo="Facturas sin inmueble">
                <ul className="divide-y divide-slate-100">
                  {b.sinInmueble.map((f) => {
                    const suyos = inmuebles.filter((i) => i.supplierId === f.supplierId && i.activo);
                    return (
                      <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                        <span>
                          {f.fecha} · {f.factura} · {f.proveedor} · {eur(f.base)}
                        </span>
                        {suyos.length ? (
                          <select aria-label={`Inmueble de la factura ${f.factura}`} defaultValue="" onChange={(e) => asignar(f, e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm">
                            <option value="">Elige el local…</option>
                            {suyos.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.tipoVia} {i.nombreVia} {i.numeroCasa ?? ''} ({i.municipio})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-amber-700">Da de alta su local abajo.</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Seccion>
            )}

            <Seccion
              titulo="Locales alquilados"
              extra={
                !presentado && (
                  <button type="button" onClick={() => setAbierto((v) => !v)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    {abierto ? 'Cerrar' : 'Añadir local'}
                  </button>
                )
              }
            >
              {inmuebles.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no hay locales dados de alta.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {inmuebles.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className={i.activo ? '' : 'text-slate-400 line-through'}>
                        <strong>{i.supplier?.nombreFiscal}</strong> · {i.tipoVia} {i.nombreVia} {i.tipoNumeracion === 'NUM' ? i.numeroCasa ?? '' : i.tipoNumeracion} {i.planta ? `planta ${i.planta}` : ''}{' '}
                        {i.puerta ? `puerta ${i.puerta}` : ''} · {i.codigoPostal} {i.municipio} · {i.referenciaCatastral ?? 'sin referencia catastral'}
                      </span>
                      {!presentado && (
                        <button type="button" onClick={() => darDeBaja(i)} className="text-xs text-blue-600 hover:underline">
                          {i.activo ? 'Ya no lo alquilo' : 'Volver a activarlo'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {abierto && (
                <form onSubmit={altaInmueble} className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <label htmlFor="inm-supplierId" className="block text-sm font-medium text-slate-700">
                      Arrendador
                    </label>
                    <select id="inm-supplierId" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">Elige el proveedor…</option>
                      {arrendadores.map(([id, nombre]) => (
                        <option key={id} value={id}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">Salen los que tienen facturas de alquiler en el año.</p>
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="inm-situacion" className="block text-sm font-medium text-slate-700">
                      Situación
                    </label>
                    <select id="inm-situacion" value={form.situacion} onChange={(e) => setForm((f) => ({ ...f, situacion: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">Según la provincia y la referencia catastral</option>
                      {Object.entries(SITUACIONES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {k} – {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Texto {...campo('referenciaCatastral')} label="Referencia catastral" max={20} ayuda="20 letras y cifras (está en el recibo del IBI)." className="md:col-span-2" />
                  <div>
                    <label htmlFor="inm-tipoVia" className="block text-sm font-medium text-slate-700">
                      Tipo de vía
                    </label>
                    <input id="inm-tipoVia" list="tipos-via" maxLength={5} value={form.tipoVia} onChange={(e) => setForm((f) => ({ ...f, tipoVia: e.target.value.toUpperCase() }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <datalist id="tipos-via">
                      {TIPOS_VIA.map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <Texto {...campo('nombreVia')} label="Nombre de la vía" max={50} />
                  <div>
                    <label htmlFor="inm-tipoNumeracion" className="block text-sm font-medium text-slate-700">
                      Numeración
                    </label>
                    <select id="inm-tipoNumeracion" value={form.tipoNumeracion} onChange={(e) => setForm((f) => ({ ...f, tipoNumeracion: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="NUM">Número</option>
                      <option value="KM.">Punto kilométrico</option>
                      <option value="S/N">Sin número</option>
                    </select>
                  </div>
                  <Texto {...campo('numeroCasa')} label="Número o km" max={5} />
                  <Texto {...campo('calificadorNumero')} label="Calificador (BIS…)" max={3} />
                  <Texto {...campo('bloque')} label="Bloque" max={3} />
                  <Texto {...campo('portal')} label="Portal" max={3} />
                  <Texto {...campo('escalera')} label="Escalera" max={3} />
                  <Texto {...campo('planta')} label="Planta" max={3} />
                  <Texto {...campo('puerta')} label="Puerta" max={3} />
                  <Texto {...campo('complemento')} label="Complemento" max={40} ayuda="Urbanización, centro comercial, local…" className="md:col-span-2" />
                  <Texto {...campo('municipio')} label="Municipio" max={30} />
                  <Texto {...campo('codigoMunicipio')} label="Código INE del municipio" max={5} ayuda="5 cifras (por ejemplo, 46250 Valencia)." />
                  <Texto {...campo('codigoPostal')} label="Código postal" max={5} />
                  <Texto {...campo('localidad')} label="Localidad (si no es el municipio)" max={30} />
                  <div className="flex items-center gap-3 md:col-span-4">
                    <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                      {guardando ? 'Guardando…' : 'Guardar local'}
                    </button>
                  </div>
                </form>
              )}
              {mensaje && <p className="text-sm text-slate-600">{mensaje}</p>}
            </Seccion>

            <DescargarFichero
              ruta={companyPath(`/tax-models/180/fichero?ejercicio=${ejercicio}`)}
              nombre={`180_${ejercicio}.txt`}
              bloqueado={bloqueado}
              numero={{ codigo: '180', ejercicio }}
              onDescargado={() => setRecarga((n) => n + 1)}
            />
            <p className="text-xs text-slate-500">
              {b.numeroDeclaracion ? `Número identificativo de la declaración: ${b.numeroDeclaracion}. ` : ''}La persona de contacto y el teléfono se cambian en Más &gt; Datos de la empresa, apartado Contacto.
            </p>
            <Declaraciones codigo="180" ejercicio={ejercicio} recarga={recarga} onCambio={() => setRecarga((n) => n + 1)} />
          </div>
        )
      )}
    </div>
  );
}
