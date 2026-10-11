'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, FileArrowUp, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { pareceNifIvaUe } from '@/lib/fiscal';
import FormFacturaGasto, { type FormInicial } from '@/components/compras/FormFacturaGasto';
import { hoyIso, paisDelPrefijo, TIPO_GASTO_INFO, tipoIvaMasCercano, type GastoExtraido, type GastoRegistrado } from '@/lib/compras';

/**
 * Lector de gastos: se sube el PDF o la foto de una factura de proveedor, la IA
 * la lee, el usuario revisa y corrige todos los datos y, al registrarla, se
 * crea la factura de gasto con su asiento en borrador (se aprueba en el Motor
 * contable). El archivo se lee en el servidor; aqui solo se ve la vista previa.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Lo leido, en la forma del formulario. */
function inicialDe(g: GastoExtraido, paisExistente: string | null): FormInicial {
  const tipo = g.tipoGastoSugerido && TIPO_GASTO_INFO[g.tipoGastoSugerido] ? g.tipoGastoSugerido : 'SUMINISTROS';
  const base = Number(g.base) || 0;
  const tipoIva = g.tipoIva !== null && g.tipoIva !== undefined ? tipoIvaMasCercano(g.tipoIva) : base > 0 ? tipoIvaMasCercano(((Number(g.iva) || 0) / base) * 100) : 21;
  const ret = Number(g.tipoRetencion) || 0;
  const nif = (g.nifProveedor ?? '').trim();
  let proveedor: FormInicial['proveedor'] = null;
  if (g.proveedorExistente) {
    proveedor = { tipo: 'existente', id: g.proveedorExistente.id, nombre: g.proveedorExistente.nombreFiscal, nif: g.proveedorExistente.nifCif, pais: paisExistente || 'ES' };
  } else if (g.proveedor || nif) {
    const pais = pareceNifIvaUe(nif) ? (paisDelPrefijo(nif) ?? 'ES') : 'ES';
    proveedor = { tipo: 'nuevo', nombreFiscal: g.proveedor ?? '', nifCif: nif, pais, direccion: '', cp: '', municipio: '', provincia: '' };
  }
  const fecha = g.fecha && /^\d{4}-\d{2}-\d{2}$/.test(g.fecha) ? g.fecha : hoyIso();
  const cuentaLeida = g.cuentaContableBase && /^6\d{2,9}$/.test(g.cuentaContableBase) ? g.cuentaContableBase : null;
  // Sin cuenta leida, la linea va a la cuenta habitual del proveedor (se puede cambiar).
  const habitual = !cuentaLeida && g.cuentaHabitual ? g.cuentaHabitual.codigo : null;
  return {
    proveedor,
    numeroFacturaProveedor: g.numeroFactura ?? '',
    fechaEmision: fecha,
    tipoGasto: tipo,
    cuentaGasto: cuentaLeida,
    lineas: [
      {
        descripcion: g.conceptoGasto?.trim() || 'Gasto',
        cantidad: 1,
        precioUnitario: base,
        tipoIva,
        tipoRetencion: TIPO_GASTO_INFO[tipo].retenciones.includes(ret) ? ret : 0,
        cuenta: habitual,
      },
    ],
    totalDocumento: Number.isFinite(Number(g.total)) && Number(g.total) !== 0 ? Number(g.total) : undefined,
  };
}

export default function LectorGastosPage() {
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);
  const inputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const [leido, setLeido] = useState<GastoExtraido | null>(null);
  const [inicial, setInicial] = useState<FormInicial | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<GastoExtraido['tipoDocumento']>('factura');
  const [registrado, setRegistrado] = useState<GastoRegistrado | null>(null);
  const [lectura, setLectura] = useState(0);

  // La vista previa usa una URL local del archivo: se libera al cambiar de archivo.
  useEffect(() => {
    if (!archivo) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const abrirSelector = () => {
    if (!leyendo) inputRef.current?.click();
  };

  const reiniciar = () => {
    setArchivo(null);
    setLeido(null);
    setInicial(null);
    setRegistrado(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const leer = async (f: File) => {
    setError('');
    setRegistrado(null);
    if (!TIPOS.includes(f.type)) {
      setError('Solo se pueden leer PDF e imágenes (JPG, PNG o WEBP).');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('El archivo pesa más de 4 MB: redúcelo o haz la foto con menos resolución.');
      return;
    }
    setArchivo(f);
    setLeido(null);
    setInicial(null);
    setLeyendo(true);
    try {
      const datos = new FormData();
      datos.append('archivo', f, f.name);
      const g = await apiFetch<GastoExtraido>(companyPath('/gastos-extractor/extraer-ia'), { method: 'POST', body: datos });
      // El pais del proveedor ya dado de alta (un proveedor extranjero no lleva IVA español).
      let pais: string | null = null;
      if (g.proveedorExistente) {
        pais = await apiFetch<{ pais?: string }>(companyPath(`/proveedores/${encodeURIComponent(g.proveedorExistente.id)}`))
          .then((p) => p.pais ?? null)
          .catch(() => null);
      }
      setLeido(g);
      setTipoDocumento(g.tipoDocumento ?? 'factura');
      setInicial(inicialDe(g, pais));
      setLectura((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLeyendo(false);
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

  const noEsFactura = tipoDocumento === 'nomina' || tipoDocumento === 'seguros_sociales';
  const confianza = leido ? Math.round((leido.confianza <= 1 ? leido.confianza * 100 : leido.confianza) || 0) : 0;
  const esImagen = archivo?.type.startsWith('image/');

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 md:px-8">
          <Link href="/dashboard/compras" className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Volver a Compras">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-semibold text-slate-900">Lector de gastos</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-24 md:px-8 md:py-8">
        {/* El input esta fuera de cualquier <label>: el boton y la zona lo abren con el ref. */}
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegir} className="hidden" tabIndex={-1} aria-hidden="true" />

        {!puedeEscribir ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Para registrar facturas de gasto hace falta el permiso de escritura en Compras.</p>
        ) : registrado ? (
          <div role="status" className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
            <p className="flex items-start gap-2 font-medium">
              <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0" />
              <span>
                Factura registrada (registro {registrado.factura.numeroCompleto}). Su asiento está en borrador: revísalo y apruébalo en el Motor contable.
                {registrado.proveedorCreado && ' El proveedor se ha dado de alta.'}
              </span>
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href={`/dashboard/compras/${registrado.factura.id}`} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">
                Ver la factura
              </Link>
              {registrado.asientoId && tieneAlgunPermiso(getUser(), ['contabilidad:read', 'contabilidad:write']) && (
                <Link href={`/dashboard/motor-contable/${registrado.asientoId}`} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">
                  Ver el asiento
                </Link>
              )}
              <button type="button" onClick={reiniciar} className="rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700">
                Leer otra
              </button>
            </div>
          </div>
        ) : !leido || !inicial ? (
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
              <h2 className="mb-2 text-lg font-semibold text-slate-900">{leyendo ? 'Leyendo la factura...' : 'Sube el PDF o la foto de la factura'}</h2>
              <p className="mb-6 text-sm text-slate-600">
                {leyendo ? 'Tarda unos segundos.' : 'Arrástrala aquí o pulsa para elegirla. PDF, JPG, PNG o WEBP de hasta 4 MB. En el móvil puedes hacer la foto directamente.'}
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
                {leyendo ? 'Leyendo...' : 'Seleccionar archivo'}
              </button>
              {archivo && (
                <p className="mt-4 break-all text-sm text-slate-600">
                  {archivo.name} ({(archivo.size / 1024 / 1024).toFixed(2).replace('.', ',')} MB)
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <WarningCircle size={18} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
            <p className="mt-4 text-sm text-slate-500">
              Revisarás y podrás corregir todos los datos antes de registrarla. La factura quedará pendiente de revisar hasta que apruebes su asiento en el Motor contable.
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

            {/* Datos leidos, editables */}
            <section className="flex min-w-0 flex-col gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <p className="text-slate-700">
                  Confianza de la lectura: <span className={`font-semibold ${confianza >= 80 ? 'text-emerald-700' : confianza >= 60 ? 'text-amber-700' : 'text-rose-700'}`}>{confianza} %</span>
                  {confianza < 60 && ' · revisa los datos con cuidado'}
                </p>
                {leido.cuentaContableBase && (
                  <p className="mt-1 text-slate-600">
                    Cuenta sugerida: <span className="font-mono">{leido.cuentaContableBase}</span>
                    {leido.cuentaContableNombre && ` (${leido.cuentaContableNombre})`}
                  </p>
                )}
                {!leido.cuentaContableBase && leido.cuentaHabitual && (
                  <p className="mt-1 text-slate-600">
                    Cuenta habitual de este proveedor: <span className="font-mono">{leido.cuentaHabitual.codigo}</span> {leido.cuentaHabitual.nombre}. La hemos puesto en la línea; puedes
                    cambiarla con «Cambiar cuenta».
                  </p>
                )}
              </div>

              {leido.duplicada && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Ya registraste esta factura ({leido.duplicada.numeroCompleto}).{' '}
                  <Link href={`/dashboard/compras/${leido.duplicada.facturaId}`} className="font-semibold underline">
                    Ver la factura
                  </Link>
                </p>
              )}

              {leido.errores?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="mb-1 font-semibold">Revisa estos puntos:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {leido.errores.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {noEsFactura && (
                <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  <p>
                    {tipoDocumento === 'nomina' ? 'Parece una nómina' : 'Parecen unos seguros sociales'}: si la empresa lleva sus nóminas en la app, no se registra como factura de gasto.{' '}
                    <Link href="/dashboard/nominas" className="font-semibold underline">
                      Ve a Nóminas
                    </Link>
                    , importa el Excel de la gestoría y guarda allí este PDF.
                  </p>
                  <p>
                    Si no lo es (por ejemplo, la cuota de autónomos del administrador, o una empresa sin trabajadores),{' '}
                    <button type="button" onClick={() => setTipoDocumento('factura')} className="font-semibold underline">
                      es una factura de gasto
                    </button>
                    .
                  </p>
                </div>
              )}

              <FormFacturaGasto
                key={lectura}
                modo="lector"
                inicial={inicial}
                extra={{ tipoDocumento, confianza: leido.confianza }}
                bloqueado={
                  leido.duplicada
                    ? `Ya registraste esta factura (${leido.duplicada.numeroCompleto}): no se registra dos veces.`
                    : noEsFactura
                      ? 'Confirma antes si es una factura de gasto (aviso de arriba).'
                      : undefined
                }
                avisoProveedor="No está dado de alta: se creará al registrar la factura."
                onGuardado={(r) => setRegistrado(r)}
                onCancelar={reiniciar}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
