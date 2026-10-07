'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';

/** Respuesta de GET /income-invoices/stats/cobros?anio= */
interface Cifra {
  numero: number;
  importe: number;
}

interface FacturaPorCobrar {
  id: string;
  numeroCompleto: string | null;
  cliente: string;
  fechaEmision: string;
  fechaVencimiento: string;
  total: number;
  cobrado: number;
  /** Lo que restan sus rectificativas en negativo: total - cobrado - abonado = pendiente. */
  abonado: number;
  pendiente: number;
  vencida: boolean;
  diasRetraso: number;
}

interface ResumenCobros {
  anio: number;
  hoy: string;
  pendientes: Cifra;
  vencidas: Cifra;
  parcialmenteCobradas: Cifra;
  cobradas: Cifra;
  cobradoEnElAnio: number;
  proximas: FacturaPorCobrar[];
  criterio: Record<string, string>;
}

const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' (sin pasar por Date: no se desplaza por la zona horaria). */
const fecha = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
const facturas = (n: number) => `${n} ${n === 1 ? 'factura' : 'facturas'}`;

function diasHasta(hoy: string, venc: string): number {
  return Math.round((Date.parse(`${venc}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}

/** " · cobrado X y abonado Y de TOTAL": así cuadra con lo pendiente que sale a la derecha. */
function detalleCobro(f: FacturaPorCobrar): string {
  const partes = [f.cobrado > 0 ? `cobrado ${eur(f.cobrado)}` : '', f.abonado > 0 ? `abonado ${eur(f.abonado)}` : ''].filter(Boolean);
  return partes.length ? ` · ${partes.join(' y ')} de ${eur(f.total)}` : '';
}

/** Chip de la fila: vencida (rojo) o a punto de vencer (ambar). */
function Chip({ f, hoy }: { f: FacturaPorCobrar; hoy: string }) {
  const base = 'inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 whitespace-nowrap';
  if (f.vencida) {
    return <span className={`${base} bg-rose-50 text-rose-700 border-rose-200`}>Vencida hace {dias(f.diasRetraso)}</span>;
  }
  const faltan = diasHasta(hoy, f.fechaVencimiento);
  if (faltan > 7) return null;
  const texto = faltan <= 0 ? 'Vence hoy' : faltan === 1 ? 'Vence mañana' : `Vence en ${dias(faltan)}`;
  return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>{texto}</span>;
}

/**
 * Bloque "Cobros de clientes" del panel: lo pendiente de cobro (de cualquier
 * año, con lo vencido en rojo), lo cobrado en el año elegido y las próximas
 * facturas a cobrar. Si el endpoint falla, avisa sin romper el resto del panel.
 */
export function CobrosClientes({ anio }: { anio: number }) {
  const [datos, setDatos] = useState<ResumenCobros | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  // Cada fallo vuelve a insertar el texto del aviso, para que el lector de pantalla lo lea otra vez.
  const [fallos, setFallos] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    // setCargando(false) va junto al resultado (y no en finally) para que se pinten a la vez.
    apiFetch<ResumenCobros>(companyPath(`/income-invoices/stats/cobros?anio=${anio}`))
      .then((r) => {
        if (!vigente) return;
        setDatos(r);
        setError(null);
        setCargando(false);
      })
      .catch((e) => {
        if (!vigente) return;
        setDatos(null);
        setError(errorMessage(e));
        setFallos((n) => n + 1);
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [anio, intento]);

  // Mientras reintenta, el botón sigue en su sitio (aria-disabled, no disabled: así no pierde el foco).
  const reintentar = useCallback(() => {
    if (!cargando) setIntento((n) => n + 1);
  }, [cargando]);

  return (
    <section
      aria-labelledby="cobros-clientes"
      aria-busy={cargando}
      className="rounded-xl bg-white border border-slate-200 p-5 md:p-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-5">
        <h2 id="cobros-clientes" className="text-base font-semibold text-slate-900">
          Cobros de clientes
        </h2>
        <Link href="/dashboard/facturas" className="text-sm font-medium text-accent-600 hover:text-accent-700">
          Ver facturas de venta
        </Link>
      </div>

      {/* Dos columnas solo con sitio: de md a lg ya está la barra lateral y no caben los importes. */}
      {cargando && !datos && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
          <div className="h-36 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-36 rounded-lg bg-slate-100 animate-pulse" />
        </div>
      ) : error || !datos ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 flex flex-wrap items-center justify-between gap-3">
          <p role="alert">
            <span key={fallos}>No se han podido cargar los cobros de clientes.{error ? ` ${error}` : ''}</span>
          </p>
          <button
            type="button"
            onClick={reintentar}
            aria-disabled={cargando}
            className={`px-3 py-1.5 rounded-lg border border-amber-200 bg-white text-sm font-medium text-slate-700 ${
              cargando ? 'cursor-wait opacity-60' : 'hover:bg-slate-50'
            }`}
          >
            {cargando ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      ) : (
        <div className={`flex flex-col gap-6 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            {/* Pendiente de cobro: todas las facturas emitidas, de cualquier año */}
            <div className="rounded-lg border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-500">Pendiente de cobro</p>
              <p className="mt-1 text-2xl lg:text-3xl font-bold text-slate-900">{eur(datos.pendientes.importe)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {datos.pendientes.numero === 0 ? 'Ninguna factura por cobrar' : `${facturas(datos.pendientes.numero)}, de cualquier año`}
                {datos.parcialmenteCobradas.numero > 0 && ` · ${datos.parcialmenteCobradas.numero} con cobros parciales`}
              </p>
              {datos.vencidas.numero > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <span className="text-sm font-medium text-rose-700">Vencido · {facturas(datos.vencidas.numero)}</span>
                  <span className="font-mono text-sm font-semibold text-rose-700">{eur(datos.vencidas.importe)}</span>
                </div>
              ) : (
                datos.pendientes.numero > 0 && <p className="mt-4 text-xs font-medium text-emerald-700">No hay nada vencido.</p>
              )}
            </div>

            {/* Cobrado: facturas del año elegido */}
            <div className="rounded-lg border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-500">Cobrado de {datos.anio}</p>
              <p className="mt-1 text-2xl lg:text-3xl font-bold text-emerald-700">{eur(datos.cobradas.importe)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {datos.cobradas.numero === 0
                  ? `Ninguna factura de ${datos.anio} cobrada del todo`
                  : `${facturas(datos.cobradas.numero)} de ${datos.anio} ${datos.cobradas.numero === 1 ? 'cobrada' : 'cobradas'} del todo`}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-600">Cobros con fecha de {datos.anio}</span>
                <span className="font-mono font-medium text-slate-900">{eur(datos.cobradoEnElAnio)}</span>
              </div>
            </div>
          </div>

          {/* Próximas y vencidas */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Próximos cobros</h3>
            {datos.proximas.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
                <p className="text-sm font-medium text-slate-700">No tienes facturas pendientes de cobro</p>
                <p className="mt-1 text-xs text-slate-500">Cuando emitas una factura y quede algo por cobrar, aparecerá aquí.</p>
                <Link
                  href="/dashboard/facturas/nueva"
                  className="mt-3 inline-block text-sm font-medium text-accent-600 hover:text-accent-700"
                >
                  Crear una factura
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {datos.proximas.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/dashboard/facturas/${f.id}`}
                      className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 transition-colors sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{f.cliente}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono">{f.numeroCompleto ?? 'Sin número'}</span> · Vence el {fecha(f.fechaVencimiento)}
                          {detalleCobro(f)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Chip f={f} hoy={datos.hoy} />
                        <span className={`ml-auto font-mono text-sm font-semibold whitespace-nowrap ${f.vencida ? 'text-rose-600' : 'text-slate-900'}`}>
                          {eur(f.pendiente)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {datos.pendientes.numero > datos.proximas.length && (
              <p className="mt-2 text-xs text-slate-500">
                Se muestran las {datos.proximas.length} que vencen antes, de {facturas(datos.pendientes.numero)} pendientes en total.{' '}
                <Link href="/dashboard/facturas" className="font-medium text-accent-600 hover:text-accent-700">
                  Ir a facturas de venta
                </Link>
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
