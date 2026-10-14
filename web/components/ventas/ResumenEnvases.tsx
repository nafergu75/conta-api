'use client';

import Link from 'next/link';
import { WarningCircle } from '@phosphor-icons/react';
import { formatoCantidad, type ResumenEnvases as Resumen } from '@/lib/plantillasFactura';

/**
 * Resumen bajo las líneas de una factura con la plantilla A (envases), como
 * en la factura NZ004_26: el peso bruto, que se escribe a mano, y los totales
 * de kg de plástico, packs, uds e IEEPNR. Avisa si el IEEPNR sale a 0 (la
 * empresa no lo repercute, o la factura que se rectifica no lo llevaba), si la
 * factura no va en euros y, sin bloquear, si la venta sale de España con IEEPNR
 * (exportación o entrega intracomunitaria).
 */

/** Por qué el IEEPNR sale a 0 aunque haya kg: los ajustes de la empresa o la factura que se rectifica. */
export type SinIeepnr = 'ajustes' | 'original' | null;

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

export default function ResumenEnvases({
  resumen,
  pesoBruto,
  onPesoBruto,
  marca,
  tipoIeepnr,
  sinIeepnr,
  monedaNoEuro,
  ventaFuera = null,
  puedeConfigurar,
  fmt,
}: {
  resumen: Resumen;
  /** Texto de la casilla del peso bruto (kg). */
  pesoBruto: string;
  onPesoBruto: (v: string) => void;
  marca: (...campos: string[]) => { 'aria-invalid': boolean; 'aria-describedby'?: string };
  /** € por kg que se aplica (null si no hay IEEPNR). */
  tipoIeepnr: number | null;
  sinIeepnr: SinIeepnr;
  /** La factura va en otra moneda: el IEEPNR solo se repercute en euros. */
  monedaNoEuro: string | null;
  /** La venta sale de España: 'EXPORTACION' o 'INTRACOMUNITARIA' (null si no). */
  ventaFuera?: string | null;
  /** Puede cambiar Configuración > Facturación. */
  puedeConfigurar: boolean;
  fmt: (n: number) => string;
}) {
  const conKg = resumen.kgPlastico !== 0;
  const marcaPeso = marca('pesoBrutoKg');
  return (
    <section aria-labelledby="envases-titulo" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      <h2 id="envases-titulo" className="font-semibold text-slate-900">
        Resumen de envases
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="peso-bruto" className="mb-1 block text-sm font-medium text-slate-700">
            Peso bruto (kg)
          </label>
          <input
            id="peso-bruto"
            inputMode="decimal"
            className={campo}
            value={pesoBruto}
            onChange={(e) => onPesoBruto(e.target.value)}
            {...marcaPeso}
            aria-describedby={[marcaPeso['aria-describedby'], 'peso-bruto-ayuda'].filter(Boolean).join(' ')}
          />
          <p id="peso-bruto-ayuda" className="mt-1 text-xs text-slate-500">
            Opcional. Lo escribes tú y sale en el PDF.
          </p>
        </div>
        <dl className="contents">
          <Dato titulo="KG Plástico" valor={formatoCantidad(resumen.kgPlastico, 3)} />
          <Dato titulo="Packs" valor={formatoCantidad(resumen.packs, 0)} />
          <Dato titulo="Uds" valor={formatoCantidad(resumen.uds, 3)} />
          <Dato
            titulo="IEEPNR"
            valor={fmt(resumen.ieepnr)}
            nota={tipoIeepnr ? `${formatoCantidad(tipoIeepnr, 4)} € por kg` : undefined}
          />
        </dl>
      </div>
      {conKg && sinIeepnr && (
        <p role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {sinIeepnr === 'original' ? (
              'La factura que rectificas no llevaba IEEPNR: aquí tampoco se cobra, aunque haya kg.'
            ) : (
              <>
                Tu empresa no repercute el IEEPNR: sale a 0 aunque haya kg.{' '}
                {puedeConfigurar ? (
                  <>
                    Para cobrarlo, actívalo en{' '}
                    <Link href="/dashboard/configuracion/facturacion" className="font-medium underline">
                      Configuración &gt; Facturación
                    </Link>
                    .
                  </>
                ) : (
                  'Para cobrarlo, pide que lo activen en Configuración > Facturación.'
                )}
              </>
            )}
          </span>
        </p>
      )}
      {ventaFuera && resumen.ieepnr !== 0 && (
        <p role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Esta venta sale de España ({ventaFuera === 'EXPORTACION' ? 'exportación' : 'entrega intracomunitaria'}) y lleva IEEPNR. Los envases que salen de España no
            pagan este impuesto (Ley 7/2022): pregunta a tu gestoría si debes cobrárselo al cliente y si puedes pedir la devolución del que pagaste al comprarlos. Puedes
            guardarla igualmente.
          </span>
        </p>
      )}
      {monedaNoEuro && resumen.ieepnr !== 0 && (
        <p role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>El IEEPNR solo se repercute en euros y esta factura va en {monedaNoEuro}. Hazla en euros o quita los kg de plástico.</span>
        </p>
      )}
    </section>
  );
}

function Dato({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium text-slate-600">{titulo}</dt>
      <dd className="mt-0.5 font-mono text-base tabular-nums text-slate-900">{valor}</dd>
      {nota && <dd className="text-xs text-slate-500">{nota}</dd>}
    </div>
  );
}
