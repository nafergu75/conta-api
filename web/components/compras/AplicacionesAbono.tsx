'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowsLeftRight, X } from '@phosphor-icons/react';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte, parseImporte } from '@/lib/moneda';
import { type CompensacionGasto, fechaCorta, type GastoDetalle, hoyIso, type ListadoGastos } from '@/lib/compras';

/**
 * Aplicaciones de abonos de proveedor (CompensacionGasto), sin movimiento de dinero:
 *
 *  - En un abono: lo que se ha descontado de otras facturas del proveedor (la
 *    automática contra su original y las que se hacen aquí con «Aplicar a otra
 *    factura», también a una factura de fuera de la app).
 *  - En una factura: los abonos que le han restado.
 *
 * POST /expense-invoices/:abonoId/compensaciones y .../:cid/anular.
 */

const campoCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

const fechaContable = (g: GastoDetalle) => (g.fechaRegistro || g.fechaEmision || '').slice(0, 10);

export default function AplicacionesAbono({ gasto, puedeEditar, onCambio }: { gasto: GastoDetalle; puedeEditar: boolean; onCambio: () => void }) {
  const fmt = (n: number) => formatoImporte(n, gasto.monedaCuenta);
  const esAbono = gasto.totalFactura < 0;
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const aFavor = gasto.aFavor ?? 0;
  const lista = gasto.compensaciones ?? [];
  const puedeAplicar = esAbono && puedeEditar && gasto.estado === 'ACCOUNTED' && aFavor > 0;

  if (!esAbono && lista.length === 0) return null;

  const anular = async (c: CompensacionGasto) => {
    const otra = c.otra.numero ?? c.otra.numeroCompleto ?? 'la factura';
    const texto = esAbono ? `¿Anular la aplicación de ${fmt(c.importe)} a ${otra}?` : `¿Anular el abono ${otra} aplicado a esta factura por ${fmt(c.importe)}?`;
    if (!window.confirm(`${texto}\n\nLo aplicado vuelve a quedar a tu favor en el abono y pendiente de pago en la factura.`)) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      await apiFetch(companyPath(`/expense-invoices/${encodeURIComponent(c.abonoId)}/compensaciones/${encodeURIComponent(c.id)}/anular`), { method: 'POST', body: '{}' });
      setAviso('Aplicación anulada.');
      onCambio();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{esAbono ? 'Aplicado a otras facturas' : 'Abonos aplicados'}</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {esAbono ? (
              <>
                Lo que se descuenta de lo que le debes, sin movimiento de dinero ·{' '}
                <span className={`font-semibold ${aFavor > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>A tu favor: {fmt(aFavor)}</span>
              </>
            ) : (
              'Abonos del proveedor que han restado de lo pendiente de esta factura.'
            )}
          </p>
        </div>
        {puedeAplicar && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowsLeftRight size={16} /> Aplicar a otra factura
          </button>
        )}
      </div>
      {esAbono && gasto.estado === 'DRAFT' && <p className="mt-3 text-sm text-slate-600">Cuando apruebes su asiento, se descontará solo de la factura que rectifica.</p>}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {aviso}
        </p>
      )}

      {lista.length === 0 ? (
        esAbono && gasto.estado !== 'DRAFT' && <p className="mt-3 text-sm text-slate-500">Todavía no se ha aplicado a ninguna factura.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {lista.map((c) => {
            const anulada = c.estado !== 'ACTIVO';
            const nombre = c.otra.numero ?? c.otra.numeroCompleto ?? 'sin número';
            return (
              <li key={c.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-2 ${anulada ? 'text-slate-400' : ''}`}>
                <span className="w-24 tabular-nums">{fechaCorta(c.fecha)}</span>
                <span className={`w-28 text-right font-mono tabular-nums ${anulada ? 'line-through' : 'font-semibold text-slate-900'}`}>{fmt(c.importe)}</span>
                <span className="min-w-0 flex-1 break-words text-slate-600">
                  {esAbono ? 'A ' : 'Abono '}
                  {c.otra.id ? (
                    <Link href={`/dashboard/compras/${c.otra.id}`} className="font-medium text-blue-600 hover:underline">
                      {nombre}
                    </Link>
                  ) : (
                    <span className="font-medium">{nombre}</span>
                  )}
                  {c.otra.fecha ? ` del ${fechaCorta(c.otra.fecha)}` : ''}
                  {c.otra.fuera ? ' (de fuera de la app)' : ''}
                  <span className="text-slate-500"> · {c.origen === 'AUTO' ? 'automática, al contabilizar el abono' : 'a mano'}</span>
                </span>
                <span className="ml-auto">
                  {anulada ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">Anulada{c.anuladaEn ? ` el ${fechaCorta(c.anuladaEn)}` : ''}</span>
                  ) : (
                    puedeEditar && (
                      <button type="button" disabled={ocupado} onClick={() => anular(c)} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50">
                        Anular
                      </button>
                    )
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {abierto && (
        <ModalAplicar
          gasto={gasto}
          onCerrar={() => setAbierto(false)}
          onHecho={() => {
            setAbierto(false);
            setError('');
            setAviso('Abono aplicado: ya está descontado de lo que le debes en esa factura.');
            onCambio();
          }}
        />
      )}
    </section>
  );
}

function ModalAplicar({ gasto, onCerrar, onHecho }: { gasto: GastoDetalle; onCerrar: () => void; onHecho: () => void }) {
  const fmt = (n: number) => formatoImporte(n, gasto.monedaCuenta);
  const aFavor = gasto.aFavor ?? 0;
  const [facturas, setFacturas] = useState<ListadoGastos['items'] | null>(null);
  const [destino, setDestino] = useState<string>(''); // id de la factura o 'FUERA'
  const [numeroFuera, setNumeroFuera] = useState('');
  const [fechaFuera, setFechaFuera] = useState('');
  // Vacio = el propuesto (lo que quede del abono y de la factura elegida); se escribe otro si se quiere.
  const [importe, setImporte] = useState<string | null>(null);
  const [fecha, setFecha] = useState(() => {
    const h = hoyIso();
    return h < fechaContable(gasto) ? fechaContable(gasto) : h;
  });
  const [error, setError] = useState('');
  const [campo, setCampo] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  // Facturas del mismo proveedor con algo pendiente de pago.
  useEffect(() => {
    let vivo = true;
    apiFetch<ListadoGastos>(companyPath(`/expense-invoices?supplierId=${encodeURIComponent(gasto.supplier.id)}&tipo=facturas&pago=por_pagar&limit=100`))
      .then((r) => {
        if (!vivo) return;
        const ls = r.items.filter((f) => f.id !== gasto.id && f.estado !== 'DRAFT' && f.estado !== 'ANULADA' && f.importePendiente > 0);
        setFacturas(ls);
        setDestino(ls[0]?.id ?? 'FUERA');
      })
      .catch((e) => {
        if (!vivo) return;
        setFacturas([]);
        setDestino('FUERA');
        setError(errorMessage(e));
      });
    return () => {
      vivo = false;
    };
  }, [gasto.id, gasto.supplier.id]);

  // Importe propuesto: lo que quede del abono y de la factura elegida.
  const elegida = facturas?.find((f) => f.id === destino) ?? null;
  const tope = elegida ? Math.min(aFavor, elegida.importePendiente) : aFavor;
  const importeMostrado = importe ?? (tope > 0 ? tope.toFixed(2).replace('.', ',') : '');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const aplicar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCampo(undefined);
    const valor = parseImporte(importeMostrado);
    if (!(valor > 0)) {
      setCampo('importe');
      return setError('Indica un importe mayor que cero.');
    }
    if (Math.round(valor * 100) > Math.round(tope * 100)) {
      setCampo('importe');
      return setError(`El importe no puede pasar de ${fmt(tope)}.`);
    }
    if (destino === 'FUERA' && !numeroFuera.trim()) {
      setCampo('numeroFuera');
      return setError('Escribe el número de la factura de fuera de la app.');
    }
    if (destino === 'FUERA' && !fechaFuera) {
      setCampo('fechaFuera');
      return setError('Indica la fecha de esa factura.');
    }
    setEnviando(true);
    try {
      await apiFetch(companyPath(`/expense-invoices/${encodeURIComponent(gasto.id)}/compensaciones`), {
        method: 'POST',
        body: JSON.stringify({ ...(destino === 'FUERA' ? { numeroFuera: numeroFuera.trim(), fechaFuera } : { facturaId: destino }), importe: valor, fecha }),
      });
      onHecho();
    } catch (err) {
      setError(errorMessage(err));
      setCampo(campoDelError(err));
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCerrar}>
      <form
        onSubmit={aplicar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aplicar-titulo"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <h2 id="aplicar-titulo" className="text-lg font-semibold text-slate-900">
            Aplicar el abono a otra factura
          </h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Quedan <span className="font-semibold">{fmt(aFavor)}</span> a tu favor. Se descuentan de lo que le debes en otra factura de {gasto.supplier.nombreFiscal}, sin movimiento de dinero.
        </p>

        <fieldset className="space-y-2">
          <legend className="mb-1 block text-sm font-medium text-slate-700">¿A qué factura?</legend>
          {facturas === null ? (
            <p className="text-sm text-slate-500">Buscando sus facturas pendientes…</p>
          ) : (
            <>
              {facturas.length === 0 && <p className="text-sm text-slate-500">Este proveedor no tiene otras facturas pendientes de pago en la app.</p>}
              {facturas.map((f) => (
                <label key={f.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${destino === f.id ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="aplicar-destino" checked={destino === f.id} onChange={() => { setDestino(f.id); setImporte(null); }} className="mt-0.5 accent-emerald-600" />
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900">{f.numeroFacturaProveedor ?? f.numeroCompleto}</span>
                    <span className="block text-xs text-slate-500">
                      {fechaCorta(f.fechaEmision)} · registro {f.numeroCompleto} · pendiente {fmt(f.importePendiente)}
                    </span>
                  </span>
                </label>
              ))}
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${destino === 'FUERA' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="aplicar-destino" checked={destino === 'FUERA'} onChange={() => { setDestino('FUERA'); setImporte(null); }} className="mt-0.5 accent-emerald-600" />
                <span>
                  <span className="font-medium text-slate-900">Una factura de fuera de la app</span>
                  <span className="block text-xs text-slate-500">Por ejemplo, una de 2026 que llevaste fuera y que le pagaste con el abono ya restado.</span>
                </span>
              </label>
            </>
          )}
        </fieldset>

        {destino === 'FUERA' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="aplicar-num" className="mb-1 block text-sm font-medium text-slate-700">
                Nº de la factura
              </label>
              <input id="aplicar-num" value={numeroFuera} maxLength={60} onChange={(e) => setNumeroFuera(e.target.value)} aria-invalid={campo === 'numeroFuera'} className={campoCls} />
            </div>
            <div>
              <label htmlFor="aplicar-fechafuera" className="mb-1 block text-sm font-medium text-slate-700">
                Su fecha
              </label>
              <input id="aplicar-fechafuera" type="date" value={fechaFuera} onChange={(e) => setFechaFuera(e.target.value)} aria-invalid={campo === 'fechaFuera'} className={campoCls} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="aplicar-importe" className="mb-1 block text-sm font-medium text-slate-700">
              Importe
            </label>
            <input id="aplicar-importe" inputMode="decimal" value={importeMostrado} onChange={(e) => setImporte(e.target.value)} aria-invalid={campo === 'importe'} className={`${campoCls} text-right font-mono`} />
          </div>
          <div>
            <label htmlFor="aplicar-fecha" className="mb-1 block text-sm font-medium text-slate-700">
              Fecha
            </label>
            <input id="aplicar-fecha" type="date" min={fechaContable(gasto)} value={fecha} onChange={(e) => setFecha(e.target.value)} aria-invalid={campo === 'fecha'} className={campoCls} />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando || facturas === null}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {enviando ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </form>
    </div>
  );
}
