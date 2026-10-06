'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, FilePdf, PencilSimple, Receipt, Trash, X } from '@phosphor-icons/react';
import ContabilizarButton from '@/components/ContabilizarButton';
import { AvisosFactura } from './AvisosFactura';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getCompanyId, getUser, tieneAlgunPermiso } from '@/lib/auth';

interface Linea {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje: number;
  baseLine: number;
  tipoIva: number;
  ivaImporte: number;
  tipoRetencion: number;
  retencionImporte: number;
}

interface Factura {
  id: string;
  customerId: string;
  serie: string;
  numeroCompleto: string | null;
  estadoDocumento: 'BORRADOR' | 'FINAL';
  tipoFactura: string;
  formaPago?: string;
  tipoRectificativa?: string;
  motivoRectificacion?: string;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  baseTotal: number;
  ivaTotal: number;
  retencionTotal: number;
  totalFactura: number;
  observaciones?: string;
  esRectificativa: boolean;
  facturaOriginalId?: string;
  lineas: Linea[];
}

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
}

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES') : '');

const ESTADO_COBRO: Record<string, { texto: string; clase: string }> = {
  PENDING: { texto: 'Pendiente de cobro', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
  OVERDUE: { texto: 'Vencida', clase: 'bg-red-50 text-red-700 border-red-200' },
  PAID: { texto: 'Cobrada', clase: 'bg-green-50 text-green-800 border-green-200' },
  ACCOUNTED: { texto: 'Contabilizada', clase: 'bg-blue-50 text-blue-800 border-blue-200' },
};

const FORMA_PAGO: Record<string, string> = {
  TRANSFERENCIA: 'Transferencia bancaria',
  GIRO: 'Giro / recibo domiciliado',
  CONTADO: 'Contado',
};

const TIPOS_RECTIFICATIVA = [
  ['R1', 'R1 — Error fundado en derecho o art. 80 Uno, Dos y Seis LIVA'],
  ['R2', 'R2 — Concurso de acreedores (art. 80.Tres)'],
  ['R3', 'R3 — Crédito incobrable (art. 80.Cuatro)'],
  ['R4', 'R4 — Resto de causas'],
] as const;

const boton =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export default function FacturaDetallePage() {
  const router = useRouter();
  const id = useParams().id as string;
  const puedeEditar = tieneAlgunPermiso(getUser(), ['ventas:write']);

  const [factura, setFactura] = useState<Factura | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [original, setOriginal] = useState<Factura | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [rectificando, setRectificando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { invoice } = await apiFetch<{ invoice: Factura }>(companyPath(`/income-invoices/${id}`));
      setFactura(invoice);
      const [cli, orig] = await Promise.all([
        apiFetch<Cliente>(companyPath(`/clientes/${invoice.customerId}`)).catch(() => null),
        invoice.facturaOriginalId
          ? apiFetch<{ invoice: Factura }>(companyPath(`/income-invoices/${invoice.facturaOriginalId}`))
              .then((r) => r.invoice)
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      setCliente(cli && 'nombreFiscal' in cli ? cli : null);
      setOriginal(orig);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (fn: () => Promise<void>, mensaje?: string) => {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      await fn();
      if (mensaje) setAviso(mensaje);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  if (cargando) return <p className="p-6 text-slate-500">Cargando factura…</p>;
  if (!factura) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error || 'Factura no encontrada.'}</p>
        <Link href="/dashboard/facturas" className="mt-3 inline-block text-blue-700 underline">Volver a facturas</Link>
      </div>
    );
  }

  const esBorrador = factura.estadoDocumento === 'BORRADOR';
  const cobro = ESTADO_COBRO[factura.estado];
  const titulo = esBorrador ? 'Borrador de factura' : `${factura.esRectificativa ? 'Rectificativa' : 'Factura'} ${factura.numeroCompleto}`;

  const emitir = () => {
    if (!window.confirm(`Vas a emitir la factura por ${eur.format(factura.totalFactura)} con fecha de hoy.\n\nUna vez emitida no se puede modificar ni borrar. ¿Emitir?`)) return;
    accion(async () => {
      await apiFetch(companyPath(`/income-invoices/${id}/finalizar`), { method: 'POST', body: '{}' });
      await cargar();
    }, 'Factura emitida.');
  };

  const borrar = () => {
    if (!window.confirm('¿Borrar este borrador? No se puede deshacer.')) return;
    accion(async () => {
      await apiFetch(companyPath(`/income-invoices/${id}`), { method: 'DELETE' });
      router.push('/dashboard/facturas');
    });
  };

  const duplicar = () =>
    accion(async () => {
      const { invoice } = await apiFetch<{ invoice: { id: string } }>(companyPath(`/income-invoices/${id}/duplicar`), { method: 'POST' });
      router.push(`/dashboard/facturas/nueva?id=${invoice.id}`);
    });

  const marcarCobro = (estado: 'PAID' | 'PENDING') =>
    accion(async () => {
      await apiFetch(companyPath(`/income-invoices/${id}/status`), { method: 'PATCH', body: JSON.stringify({ estado }) });
      await cargar();
    }, estado === 'PAID' ? 'Marcada como cobrada.' : 'Marcada como pendiente.');

  const pdf = () =>
    accion(() =>
      apiDownload(companyPath(`/income-invoices/${id}/pdf`), esBorrador ? 'borrador_factura.pdf' : `factura_${factura.numeroCompleto}.pdf`),
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/facturas" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Volver a facturas">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
        {esBorrador ? (
          <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">Borrador · sin número</span>
        ) : (
          cobro && <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${cobro.clase}`}>{cobro.texto}</span>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {aviso && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}

      <div className="flex flex-wrap gap-2">
        {esBorrador && puedeEditar && (
          <>
            <button type="button" disabled={ocupado} onClick={emitir} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <Receipt size={16} /> Emitir factura
            </button>
            <Link href={`/dashboard/facturas/nueva?id=${id}`} className={boton}>
              <PencilSimple size={16} /> Editar
            </Link>
            <button type="button" disabled={ocupado} onClick={borrar} className={`${boton} text-red-700 hover:bg-red-50`}>
              <Trash size={16} /> Borrar
            </button>
          </>
        )}
        <button type="button" disabled={ocupado} onClick={pdf} className={boton}>
          <FilePdf size={16} /> Descargar PDF
        </button>
        {!esBorrador && puedeEditar && (
          <>
            {!factura.esRectificativa && (
              <button type="button" disabled={ocupado} onClick={duplicar} className={boton}>
                <Copy size={16} /> Duplicar
              </button>
            )}
            {factura.estado !== 'PAID' ? (
              <button type="button" disabled={ocupado} onClick={() => marcarCobro('PAID')} className={boton}>Marcar como cobrada</button>
            ) : (
              <button type="button" disabled={ocupado} onClick={() => marcarCobro('PENDING')} className={boton}>Marcar como pendiente</button>
            )}
            <button type="button" disabled={ocupado} onClick={() => setRectificando(true)} className={boton}>
              Hacer rectificativa
            </button>
          </>
        )}
      </div>

      <AvisosFactura facturaId={id} />

      {esBorrador && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Es un borrador: no cuenta para el IVA, los informes ni la contabilidad hasta que lo emitas.
        </p>
      )}

      {factura.esRectificativa && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            Rectifica la factura{' '}
            {original ? (
              <Link href={`/dashboard/facturas/${original.id}`} className="font-semibold underline">{original.numeroCompleto}</Link>
            ) : (
              'original'
            )}{' '}
            ({factura.tipoFactura}, {factura.tipoRectificativa === 'S' ? 'por sustitución' : 'por diferencias'}).
          </p>
          {factura.motivoRectificacion && <p className="mt-1">Motivo: {factura.motivoRectificacion}</p>}
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-4">
        <Dato etiqueta="Número" valor={factura.numeroCompleto ?? '—'} />
        <Dato etiqueta="Fecha de emisión" valor={fecha(factura.fechaEmision)} />
        <Dato etiqueta="Vencimiento" valor={fecha(factura.fechaVencimiento)} />
        <Dato etiqueta="Forma de pago" valor={FORMA_PAGO[factura.formaPago ?? 'TRANSFERENCIA'] ?? factura.formaPago ?? ''} />
        <div className="col-span-2 md:col-span-4 border-t border-slate-100 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Cliente</p>
          <p className="font-medium text-slate-900">{cliente?.nombreFiscal ?? '—'}</p>
          <p className="font-mono text-sm text-slate-600">{cliente?.nifCif}</p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Descripción</th>
              <th className="px-4 py-2 text-right font-medium">Cant.</th>
              <th className="px-4 py-2 text-right font-medium">Precio</th>
              <th className="px-4 py-2 text-right font-medium">Dto.</th>
              <th className="px-4 py-2 text-right font-medium">IVA</th>
              <th className="px-4 py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {factura.lineas.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 text-slate-900">{l.descripcion}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.cantidad.toLocaleString('es-ES')}</td>
                <td className="px-4 py-2 text-right tabular-nums">{eur.format(l.precioUnitario)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.descuentoPorcentaje ? `${l.descuentoPorcentaje} %` : ''}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.tipoIva} %</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{eur.format(l.baseLine)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ml-auto max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-5">
        <dl className="space-y-2 text-sm">
          <Fila etiqueta="Base imponible" valor={eur.format(factura.baseTotal)} />
          <Fila etiqueta="IVA" valor={eur.format(factura.ivaTotal)} />
          {factura.retencionTotal !== 0 && <Fila etiqueta="Retención IRPF" valor={`−${eur.format(factura.retencionTotal)}`} />}
          <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold text-slate-900">
            <dt>Total</dt>
            <dd className="font-mono tabular-nums">{eur.format(factura.totalFactura)}</dd>
          </div>
        </dl>
      </section>

      {factura.observaciones && !factura.esRectificativa && (
        <p className="whitespace-pre-line rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">{factura.observaciones}</p>
      )}

      {!esBorrador && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="mb-1 font-semibold text-blue-900">Contabilidad</h2>
          <p className="mb-3 text-sm text-blue-900/80">Al emitirla se contabiliza sola. Si no se pudo (por ejemplo, sin plan contable), hazlo aquí.</p>
          <ContabilizarButton
            invoiceId={id}
            companyId={getCompanyId()}
            tipo="INGRESO"
            onSuccess={(journalId) => setTimeout(() => router.push(`/dashboard/motor-contable/${journalId}`), 1000)}
          />
        </section>
      )}

      {rectificando && (
        <ModalRectificativa
          factura={factura}
          onCerrar={() => setRectificando(false)}
          onCreada={(nuevaId) => router.push(`/dashboard/facturas/${nuevaId}`)}
        />
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="font-medium text-slate-900">{valor}</p>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{etiqueta}</dt>
      <dd className="font-mono tabular-nums">{valor}</dd>
    </div>
  );
}

/**
 * Rectificativa que anula la factura entera (por diferencias: las mismas
 * lineas en negativo). Para corregir solo una parte, despues se emite una
 * factura nueva con los datos buenos.
 */
function ModalRectificativa({
  factura,
  onCerrar,
  onCreada,
}: {
  factura: Factura;
  onCerrar: () => void;
  onCreada: (id: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [tipo, setTipo] = useState('R1');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const crear = async () => {
    if (!motivo.trim()) return setError('Indica el motivo de la rectificación.');
    setEnviando(true);
    setError('');
    try {
      const { invoice } = await apiFetch<{ invoice: { id: string } }>(companyPath(`/income-invoices/${factura.id}/credit-note`), {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim(), tipoFactura: tipo, tipoRectificativa: 'I' }),
      });
      onCreada(invoice.id);
    } catch (e) {
      setError(errorMessage(e));
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-rect">
      <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 id="titulo-rect" className="text-lg font-semibold text-slate-900">Rectificar la factura {factura.numeroCompleto}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Se emitirá una factura rectificativa en la serie de rectificativas que anula esta por completo
          ({eur.format(-factura.totalFactura)}). Si solo había que corregir algo, después emite una factura nueva con los datos buenos.
        </p>
        <div>
          <label htmlFor="tipo-rect" className="mb-1 block text-sm font-medium text-slate-700">Causa</label>
          <select id="tipo-rect" value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {TIPOS_RECTIFICATIVA.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="motivo-rect" className="mb-1 block text-sm font-medium text-slate-700">Motivo</label>
          <textarea
            id="motivo-rect"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: error en el precio de la línea 2; devolución de la mercancía…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={boton}>Cancelar</button>
          <button type="button" disabled={enviando} onClick={crear} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {enviando ? 'Emitiendo…' : 'Emitir rectificativa'}
          </button>
        </div>
      </div>
    </div>
  );
}
