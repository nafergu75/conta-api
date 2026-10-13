'use client';

import { useState } from 'react';
import Link from 'next/link';
import { WarningCircle, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';
import type { EstadoRedSeguridad } from '@/lib/verifactu';

/**
 * Rectificativas de venta con el servidor anterior (solo durante la publicación).
 *
 * Si esta pantalla llega a producción antes que el servidor nuevo (o el
 * servidor vuelve a una versión anterior), las rutas de las rectificativas
 * nuevas no existen (ver esServidorAnterior en lib/rectificativasVenta.ts).
 * Para no dejar las ventas sin rectificativas, se usa lo de siempre:
 *  - en la ficha, «Hacer rectificativa» anula la factura entera (POST /:id/credit-note);
 *  - en «Nueva factura», el abono de una factura de fuera de la app (enlace
 *    «Abono» de las facturas de 2026 pendientes) va con rectificaFuera,
 *    tipoRectificativa y motivoRectificacion.
 * Cuando el servidor nuevo esté publicado, este fichero y sus usos se pueden quitar.
 */

const TIPOS_RECTIFICATIVA = [
  ['R1', 'R1 — Error fundado en derecho o art. 80 Uno, Dos y Seis LIVA'],
  ['R2', 'R2 — Concurso de acreedores (art. 80.Tres)'],
  ['R3', 'R3 — Crédito incobrable (art. 80.Cuatro)'],
  ['R4', 'R4 — Resto de causas'],
] as const;
/** Solo para rectificar una simplificada (F2). */
const TIPO_R5 = ['R5', 'R5 — Rectificativa de una factura simplificada'] as const;

const boton =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
const etiqueta = 'mb-1 block text-sm font-medium text-slate-700';

/** Lo que usa el modal de la factura que se rectifica. */
export interface FacturaParaAnular {
  id: string;
  numeroCompleto: string | null;
  tipoFactura: string;
  totalFactura: number;
  totalFacturaDoc?: number;
  moneda?: string;
  monedaCuenta?: string;
}

/**
 * Rectificativa que anula la factura entera (por diferencias: las mismas
 * lineas en negativo), como antes de las rectificativas nuevas. Para corregir
 * solo una parte, despues se emite una factura nueva con los datos buenos.
 */
export function ModalRectificativaAnterior({
  factura,
  redSeguridad,
  onCerrar,
  onCreada,
}: {
  factura: FacturaParaAnular;
  redSeguridad: EstadoRedSeguridad | null;
  onCerrar: () => void;
  onCreada: (id: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  // R5 solo rectifica una simplificada (F2): es su causa por defecto.
  const simplificada = factura.tipoFactura === 'F2';
  const [tipo, setTipo] = useState(simplificada ? 'R5' : 'R1');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Sin VERI*FACTU activo (desde el 1-1-2027) la rectificativa se guarda como borrador.
  const bloqueada = !!redSeguridad?.bloquea;
  const tipos: ReadonlyArray<readonly [string, string]> = simplificada ? [...TIPOS_RECTIFICATIVA, TIPO_R5] : TIPOS_RECTIFICATIVA;
  const importe = formatoImporte(-(factura.totalFacturaDoc ?? factura.totalFactura), factura.moneda ?? 'EUR');
  const mismoTipo = factura.moneda && factura.monedaCuenta && factura.moneda !== factura.monedaCuenta ? ', con el mismo tipo de cambio' : '';

  const crear = async () => {
    if (!motivo.trim()) return setError('Indica el motivo de la rectificación.');
    setEnviando(true);
    setError('');
    try {
      const { invoice } = await apiFetch<{ invoice: { id: string } }>(companyPath(`/income-invoices/${factura.id}/credit-note`), {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim(), tipoFactura: tipo, tipoRectificativa: 'I', ...(bloqueada ? { borrador: true } : {}) }),
      });
      onCreada(invoice.id);
    } catch (e) {
      setError(errorMessage(e));
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-rect">
      <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 id="titulo-rect" className="text-lg font-semibold text-slate-900">
            Rectificar la factura {factura.numeroCompleto}
          </h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {bloqueada ? (
          // Sin VERI*FACTU no se emite: el texto dice lo que va a pasar de verdad.
          <p className="text-sm text-slate-600">
            Se guardará como borrador una rectificativa que anula esta factura por completo ({importe}
            {mismoTipo}). La podrás emitir cuando VERI*FACTU esté activo.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Se emitirá una factura rectificativa en la serie de rectificativas que anula esta por completo ({importe}
            {mismoTipo}). Si solo había que corregir algo, después emite una factura nueva con los datos buenos.
          </p>
        )}
        <div>
          <label htmlFor="tipo-rect" className={etiqueta}>
            Causa
          </label>
          <select id="tipo-rect" value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
            {tipos.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="motivo-rect" className={etiqueta}>
            Motivo
          </label>
          <textarea
            id="motivo-rect"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: error en el precio de la línea 2; devolución de la mercancía…"
            className={campo}
          />
        </div>
        {bloqueada && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Esta empresa todavía no tiene VERI*FACTU activo, así que la rectificativa no se emite ahora.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={boton}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={crear}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {bloqueada ? (enviando ? 'Guardando…' : 'Guardar como borrador') : enviando ? 'Emitiendo…' : 'Emitir rectificativa'}
          </button>
        </div>
      </div>
    </div>
  );
}

type Marca = (...campos: string[]) => { 'aria-invalid': boolean; 'aria-describedby'?: string };

/**
 * Abono de una factura de fuera de la app con el servidor anterior: su número,
 * su fecha y el motivo. Las líneas se escriben a mano (en negativo lo que baja).
 * En un borrador ya guardado no se cambian (el servidor anterior no lo deja).
 */
export function BloqueRectificaFueraAnterior({
  numero,
  fecha,
  motivo,
  guardada,
  marca,
  onCambio,
}: {
  numero: string;
  fecha: string;
  motivo: string;
  guardada: boolean;
  marca: Marca;
  onCambio: (c: { numero?: string; fecha?: string; motivo?: string }) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="rf-titulo">
      <div>
        <h2 id="rf-titulo" className="font-semibold text-slate-900">
          Factura que rectificas
        </h2>
        <p className="mt-1 text-sm text-slate-700">
          Es de antes de llevar la facturación en la app (por ejemplo, una de las que trajo la gestoría). En las líneas, escribe solo lo que cambia: en
          negativo lo que baja, como una devolución o un descuento.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta} htmlFor="rf-numero">
            Número de la factura
          </label>
          <input
            id="rf-numero"
            className={campo}
            value={numero}
            maxLength={60}
            disabled={guardada}
            onChange={(e) => onCambio({ numero: e.target.value })}
            {...marca('rectificaFuera', 'rectificaFuera.numero', 'rectificativa.originales.0.numero')}
          />
        </div>
        <div>
          <label className={etiqueta} htmlFor="rf-fecha">
            Fecha de la factura
          </label>
          <input
            id="rf-fecha"
            type="date"
            className={campo}
            value={fecha}
            disabled={guardada}
            onChange={(e) => onCambio({ fecha: e.target.value })}
            {...marca('rectificaFuera.fecha', 'rectificativa.originales.0.fecha')}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={etiqueta} htmlFor="rf-motivo">
            Motivo de la rectificación
          </label>
          <textarea
            id="rf-motivo"
            className={campo}
            rows={2}
            maxLength={500}
            value={motivo}
            disabled={guardada}
            placeholder="Por ejemplo: devolución de parte del pedido"
            onChange={(e) => onCambio({ motivo: e.target.value })}
            {...marca('motivoRectificacion', 'rectificativa.explicacion')}
          />
        </div>
      </div>
    </section>
  );
}

/** Rectificativa que el servidor anterior no sabe hacer desde aquí: se dice dónde hacerla. */
export function AvisoServidorAnterior({ facturaId }: { facturaId: string | null }) {
  return (
    <section role="alert" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">Esta forma de hacer rectificativas todavía no está disponible.</p>
        <p>
          Estamos actualizando el programa. Mientras tanto, hazlo desde la ficha de la factura: «Hacer rectificativa» o, si ya es un borrador de
          rectificativa, «Emitir rectificativa».{' '}
          {facturaId ? (
            <Link href={`/dashboard/facturas/${encodeURIComponent(facturaId)}`} className="font-medium underline">
              Ir a la factura
            </Link>
          ) : (
            <Link href="/dashboard/facturas" className="font-medium underline">
              Ir a las facturas
            </Link>
          )}
        </p>
      </div>
    </section>
  );
}
