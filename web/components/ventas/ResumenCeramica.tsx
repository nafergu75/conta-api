'use client';

import { formatoCantidad, leerCantidad } from '@/lib/plantillasFactura';
import type { ResumenCeramica as Resumen } from '@/lib/ceramica';

/**
 * Resumen bajo las líneas de una factura con la plantilla B (cerámica), como
 * la fila de totales de la factura NZ013_2026: los palets, las cajas, los m² y
 * las piezas de las líneas (los suma la app), y el peso neto y el peso bruto,
 * que se escriben a mano. Si las líneas llevan peso, su suma se ofrece para el
 * peso neto. Si el neto pasa del bruto, se avisa (no bloquea).
 */

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

type Marca = (...campos: string[]) => { 'aria-invalid': boolean; 'aria-describedby'?: string };

export default function ResumenCeramica({
  resumen,
  pesoNeto,
  onPesoNeto,
  pesoBruto,
  onPesoBruto,
  marca,
}: {
  resumen: Resumen;
  /** Textos de las casillas del peso neto y del peso bruto (kg). */
  pesoNeto: string;
  onPesoNeto: (v: string) => void;
  pesoBruto: string;
  onPesoBruto: (v: string) => void;
  marca: Marca;
}) {
  const marcaNeto = marca('pesoNetoKg');
  const marcaBruto = marca('pesoBrutoKg');
  const sumaPesos = resumen.pesoKg !== 0 ? formatoCantidad(resumen.pesoKg, 3) : null;
  const neto = leerCantidad(pesoNeto);
  const bruto = leerCantidad(pesoBruto);
  const netoMayor = neto !== null && bruto !== null && Number.isFinite(neto) && Number.isFinite(bruto) && neto > bruto;
  return (
    <section aria-labelledby="ceramica-titulo" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      <h2 id="ceramica-titulo" className="font-semibold text-slate-900">
        Totales y pesos
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato titulo="Palets" valor={formatoCantidad(resumen.palets, 0)} />
        <Dato titulo="Cajas" valor={formatoCantidad(resumen.cajas, 0)} />
        <Dato titulo="M²" valor={formatoCantidad(resumen.metros2, 3)} />
        <Dato titulo="Piezas" valor={formatoCantidad(resumen.piezas, 3)} />
      </dl>
      <p className="text-xs text-slate-500">Son la suma de las líneas y salen así en la fila de totales del PDF (sin los palets de madera que se cobran aparte).</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
        <div>
          <label htmlFor="peso-neto" className="mb-1 block text-sm font-medium text-slate-700">
            Peso neto (kg)
          </label>
          <input
            id="peso-neto"
            inputMode="decimal"
            className={campo}
            value={pesoNeto}
            onChange={(e) => onPesoNeto(e.target.value)}
            {...marcaNeto}
            aria-describedby={[marcaNeto['aria-describedby'], 'peso-neto-ayuda'].filter(Boolean).join(' ')}
          />
          <p id="peso-neto-ayuda" className="mt-1 text-xs text-slate-500">
            Opcional. Lo escribes tú.
            {sumaPesos && (
              <>
                {' '}
                Las líneas suman {sumaPesos} kg:{' '}
                <button type="button" className="font-medium text-blue-700 underline" onClick={() => onPesoNeto(String(resumen.pesoKg).replace('.', ','))}>
                  usar {sumaPesos}
                </button>
                .
              </>
            )}
          </p>
        </div>
        <div>
          <label htmlFor="peso-bruto" className="mb-1 block text-sm font-medium text-slate-700">
            Peso bruto (kg)
          </label>
          <input
            id="peso-bruto"
            inputMode="decimal"
            className={campo}
            value={pesoBruto}
            onChange={(e) => onPesoBruto(e.target.value)}
            {...marcaBruto}
            aria-describedby={[marcaBruto['aria-describedby'], 'peso-bruto-ayuda'].filter(Boolean).join(' ')}
          />
          <p id="peso-bruto-ayuda" className="mt-1 text-xs text-slate-500">
            Opcional. Con los palets y el embalaje.
          </p>
        </div>
      </div>
      {netoMayor && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 lg:max-w-xl">
          El peso neto es mayor que el bruto. Revísalos: el bruto es la mercancía más los palets y el embalaje.
        </p>
      )}
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium text-slate-600">{titulo}</dt>
      <dd className="mt-0.5 font-mono text-base tabular-nums text-slate-900">{valor}</dd>
    </div>
  );
}
