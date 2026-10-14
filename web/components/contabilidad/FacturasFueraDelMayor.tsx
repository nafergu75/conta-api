'use client';

import Link from 'next/link';
import { WarningCircle } from '@phosphor-icons/react';
import { fecha, importe } from '@/app/dashboard/informes/TablaInforme';

/**
 * Aviso del mayor de un cliente o proveedor: sus facturas que el mayor no
 * cuenta porque no tienen asiento o lo tienen en borrador (el mayor solo lee
 * asientos aprobados). Cada una con su enlace: a la factura para
 * «Contabilizar» o al Motor contable para aprobar el asiento. Así se entiende
 * que el mayor diga 0 y facturación diga que hay algo pendiente (caso real:
 * NZ004_26, 13-10-2026).
 *
 * Lo devuelven GET /informes-contables/terceros/:tipo/:id y
 * GET /informes-contables/mayor?tercero= (`facturasFueraDelMayor`); el
 * servidor pone además una nota con el mismo contenido en la tabla (para el
 * PDF y el Excel), que en pantalla se quita con esNotaFueraDelMayor.
 */

export interface FacturaFueraDelMayor {
  id: string;
  tipo: 'venta' | 'gasto';
  numeroCompleto: string | null;
  /** AAAA-MM-DD */
  fechaEmision: string;
  totalFactura: number;
  /** SIN_ASIENTO: no se ha contabilizado. BORRADOR: su asiento espera a que se apruebe. */
  estadoContable: 'SIN_ASIENTO' | 'BORRADOR';
  asientoId: string | null;
  accion: 'CONTABILIZAR' | 'APROBAR';
  /** /dashboard/facturas/:id, /dashboard/compras/:id o /dashboard/motor-contable/:asientoId */
  enlace: string;
}

/** La nota que el servidor pone en la tabla con lo mismo («Una factura no sale en este mayor…»). */
export const esNotaFueraDelMayor = (nota: string) => /^(Una factura no sale|\d+ facturas no salen) en este mayor/.test(nota);

/** Solo enlaces de la propia app (el servidor siempre los da así). */
const enlaceSeguro = (e: string) => (e.startsWith('/dashboard/') ? e : null);

interface Props {
  facturas: FacturaFueraDelMayor[];
  /**
   * Más pequeño, para el bloque «Contabilidad» de la ficha: allí habla del saldo
   * contable («no sale en el saldo»), no del mayor.
   */
  compacto?: boolean;
  /** Símbolo detrás de los importes (vacío: sin símbolo, como el saldo de la ficha). */
  simbolo?: string;
}

export function FacturasFueraDelMayor({ facturas, compacto = false, simbolo = '€' }: Props) {
  if (!facturas.length) return null;
  const sin = facturas.filter((f) => f.estadoContable === 'SIN_ASIENTO').length;
  const borrador = facturas.length - sin;
  const una = facturas.length === 1;
  const que = [
    sin ? (sin === 1 ? 'la que no tiene asiento se contabiliza desde la factura' : 'las que no tienen asiento se contabilizan desde la factura') : '',
    borrador ? (borrador === 1 ? 'la que lo tiene en borrador se aprueba en el Motor contable' : 'las que lo tienen en borrador se aprueban en el Motor contable') : '',
  ].filter(Boolean);
  const donde = compacto ? 'en el saldo contable' : 'en este mayor';
  const explicacion = `${compacto ? 'El saldo' : 'El mayor'} solo cuenta los asientos aprobados: ${que.join(' y ')}.`;

  return (
    <section
      aria-label={una ? 'Factura que no sale en el mayor' : 'Facturas que no salen en el mayor'}
      className={`rounded-lg border border-amber-200 bg-amber-50 text-amber-800 ${compacto ? 'p-3 text-xs' : 'p-4 text-sm'}`}
    >
      <p className="flex items-start gap-2 font-semibold">
        <WarningCircle size={compacto ? 16 : 18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{una ? `Una factura no sale ${donde}` : `${facturas.length} facturas no salen ${donde}`}</span>
      </p>
      <p className={compacto ? 'mt-0.5 pl-6' : 'mt-1 pl-[26px]'}>{explicacion}</p>
      <ul className={`mt-2 divide-y divide-amber-200 ${compacto ? 'pl-6' : 'pl-[26px]'}`}>
        {facturas.map((f) => {
          const numero = f.numeroCompleto || 'sin número';
          const enlace = enlaceSeguro(f.enlace);
          return (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <span className="min-w-0">
                <span className="font-mono font-medium">{numero}</span>
                <span className="block text-xs">
                  {fecha(f.fechaEmision)} · {f.estadoContable === 'SIN_ASIENTO' ? 'Sin asiento' : 'Asiento en borrador'}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="whitespace-nowrap font-mono tabular-nums">
                  {importe(f.totalFactura)}
                  {simbolo ? ` ${simbolo}` : ''}
                </span>
                {enlace && (
                  <Link href={enlace} className="inline-flex min-h-[44px] items-center font-semibold underline hover:no-underline sm:min-h-0">
                    {f.accion === 'CONTABILIZAR' ? 'Contabilizar' : 'Aprobar el asiento'}
                    <span className="sr-only"> de la factura {numero}</span>
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
