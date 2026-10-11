'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, FileArrowUp, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import PanelLectura from '@/components/lector/PanelLectura';
import {
  ALTA_MANUAL,
  claveTexto,
  descartarLectura,
  ErrorLectura,
  esCancelada,
  euros,
  fechaLegible,
  leerFactura,
  type IngresoExtraido,
  type InfoLectura,
} from '@/lib/lecturas';

/**
 * Lector de facturas de venta: se sube el PDF o la foto de una factura
 * emitida, el servidor la lee (Azure y, si hace falta, Claude) y valida cada
 * dato. El usuario lo revisa y, al confirmar, el servidor registra la factura
 * con los datos que leyo (no con lo que reenvia el navegador).
 */

const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

interface Registrada {
  facturaId: string;
  numeroCompleto: string;
  total: number;
}

function Dato({ etiqueta, children, mono }: { etiqueta: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{etiqueta}</dt>
      <dd className={`mt-0.5 break-words font-semibold text-slate-900 ${mono ? 'font-mono text-sm' : ''}`}>{children}</dd>
    </div>
  );
}

const importe = (n: number | null) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? 'sin leer' : euros(Number(n)));

export default function LectorIngresosPage() {
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['ventas:write']);
  const inputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState('');
  const [alternativa, setAlternativa] = useState<{ ruta: string; texto: string } | null>(null);
  const [ingreso, setIngreso] = useState<IngresoExtraido | null>(null);
  const [info, setInfo] = useState<InfoLectura | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [registrada, setRegistrada] = useState<Registrada | null>(null);
  const lecturaIdRef = useRef<string | null>(null);
  const cortarRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!archivo) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  useEffect(() => {
    if (!leyendo) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [leyendo]);

  useEffect(() => () => cortarRef.current?.abort(), []);

  const abrirSelector = () => {
    if (!leyendo) inputRef.current?.click();
  };

  const soltarLectura = () => {
    cortarRef.current?.abort();
    cortarRef.current = null;
    const id = lecturaIdRef.current;
    lecturaIdRef.current = null;
    if (id) void descartarLectura('ventas', id);
  };

  const reiniciar = () => {
    if (!registrada) soltarLectura();
    lecturaIdRef.current = null;
    setArchivo(null);
    setIngreso(null);
    setInfo(null);
    setRevisado(false);
    setRegistrada(null);
    setError('');
    setErrorGuardar('');
    setAlternativa(null);
    setLeyendo(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const leer = async (f: File) => {
    setError('');
    setErrorGuardar('');
    setAlternativa(null);
    setRegistrada(null);
    if (!TIPOS.includes(f.type)) {
      setError('Solo se pueden leer PDF e imágenes (JPG, PNG o WEBP).');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('El archivo pesa más de 4 MB: redúcelo o haz la foto con menos resolución.');
      return;
    }
    soltarLectura();
    const cortar = new AbortController();
    cortarRef.current = cortar;
    setArchivo(f);
    setIngreso(null);
    setInfo(null);
    setRevisado(false);
    setLeyendo(true);
    try {
      const r = await leerFactura('ventas', f, {
        signal: cortar.signal,
        alEmpezar: (id) => {
          lecturaIdRef.current = id;
        },
      });
      if (cortar.signal.aborted) return;
      setIngreso(r.ingreso);
      setInfo(r.lectura);
    } catch (err) {
      if (esCancelada(err) || cortar.signal.aborted) return;
      setError(errorMessage(err));
      if (err instanceof ErrorLectura && err.alternativa) setAlternativa(err.alternativa);
    } finally {
      if (cortarRef.current === cortar) {
        cortarRef.current = null;
        setLeyendo(false);
      }
    }
  };

  const confirmar = async () => {
    if (!ingreso) return;
    setGuardando(true);
    setErrorGuardar('');
    try {
      // Solo el id: el servidor registra la factura con los datos que leyo.
      const r = await apiFetch<Registrada>(companyPath('/ingresos-extractor/confirmar'), {
        method: 'POST',
        body: JSON.stringify({ documentId: ingreso.documentId, revisado }),
      });
      setRegistrada(r);
    } catch (err) {
      setErrorGuardar(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) leer(f);
  };

  const alSoltar = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) leer(f);
  };

  const esImagen = archivo?.type.startsWith('image/');
  // Los errores que ya explica el panel no se repiten.
  const yaExplicados = new Set(info ? Object.values(info.campos).flatMap((c) => (c ? c.motivos.map(claveTexto) : [])) : []);
  const erroresSueltos = ingreso ? ingreso.errores.filter((e) => !yaExplicados.has(claveTexto(e))) : [];
  const bloqueada = !!ingreso && ingreso.errores.length > 0;
  const faltaRevision = !!info?.requiereRevision && !revisado;

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 md:px-8">
          <Link href="/dashboard/facturas" className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Volver a Facturas">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-semibold text-slate-900">Lector de facturas de venta</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-24 md:px-8 md:py-8">
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegir} className="hidden" tabIndex={-1} aria-hidden="true" />

        {!puedeEscribir ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Para registrar facturas de venta hace falta el permiso de escritura en Ventas.</p>
        ) : registrada ? (
          <div role="status" className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
            <p className="flex items-start gap-2 font-medium">
              <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0" />
              <span>
                Factura {registrada.numeroCompleto} registrada por {euros(registrada.total)}.
              </span>
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href={`/dashboard/facturas/${registrada.facturaId}`} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">
                Ver la factura
              </Link>
              <button type="button" onClick={reiniciar} className="rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700">
                Leer otra
              </button>
            </div>
          </div>
        ) : !ingreso || !info ? (
          <div className="mx-auto max-w-2xl">
            <div
              role="button"
              tabIndex={0}
              onClick={abrirSelector}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  abrirSelector();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={alSoltar}
              aria-label="Seleccionar el archivo de la factura"
              aria-busy={leyendo}
              className="cursor-pointer rounded-xl border-2 border-dashed border-emerald-200 bg-white p-8 text-center transition-colors hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-accent-600 md:p-12"
            >
              <FileArrowUp size={48} weight="duotone" className="mx-auto mb-4 text-accent-600" />
              <h2 className="mb-2 text-lg font-semibold text-slate-900">{leyendo ? 'Leyendo la factura…' : 'Sube el PDF o la foto de una factura emitida'}</h2>
              <p role={leyendo ? 'status' : undefined} className="mb-6 text-sm text-slate-600">
                {leyendo
                  ? segundos < 10
                    ? 'Tarda unos segundos.'
                    : 'Sigue leyendo; las facturas largas tardan un poco más.'
                  : 'Arrástrala aquí o pulsa para elegirla. PDF, JPG, PNG o WEBP de hasta 4 MB.'}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirSelector();
                }}
                disabled={leyendo}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-6 py-3 font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
              >
                {leyendo ? 'Leyendo…' : 'Seleccionar archivo'}
              </button>
              {leyendo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reiniciar();
                  }}
                  className="mt-3 block w-full text-sm font-semibold text-slate-600 hover:underline sm:mx-auto sm:w-auto"
                >
                  Cancelar
                </button>
              )}
              {archivo && (
                <p className="mt-4 break-all text-sm text-slate-600">
                  {archivo.name} ({(archivo.size / 1024 / 1024).toFixed(2).replace('.', ',')} MB)
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <WarningCircle size={18} className="mt-0.5 shrink-0" />
                <span>
                  {error}
                  {alternativa && (
                    <>
                      {' '}
                      <Link href={alternativa.ruta} className="font-semibold underline">
                        {alternativa.texto}
                      </Link>
                    </>
                  )}
                </span>
              </p>
            )}
            <p className="mt-4 text-sm text-slate-500">
              Verás los datos leídos y lo que haya que comprobar antes de registrarla. La factura se registra con lo que se ha leído: si algo está mal, créala a mano.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Vista previa */}
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-all text-sm text-slate-600">{archivo?.name}</p>
                <button type="button" onClick={reiniciar} className="text-sm font-semibold text-blue-600 hover:underline">
                  Leer otra
                </button>
              </div>
              {vista &&
                (esImagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={vista} alt="Factura subida" className="max-h-[70vh] w-full rounded-lg border border-slate-200 bg-white object-contain" />
                ) : (
                  <iframe src={vista} title="Factura subida" className="h-[50vh] w-full rounded-lg border border-slate-200 bg-white lg:h-[75vh]" />
                ))}
            </section>

            {/* Lo leido y la confirmacion */}
            <section className="flex min-w-0 flex-col gap-4">
              <PanelLectura info={info} lector="ventas" revisado={revisado} onRevisado={setRevisado} conCasilla={!bloqueada} />

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="mb-3 font-semibold text-slate-900">Datos leídos</h2>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Dato etiqueta="Cliente">{ingreso.cliente || 'sin leer'}</Dato>
                  <Dato etiqueta="NIF del cliente" mono>
                    {ingreso.nifCliente || 'sin leer'}
                  </Dato>
                  <Dato etiqueta="Número de factura">{ingreso.numeroFactura || 'sin leer'}</Dato>
                  <Dato etiqueta="Fecha">{ingreso.fecha ? fechaLegible(ingreso.fecha) : 'sin leer'}</Dato>
                  <Dato etiqueta="Concepto">{ingreso.concepto || 'sin leer'}</Dato>
                  <Dato etiqueta="Cuenta de ventas" mono>
                    {ingreso.cuentaContable || '700'}
                  </Dato>
                  <Dato etiqueta="Base imponible">{importe(ingreso.base)}</Dato>
                  <Dato etiqueta="IVA">{importe(ingreso.iva)}</Dato>
                  {(ingreso.retencion ?? 0) > 0 && <Dato etiqueta="Retención de IRPF">− {importe(ingreso.retencion)}</Dato>}
                  <Dato etiqueta="Total">{importe(ingreso.total)}</Dato>
                </dl>
              </div>

              {bloqueada && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <p className="font-semibold">Esta factura no se puede registrar desde el lector.</p>
                  {erroresSueltos.length > 0 && (
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {erroresSueltos.map((e, i) => (
                        <li key={i} className="break-words">
                          {e}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2">
                    {erroresSueltos.length === 0 && 'Mira los datos marcados arriba. '}
                    <Link href={ALTA_MANUAL.ventas.ruta} className="font-semibold underline">
                      {ALTA_MANUAL.ventas.texto}
                    </Link>
                  </p>
                </div>
              )}

              {!bloqueada && faltaRevision && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Marca que has revisado los datos señalados (arriba) antes de registrar.</p>
              )}

              {errorGuardar && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <WarningCircle size={18} className="mt-0.5 shrink-0" />
                  {errorGuardar}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button type="button" onClick={reiniciar} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={guardando || bloqueada || faltaRevision}
                  className="rounded-lg bg-accent-600 px-5 py-2.5 font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
                >
                  {guardando ? 'Registrando…' : 'Registrar la factura de venta'}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
