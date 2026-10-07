'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PencilSimple, Prohibit, X } from '@phosphor-icons/react';
import { getCompanyId, getUser, tieneAlgunPermiso } from '@/lib/auth';
import { ApiError, apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';
import { claseEstadoGasto, claseEstadoPago, esTipoGasto, fechaCorta, hoyIso, textoEstadoAsiento, TIPO_GASTO_INFO, type GastoDetalle } from '@/lib/compras';
import ContabilizarButton from '@/components/ContabilizarButton';
import CobrosFactura from '@/components/CobrosFactura';

export default function GastoDetailPage() {
  const gastoId = useParams().id as string;
  const companyId = getCompanyId();
  const user = getUser();
  const puedeEscribir = tieneAlgunPermiso(user, ['compras:write']);
  const puedePagar = tieneAlgunPermiso(user, ['compras:write', 'contabilidad:write']);
  const puedeContabilizar = tieneAlgunPermiso(user, ['contabilidad:write']);
  const veContabilidad = tieneAlgunPermiso(user, ['contabilidad:read', 'contabilidad:write']);

  const [gasto, setGasto] = useState<GastoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noExiste, setNoExiste] = useState(false);
  const [aviso, setAviso] = useState('');
  const [anulando, setAnulando] = useState(false);

  const loadGasto = useCallback(async () => {
    try {
      setGasto(await apiFetch<GastoDetalle>(companyPath(`/expense-invoices/${encodeURIComponent(gastoId)}`)));
      setError('');
      setNoExiste(false);
    } catch (err) {
      setError(errorMessage(err));
      setNoExiste(err instanceof ApiError && err.status === 404);
    } finally {
      setLoading(false);
    }
  }, [gastoId]);

  useEffect(() => {
    loadGasto();
  }, [loadGasto]);

  // Aviso tras guardar desde el alta o la modificacion (?guardada=1, ?modificada=1).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has('guardada')) setAviso('Factura guardada: ya está en la contabilidad y en el libro de IVA.');
    else if (p.has('modificada')) setAviso('Cambios guardados.');
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <div className="text-center text-slate-500">Cargando factura de gasto...</div>
      </div>
    );
  }

  if (!gasto) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
        <Link href="/dashboard/compras" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
          <ArrowLeft size={16} /> Volver a Compras
        </Link>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">{noExiste ? 'Factura de gasto no encontrada.' : error || 'No se pudo cargar la factura.'}</div>
      </div>
    );
  }

  const fmt = (n: number) => formatoImporte(Number(n) || 0, gasto.monedaCuenta);
  const anulada = gasto.estado === 'ANULADA';
  // Sin cuenta en las lineas, el asiento usa la del tipo de gasto.
  const cuenta =
    gasto.cuentaGasto ?? (gasto.lineas.some((l) => l.accountCode) ? 'Varias (ver líneas)' : esTipoGasto(gasto.tipoGasto) ? TIPO_GASTO_INFO[gasto.tipoGasto].cuenta : null);

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 md:p-6">
      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <Link href="/dashboard/compras" className="rounded-lg p-2 transition hover:bg-slate-100" aria-label="Volver a Compras">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Gasto {gasto.numeroCompleto}</h1>
          <p className="mt-1 break-words text-slate-600">
            Factura {gasto.numeroFacturaProveedor ?? <span className="italic">sin número del proveedor</span>} de{' '}
            <Link href={`/dashboard/proveedores/${gasto.supplier.id}`} className="font-medium text-blue-600 hover:underline">
              {gasto.supplier.nombreFiscal}
            </Link>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={claseEstadoGasto(gasto.estado)}>{gasto.estadoTexto}</span>
            {!anulada && <span className={claseEstadoPago(gasto.estadoPago, gasto.vencida)}>{gasto.estadoPagoTexto}</span>}
          </div>
        </div>
      </div>

      {aviso && (
        <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso('')} aria-label="Cerrar aviso" className="shrink-0">
            <X size={16} />
          </button>
        </div>
      )}
      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>}

      {/* Acciones */}
      {puedeEscribir && !anulada && (
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {gasto.acciones.editar.permitido ? (
              <Link
                href={`/dashboard/compras/${gasto.id}/editar`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <PencilSimple size={16} /> Modificar
              </Link>
            ) : (
              <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-400">
                <PencilSimple size={16} /> Modificar
              </button>
            )}
            <button
              type="button"
              onClick={() => setAnulando(true)}
              disabled={!gasto.acciones.anular.permitido}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Prohibit size={16} /> Anular
            </button>
          </div>
          {!gasto.acciones.editar.permitido && gasto.acciones.editar.motivo && <p className="text-sm text-slate-600">{gasto.acciones.editar.motivo}</p>}
          {!gasto.acciones.anular.permitido && gasto.acciones.anular.motivo && gasto.acciones.anular.motivo !== gasto.acciones.editar.motivo && (
            <p className="text-sm text-slate-600">{gasto.acciones.anular.motivo}</p>
          )}
        </div>
      )}

      {/* Anulada */}
      {anulada && gasto.anulacion && (
        <div className="mb-6 rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Factura anulada el {fechaCorta(gasto.anulacion.fecha)}</p>
          {gasto.anulacion.motivo && <p className="mt-1 break-words">Motivo: {gasto.anulacion.motivo}</p>}
          {gasto.anulacion.contraasientoId &&
            (veContabilidad ? (
              <Link href={`/dashboard/motor-contable/${gasto.anulacion.contraasientoId}`} className="mt-1 inline-block font-semibold text-blue-600 hover:underline">
                Ver el contraasiento
              </Link>
            ) : (
              <p className="mt-1">Se hizo un contraasiento con esa fecha.</p>
            ))}
        </div>
      )}

      {/* Datos */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 md:p-6">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-600">Fecha de la factura</dt>
            <dd className="font-semibold text-slate-900">{fechaCorta(gasto.fechaEmision)}</dd>
          </div>
          {gasto.fechaRegistro && (
            <div>
              <dt className="text-sm text-slate-600">Fecha de registro</dt>
              <dd className="font-semibold text-slate-900">{fechaCorta(gasto.fechaRegistro)}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-slate-600">Vencimiento</dt>
            <dd className={`font-semibold ${gasto.vencida ? 'text-rose-700' : 'text-slate-900'}`}>{fechaCorta(gasto.fechaVencimiento) || '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Tipo de gasto</dt>
            <dd className="font-semibold text-slate-900">{gasto.tipoGastoTexto}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Cuenta</dt>
            <dd className="font-mono font-semibold text-slate-900">{cuenta ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Proveedor</dt>
            <dd className="break-words text-slate-900">
              {gasto.supplier.nombreFiscal}
              <span className="block font-mono text-sm text-slate-500">{gasto.supplier.nifCif}</span>
            </dd>
          </div>
        </dl>
        {gasto.observaciones && <p className="mt-4 whitespace-pre-line break-words border-t border-slate-200 pt-4 text-sm text-slate-700">{gasto.observaciones}</p>}
      </div>

      {/* Lineas */}
      <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 md:px-6">
          <h2 className="text-lg font-semibold text-slate-900">Conceptos</h2>
        </div>
        <table className="hidden w-full text-sm md:table">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-slate-700">Descripción</th>
              <th className="px-6 py-3 text-right font-semibold text-slate-700">Cantidad</th>
              <th className="px-6 py-3 text-right font-semibold text-slate-700">Precio</th>
              <th className="px-6 py-3 text-right font-semibold text-slate-700">Base</th>
              <th className="px-6 py-3 text-right font-semibold text-slate-700">IVA</th>
              <th className="px-6 py-3 text-right font-semibold text-slate-700">IRPF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {gasto.lineas.map((l) => (
              <tr key={l.id}>
                <td className="px-6 py-3 text-slate-900">
                  {l.descripcion}
                  {l.accountCode && !gasto.cuentaGasto && <span className="ml-2 font-mono text-xs text-slate-500">{l.accountCode}</span>}
                </td>
                <td className="px-6 py-3 text-right font-mono text-slate-700">{String(l.cantidad).replace('.', ',')}</td>
                <td className="px-6 py-3 text-right font-mono text-slate-700">{fmt(l.precioUnitario)}</td>
                <td className="px-6 py-3 text-right font-mono text-slate-700">{fmt(l.baseLine)}</td>
                <td className="px-6 py-3 text-right font-mono text-slate-700">
                  {l.tipoIva} % ({fmt(l.ivaImporte)})
                </td>
                <td className="px-6 py-3 text-right font-mono text-slate-700">{l.tipoRetencion > 0 ? `${l.tipoRetencion} % (${fmt(l.retencionImporte)})` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-slate-200 md:hidden">
          {gasto.lineas.map((l) => (
            <li key={l.id} className="px-4 py-3 text-sm">
              <p className="break-words font-medium text-slate-900">{l.descripcion}</p>
              <p className="text-slate-600">
                {String(l.cantidad).replace('.', ',')} × {fmt(l.precioUnitario)} = <span className="font-mono">{fmt(l.baseLine)}</span>
              </p>
              <p className="text-slate-600">
                IVA {l.tipoIva} %: {fmt(l.ivaImporte)}
                {l.tipoRetencion > 0 && ` · IRPF ${l.tipoRetencion} %: ${fmt(l.retencionImporte)}`}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* Totales */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 md:p-6">
        <dl className="space-y-2 text-slate-900">
          <div className="flex justify-between">
            <dt>Base imponible</dt>
            <dd className="font-mono font-semibold">{fmt(gasto.baseTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>IVA soportado</dt>
            <dd className="font-mono font-semibold">{fmt(gasto.ivaTotal)}</dd>
          </div>
          {gasto.retencionTotal > 0 && (
            <div className="flex justify-between">
              <dt>Retención IRPF</dt>
              <dd className="font-mono font-semibold">−{fmt(gasto.retencionTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-300 pt-2 text-lg font-bold">
            <dt>Total a pagar</dt>
            <dd className="font-mono">{fmt(gasto.totalFactura)}</dd>
          </div>
          {!anulada && gasto.importePagado > 0 && (
            <div className="flex justify-between text-sm text-slate-600">
              <dt>Pendiente de pago</dt>
              <dd className="font-mono">{fmt(gasto.importePendiente)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Contabilizacion */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="mb-3 font-semibold text-slate-900">Contabilización</h2>
        {gasto.asiento ? (
          <p className="text-sm text-slate-700">
            Asiento{' '}
            {veContabilidad ? (
              <Link href={`/dashboard/motor-contable/${gasto.asiento.id}`} className="font-mono font-semibold text-blue-600 hover:underline">
                {gasto.asiento.numeroAsiento}
              </Link>
            ) : (
              <span className="font-mono font-semibold">{gasto.asiento.numeroAsiento}</span>
            )}{' '}
            · {textoEstadoAsiento(gasto.asiento.estado)} · {fechaCorta(gasto.asiento.fecha)}
          </p>
        ) : (
          !gasto.acciones.contabilizar && <p className="text-sm text-slate-600">Sin asiento.</p>
        )}
        {gasto.asiento && (gasto.asiento.estado === 'DRAFT' || gasto.asiento.estado === 'PENDING_REVIEW') && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Pendiente de revisar: aprueba el asiento en el Motor contable para que cuente en el IVA y en los modelos.
          </p>
        )}
        {gasto.acciones.contabilizar && (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-slate-600">Esta factura se registró antes de que el alta la contabilizara sola. Contabilízala para que entre en el libro de IVA.</p>
            {puedeContabilizar && companyId ? (
              <ContabilizarButton invoiceId={gastoId} companyId={companyId} tipo="GASTO" onSuccess={() => loadGasto()} />
            ) : (
              <p className="text-sm text-slate-500">Para contabilizarla hace falta el permiso de escritura en Contabilidad.</p>
            )}
          </div>
        )}
      </div>

      {/* Pagos: no en borradores del lector ni en anuladas */}
      {gasto.totalFactura > 0 && gasto.estado !== 'DRAFT' && !anulada && (
        <div className="mb-6">
          <CobrosFactura tipo="GASTO" facturaId={gastoId} puedeEditar={puedePagar} fechaFactura={gasto.fechaEmision} onCambio={loadGasto} />
        </div>
      )}

      {anulando && (
        <ModalAnular
          gasto={gasto}
          onCerrar={() => setAnulando(false)}
          onAnulada={(contraasiento) => {
            setAnulando(false);
            setAviso(contraasiento ? 'Factura anulada con un contraasiento: el libro de IVA y los modelos la restan en el periodo de la anulación.' : 'Factura anulada: su asiento y su anotación en el libro de IVA quedan sin efecto.');
            loadGasto();
          }}
        />
      )}
    </div>
  );
}

function ModalAnular({ gasto, onCerrar, onAnulada }: { gasto: GastoDetalle; onCerrar: () => void; onAnulada: (contraasiento: boolean) => void }) {
  const conContraasiento = gasto.acciones.anular.conContraasiento;
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [campo, setCampo] = useState<string | undefined>();

  const anular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivo.trim().length < 3) {
      setError('Indica el motivo de la anulación.');
      setCampo('motivo');
      return;
    }
    setGuardando(true);
    setError('');
    setCampo(undefined);
    try {
      const r = await apiFetch<{ contraasiento: boolean }>(companyPath(`/expense-invoices/${encodeURIComponent(gasto.id)}/anular`), {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim(), ...(conContraasiento && fecha ? { fecha } : {}) }),
      });
      onAnulada(!!r?.contraasiento);
    } catch (err) {
      setError(errorMessage(err));
      setCampo(campoDelError(err));
    } finally {
      setGuardando(false);
    }
  };

  const campoCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onCerrar}>
      <form
        onSubmit={anular}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anular-titulo"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="anular-titulo" className="text-lg font-semibold text-slate-900">
            Anular el gasto {gasto.numeroCompleto}
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1.5 text-slate-500 hover:text-slate-900">
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          {conContraasiento
            ? 'El periodo de la factura está cerrado o declarado: se hará un contraasiento con esta fecha, que resta la factura en el libro de IVA y en los modelos de ese periodo.'
            : 'Su asiento y su anotación en el libro de IVA quedan sin efecto. Después podrás registrarla de nuevo con el mismo número si hace falta.'}
        </p>
        <label htmlFor="anular-motivo" className="mb-1 block text-sm font-medium text-slate-700">
          Motivo *
        </label>
        <textarea id="anular-motivo" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-invalid={campo === 'motivo'} className={campoCls} />
        {conContraasiento && (
          <div className="mt-4">
            <label htmlFor="anular-fecha" className="mb-1 block text-sm font-medium text-slate-700">
              Fecha del contraasiento
            </label>
            <input id="anular-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-invalid={campo === 'fecha'} className={campoCls} />
          </div>
        )}
        {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCerrar} className="flex-1 rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="flex-1 rounded-lg bg-rose-600 py-2.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
            {guardando ? 'Anulando...' : 'Anular factura'}
          </button>
        </div>
      </form>
    </div>
  );
}
