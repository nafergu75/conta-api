'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Clock, WarningCircle, type Icon as IconoPhosphor } from '@phosphor-icons/react';
import { ApiError, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { formatoImporte } from '@/lib/moneda';
import { fechaCorta } from '@/lib/compras';

interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName?: string;
  descripcion?: string;
  debe: number | string;
  haber: number | string;
  referencia?: string | null;
}

interface JournalEntry {
  id: string;
  numeroAsiento: string;
  fecha: string;
  descripcion: string;
  origen: string;
  estado: string;
  invoiceId?: string | null;
  invoiceType?: string | null;
  lineas?: JournalEntryLine[];
}

/** GET /accounting/journal-entries/:id responde { asiento, lineas, factura, validaciones, ... } sin sobre data. */
interface DetalleAsiento {
  asiento?: JournalEntry;
  lineas?: JournalEntryLine[];
  data?: JournalEntry;
  permitidoAprobar?: boolean;
}

const ESTADO_CONFIG: Record<string, { color: string; label: string; icon: IconoPhosphor }> = {
  DRAFT: { color: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Borrador', icon: Clock },
  PENDING_REVIEW: { color: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: 'Pendiente de revisar', icon: Clock },
  POSTED: { color: 'bg-green-50 text-green-700 border-green-200', label: 'En firme', icon: CheckCircle },
  REVERSED: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Anulado', icon: WarningCircle },
};

const ORIGEN: Record<string, string> = {
  FACTURA_INGRESO: 'Factura de venta',
  FACTURA_GASTO: 'Factura de gasto',
  TESORERIA: 'Tesorería',
  AJUSTE_MANUAL: 'Asiento manual',
};

const num = (v: unknown) => Number(v) || 0;
/** La fecha llega como ISO (DateTime): se toma el dia tal cual, sin pasar por la hora local. */
const fecha = (iso: string) => fechaCorta(String(iso ?? '').slice(0, 10)) || '—';

export default function AsientoDetailPage() {
  const params = useParams();
  const asientoId = params.id as string;

  const user = getUser();
  const puedeAprobar = tieneAlgunPermiso(user, ['contabilidad:write']);

  const [asiento, setAsiento] = useState<JournalEntry | null>(null);
  const [lineas, setLineas] = useState<JournalEntryLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noExiste, setNoExiste] = useState(false);
  const [approving, setApproving] = useState(false);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const r = await apiFetch<DetalleAsiento & Partial<JournalEntry>>(companyPath(`/accounting/journal-entries/${encodeURIComponent(asientoId)}`));
      // Antes se leia data.data || data y el asiento quedaba sin estado: la pantalla se rompia.
      const a = (r.asiento ?? r.data ?? r) as JournalEntry;
      setAsiento(a);
      setLineas(r.lineas ?? a.lineas ?? []);
      setError('');
      setNoExiste(false);
    } catch (err) {
      setError(errorMessage(err));
      setNoExiste(err instanceof ApiError && err.status === 404);
    } finally {
      setLoading(false);
    }
  }, [asientoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleApprove = async () => {
    if (!confirm('¿Aprobar este asiento? Quedará en firme.')) return;
    try {
      setApproving(true);
      setError('');
      await apiFetch(companyPath(`/accounting/journal-entries/${encodeURIComponent(asientoId)}/approve`), {
        method: 'POST',
        body: JSON.stringify({ observaciones: 'Aprobado desde el detalle del asiento' }),
      });
      setAviso(asiento?.origen === 'FACTURA_GASTO' ? 'Aprobado: la factura ya cuenta en el IVA y en los modelos.' : 'Aprobado: el asiento está en firme.');
      await cargar();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setApproving(false);
    }
  };

  if (loading && !asiento) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="text-center text-slate-500">Cargando asiento...</div>
      </div>
    );
  }

  if (!asiento) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <Link href="/dashboard/motor-contable" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
          <ArrowLeft size={16} /> Volver al Motor contable
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{noExiste ? 'Asiento no encontrado.' : error || 'No se pudo cargar el asiento.'}</div>
      </div>
    );
  }

  const config = ESTADO_CONFIG[asiento.estado] ?? { color: 'bg-slate-100 text-slate-700 border-slate-200', label: asiento.estado || 'Sin estado', icon: Clock };
  const Icon = config.icon;

  const totalDebe = lineas.reduce((sum, l) => sum + num(l.debe), 0);
  const totalHaber = lineas.reduce((sum, l) => sum + num(l.haber), 0);
  const cuadrado = Math.abs(totalDebe - totalHaber) < 0.005;
  const enlaceFactura = asiento.invoiceId
    ? asiento.invoiceType === 'GASTO' || asiento.origen === 'FACTURA_GASTO'
      ? `/dashboard/compras/${asiento.invoiceId}`
      : `/dashboard/facturas/${asiento.invoiceId}`
    : null;
  const aprobable = asiento.estado === 'DRAFT' || asiento.estado === 'PENDING_REVIEW';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/dashboard/motor-contable" className="p-2 hover:bg-slate-100 rounded-lg transition" aria-label="Volver al Motor contable">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Asiento</h1>
            <p className="text-slate-600 mt-1 font-mono break-all">{asiento.numeroAsiento}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border ${config.color}`}>
          <Icon size={16} />
          {config.label}
        </span>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">{error}</div>}
      {aviso && (
        <div role="status" className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md text-green-800">
          {aviso}
        </div>
      )}

      {/* Información general */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-slate-600">Fecha</p>
            <p className="font-semibold text-slate-900">{fecha(asiento.fecha)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600">Origen</p>
            <p className="font-semibold text-slate-900">{ORIGEN[asiento.origen] ?? asiento.origen}</p>
          </div>
          <div className="col-span-2">
            <p className="text-sm text-slate-600">Factura</p>
            {enlaceFactura ? (
              <Link href={enlaceFactura} className="font-semibold text-blue-600 hover:underline">
                Ver la factura
              </Link>
            ) : (
              <p className="text-slate-500">—</p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm text-slate-600">Descripción</p>
          <p className="text-slate-900 mt-1 break-words">{asiento.descripcion}</p>
        </div>
        {asiento.origen === 'FACTURA_GASTO' && (
          <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Para cambiar importes o cuentas, modifica la factura: así el libro de IVA se rehace también.
          </p>
        )}
      </div>

      {/* Líneas del asiento */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6">
        <div className="px-4 md:px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Líneas</h2>
        </div>
        {/* Escritorio: tabla. Móvil: tarjetas (sin scroll horizontal). */}
        <table className="hidden md:table w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-slate-700">Cuenta</th>
              <th className="px-6 py-3 text-left font-semibold text-slate-700">Descripción</th>
              <th className="px-6 py-3 text-right font-semibold text-slate-700">Debe</th>
              <th className="px-6 py-3 text-right font-semibold text-slate-700">Haber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {lineas.map((linea) => (
              <tr key={linea.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-mono font-semibold text-slate-900">{linea.accountCode}</td>
                <td className="px-6 py-3 text-slate-700">{linea.accountName || linea.descripcion || '—'}</td>
                <td className="px-6 py-3 text-right font-mono text-slate-700">{num(linea.debe) !== 0 ? formatoImporte(num(linea.debe), 'EUR', { sinSimbolo: true }) : '—'}</td>
                <td className="px-6 py-3 text-right font-mono text-slate-700">{num(linea.haber) !== 0 ? formatoImporte(num(linea.haber), 'EUR', { sinSimbolo: true }) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold">
            <tr>
              <td colSpan={2} className="px-6 py-3 text-slate-900">
                Totales
              </td>
              <td className="px-6 py-3 text-right font-mono text-slate-900">{formatoImporte(totalDebe, 'EUR', { sinSimbolo: true })}</td>
              <td className="px-6 py-3 text-right font-mono text-slate-900">{formatoImporte(totalHaber, 'EUR', { sinSimbolo: true })}</td>
            </tr>
          </tfoot>
        </table>
        <ul className="md:hidden divide-y divide-slate-200">
          {lineas.map((linea) => (
            <li key={linea.id} className="px-4 py-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-mono font-semibold text-slate-900">{linea.accountCode}</span>
                <span className="font-mono text-slate-900">
                  {num(linea.debe) !== 0 ? `Debe ${formatoImporte(num(linea.debe), 'EUR', { sinSimbolo: true })}` : `Haber ${formatoImporte(num(linea.haber), 'EUR', { sinSimbolo: true })}`}
                </span>
              </div>
              <p className="text-slate-600 break-words">{linea.accountName || linea.descripcion || '—'}</p>
            </li>
          ))}
          <li className="px-4 py-3 text-sm font-semibold text-slate-900 bg-slate-50">
            Debe {formatoImporte(totalDebe, 'EUR', { sinSimbolo: true })} · Haber {formatoImporte(totalHaber, 'EUR', { sinSimbolo: true })}
          </li>
        </ul>
      </div>

      {/* Cuadre */}
      <div className={`border rounded-lg p-4 mb-6 ${cuadrado ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center gap-2">
          {cuadrado ? <CheckCircle size={20} className="text-green-600" /> : <WarningCircle size={20} className="text-red-600" />}
          <h3 className={`font-semibold ${cuadrado ? 'text-green-900' : 'text-red-900'}`}>{cuadrado ? 'El asiento cuadra' : 'El asiento no cuadra'}</h3>
        </div>
        {!cuadrado && <p className="mt-1 text-red-800">Diferencia: {formatoImporte(Math.abs(totalDebe - totalHaber), 'EUR')}</p>}
      </div>

      {/* Acciones */}
      {aprobable && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <p className="text-sm text-amber-900">
            {asiento.origen === 'FACTURA_GASTO'
              ? 'Asiento en borrador: la factura no cuenta en el IVA ni en los modelos hasta que lo apruebes.'
              : 'Asiento en borrador: no cuenta en la contabilidad hasta que lo apruebes.'}
          </p>
          {puedeAprobar ? (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              {approving ? 'Aprobando...' : 'Aprobar asiento'}
            </button>
          ) : (
            <p className="text-sm text-amber-900">Para aprobarlo hace falta el permiso de escritura en Contabilidad.</p>
          )}
        </div>
      )}

      {asiento.estado === 'POSTED' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-900">
          <p className="font-semibold">Asiento en firme: cuenta en la contabilidad.</p>
        </div>
      )}
    </div>
  );
}
