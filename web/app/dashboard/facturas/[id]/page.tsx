'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, FilePdf, PencilSimple, Prohibit, Receipt, Trash, X } from '@phosphor-icons/react';
import ContabilizarButton from '@/components/ContabilizarButton';
import { AvisosFactura } from './AvisosFactura';
import CobrosFactura from '@/components/CobrosFactura';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getCompanyId, getUser, tieneAlgunPermiso } from '@/lib/auth';
import { formatoImporte, NOMBRE_MONEDA, parseTipo, textoTipo, tipoParaEditar } from '@/lib/moneda';
import { ETIQUETA_CORTA, ETIQUETA_LARGA, nombrePais } from '@/lib/fiscal';

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
  /** En la moneda de la factura (las anteriores a las divisas no lo traen). */
  precioUnitarioDoc?: number;
  baseLineDoc?: number;
}

interface Factura {
  id: string;
  customerId: string;
  serie: string;
  numeroCompleto: string | null;
  estadoDocumento: 'BORRADOR' | 'FINAL' | 'PROFORMA';
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
  /** Factura nacida de una proforma. */
  proformaId?: string;
  /** Proforma aceptada: la factura que se creo al pasarla a factura. */
  facturaGeneradaId?: string;
  lineas: Linea[];
  /** Fecha de la operacion si es distinta de la de emision. */
  fechaOperacion?: string;
  /** Moneda de la factura y de la contabilidad; los totales de siempre van en la de la contabilidad. */
  moneda?: string;
  monedaCuenta?: string;
  baseTotalDoc?: number;
  ivaTotalDoc?: number;
  retencionTotalDoc?: number;
  totalFacturaDoc?: number;
  tipoCambio?: number;
  fechaTipoCambio?: string;
  /** PAR | BCE | MANUAL | HEREDADO | PENDIENTE */
  fuenteTipoCambio?: string;
  tipoCambioProvisional?: boolean;
  tipoOperacion?: string;
  tipoOperacionEfectivo?: string | null;
  referenciaLegal?: string;
  mencionFiscal?: { es: string; en: string | null } | null;
}

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  pais?: string;
}

const fechaCorta = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** De donde sale el tipo de cambio, para la ficha. */
function origenTipo(f: Factura): string {
  switch (f.fuenteTipoCambio) {
    case 'BCE':
      return `BCE ${fechaCorta(f.fechaTipoCambio)}`;
    case 'MANUAL':
      return 'indicado a mano';
    case 'HEREDADO':
      return 'el de la factura rectificada';
    default:
      return '';
  }
}
const fecha = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES') : '');

const ESTADO_COBRO: Record<string, { texto: string; clase: string }> = {
  PENDING: { texto: 'Pendiente de cobro', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
  OVERDUE: { texto: 'Vencida', clase: 'bg-red-50 text-red-700 border-red-200' },
  PAID: { texto: 'Cobrada', clase: 'bg-green-50 text-green-800 border-green-200' },
  ACCOUNTED: { texto: 'Contabilizada', clase: 'bg-blue-50 text-blue-800 border-blue-200' },
};

/** Estados de la proforma (no tiene cobros). */
const ESTADO_PROFORMA: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
  ACEPTADA: { texto: 'Aceptada', clase: 'bg-green-50 text-green-800 border-green-200' },
  RECHAZADA: { texto: 'Rechazada', clase: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const CONFIRMAR_PASAR_A_FACTURA =
  'Una vez pasada a factura recibirá el número de la serie y no se podrá modificar ni borrar; solo corregir con una rectificativa.';

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
  const puedeCobrar = tieneAlgunPermiso(getUser(), ['ventas:write', 'contabilidad:write']);

  const [factura, setFactura] = useState<Factura | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [original, setOriginal] = useState<Factura | null>(null);
  const [proforma, setProforma] = useState<Factura | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [rectificando, setRectificando] = useState(false);
  // Emitida pero sin asiento (p. ej. sin plan contable): lo dice la respuesta de emitir.
  const [sinAsiento, setSinAsiento] = useState('');

  useEffect(() => {
    try {
      const clave = `conta_sin_asiento_${id}`;
      const motivo = sessionStorage.getItem(clave);
      if (motivo) {
        setSinAsiento(motivo);
        sessionStorage.removeItem(clave);
      }
    } catch {
      // Sin sessionStorage: no hay aviso que recuperar.
    }
  }, [id]);

  const cargar = useCallback(async () => {
    try {
      const { invoice } = await apiFetch<{ invoice: Factura }>(companyPath(`/income-invoices/${id}`));
      setFactura(invoice);
      const [cli, orig, prof] = await Promise.all([
        apiFetch<Cliente>(companyPath(`/clientes/${invoice.customerId}`)).catch(() => null),
        invoice.facturaOriginalId
          ? apiFetch<{ invoice: Factura }>(companyPath(`/income-invoices/${invoice.facturaOriginalId}`))
              .then((r) => r.invoice)
              .catch(() => null)
          : Promise.resolve(null),
        invoice.proformaId
          ? apiFetch<{ invoice: Factura }>(companyPath(`/income-invoices/${invoice.proformaId}`))
              .then((r) => r.invoice)
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      setCliente(cli && 'nombreFiscal' in cli ? cli : null);
      setOriginal(orig);
      setProforma(prof);
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

  const moneda = factura.moneda ?? 'EUR';
  const monedaCuenta = factura.monedaCuenta ?? 'EUR';
  const enDivisa = moneda !== monedaCuenta;
  const fmtDoc = (n: number) => formatoImporte(n, moneda);
  const fmtCuenta = (n: number) => formatoImporte(n, monedaCuenta);
  const totalDoc = factura.totalFacturaDoc ?? factura.totalFactura;
  // El tipo guardado; en un borrador o proforma, el que se deduce. Una factura
  // emitida antes de los tipos de operacion no tiene: no se muestra (su PDF no lleva mencion).
  const tipoOp = factura.tipoOperacion ?? (factura.estadoDocumento === 'FINAL' ? null : (factura.tipoOperacionEfectivo ?? null));
  const sinIva = tipoOp === 'EMPRESA_EXTRANJERA';
  // Tipos sin cuota: la linea al 0 % se nombra por su tipo (Exenta, Intracom....).
  const etiquetaIva = (t: number) => (t === 0 && tipoOp && tipoOp !== 'NACIONAL' ? ETIQUETA_CORTA[tipoOp] ?? '0 %' : `${t} %`);
  const estadoTipo =
    factura.fuenteTipoCambio === 'PENDIENTE'
      ? 'pendiente'
      : factura.tipoCambioProvisional
        ? 'provisional'
        : factura.fuenteTipoCambio === 'HEREDADO'
          ? 'heredado'
          : 'definitivo';

  const esProforma = factura.estadoDocumento === 'PROFORMA';
  const esBorrador = factura.estadoDocumento === 'BORRADOR';
  const esFinal = factura.estadoDocumento === 'FINAL';
  const proformaPendiente = esProforma && factura.estado === 'PENDIENTE';
  const cobro = ESTADO_COBRO[factura.estado];
  const estadoProforma = ESTADO_PROFORMA[factura.estado];
  const listado = esProforma ? '/dashboard/proformas' : '/dashboard/facturas';
  const titulo = esProforma
    ? `Proforma ${factura.numeroCompleto}`
    : esBorrador
      ? 'Borrador de factura'
      : `${factura.esRectificativa ? 'Rectificativa' : 'Factura'} ${factura.numeroCompleto}`;

  const emitir = () => {
    // undefined: lo decide el servidor; null: volver al del BCE.
    let tipoCambio: number | null | undefined;
    if (enDivisa) {
      // En divisa se aplica el tipo del BCE de la fecha de la operacion, salvo que se indique otro.
      // El manual del borrador se propone con todos sus decimales (aceptarlo no lo cambia).
      const actual = factura.fuenteTipoCambio === 'MANUAL' && factura.tipoCambio ? tipoParaEditar(factura.tipoCambio) : '';
      const respuesta = window.prompt(
        `Vas a pasar a factura por ${fmtDoc(totalDoc)} con fecha de hoy.\n\n` +
          `Tipo de cambio: déjalo vacío para aplicar el de referencia del BCE de la fecha de la operación, o escribe el tuyo (1 ${monedaCuenta} = … ${moneda}).\n\n` +
          CONFIRMAR_PASAR_A_FACTURA,
        actual,
      );
      if (respuesta === null) return;
      if (respuesta.trim()) {
        const t = parseTipo(respuesta);
        if (!(t > 0)) {
          setError('El tipo de cambio tiene que ser un número mayor que cero, con coma o punto decimal (por ejemplo 1,1490).');
          return;
        }
        tipoCambio = t;
      } else if (factura.fuenteTipoCambio === 'MANUAL') {
        // Vacio con un tipo manual guardado: se pide el del BCE (si no, se mantendria el manual).
        tipoCambio = null;
      }
    } else if (!window.confirm(`Vas a pasar a factura por ${fmtDoc(totalDoc)} con fecha de hoy.\n\n${CONFIRMAR_PASAR_A_FACTURA}`)) {
      return;
    }
    accion(async () => {
      const { invoice } = await apiFetch<{ invoice: { contabilizada?: boolean; motivoSinAsiento?: string | null } }>(
        companyPath(`/income-invoices/${id}/finalizar`),
        { method: 'POST', body: JSON.stringify(tipoCambio !== undefined ? { tipoCambio } : {}) },
      );
      if (invoice.contabilizada === false) setSinAsiento(invoice.motivoSinAsiento || 'No se pudo contabilizar.');
      await cargar();
    }, 'Factura emitida.');
  };

  // Proforma aceptada por el cliente: se crea un borrador de factura con sus datos.
  const pasarProformaAFactura = () => {
    if (
      !window.confirm(
        `Se creará un borrador de factura con los datos de la proforma ${factura.numeroCompleto} y la proforma quedará aceptada.\n\n` +
          'Podrás revisarlo antes de pasarlo a factura definitiva. ¿Continuar?',
      )
    ) {
      return;
    }
    accion(async () => {
      const { invoice } = await apiFetch<{ invoice: { id: string } }>(companyPath(`/income-invoices/${id}/pasar-a-factura`), {
        method: 'POST',
        body: '{}',
      });
      router.push(`/dashboard/facturas/${invoice.id}`);
    });
  };

  const rechazar = () => {
    if (!window.confirm(`¿Marcar la proforma ${factura.numeroCompleto} como rechazada? Ya no se podrá editar ni pasar a factura.`)) return;
    accion(async () => {
      await apiFetch(companyPath(`/income-invoices/${id}/rechazar`), { method: 'POST', body: '{}' });
      await cargar();
    }, 'Proforma rechazada.');
  };

  const borrar = () => {
    if (!window.confirm(esProforma ? `¿Borrar la proforma ${factura.numeroCompleto}? No se puede deshacer.` : '¿Borrar este borrador? No se puede deshacer.')) return;
    accion(async () => {
      await apiFetch(companyPath(`/income-invoices/${id}`), { method: 'DELETE' });
      router.push(listado);
    });
  };

  const duplicar = () =>
    accion(async () => {
      const { invoice } = await apiFetch<{ invoice: { id: string } }>(companyPath(`/income-invoices/${id}/duplicar`), { method: 'POST' });
      router.push(esProforma ? `/dashboard/proformas/${invoice.id}` : `/dashboard/facturas/nueva?id=${invoice.id}`);
    });

  const pdf = () =>
    accion(() =>
      apiDownload(
        companyPath(`/income-invoices/${id}/pdf`),
        esProforma ? `proforma_${factura.numeroCompleto}.pdf` : esBorrador ? 'borrador_factura.pdf' : `factura_${factura.numeroCompleto}.pdf`,
      ),
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={listado} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={esProforma ? 'Volver a proformas' : 'Volver a facturas'}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
        {esProforma ? (
          estadoProforma && <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${estadoProforma.clase}`}>{estadoProforma.texto}</span>
        ) : esBorrador ? (
          <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">Borrador · sin número</span>
        ) : (
          cobro && <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${cobro.clase}`}>{cobro.texto}</span>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {aviso && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}
      {sinAsiento && esFinal && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-semibold">Emitida sin asiento.</span> {sinAsiento} Puedes contabilizarla abajo, en «Contabilidad», cuando esté resuelto.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {proformaPendiente && puedeEditar && (
          <>
            <button type="button" disabled={ocupado} onClick={pasarProformaAFactura} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <Receipt size={16} /> Pasar a factura
            </button>
            <Link href={`/dashboard/facturas/nueva?id=${id}`} className={boton}>
              <PencilSimple size={16} /> Editar
            </Link>
            <button type="button" disabled={ocupado} onClick={rechazar} className={boton}>
              <Prohibit size={16} /> Rechazar
            </button>
            <button type="button" disabled={ocupado} onClick={borrar} className={`${boton} text-red-700 hover:bg-red-50`}>
              <Trash size={16} /> Borrar
            </button>
          </>
        )}
        {esBorrador && puedeEditar && (
          <>
            <button type="button" disabled={ocupado} onClick={emitir} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <Receipt size={16} /> Pasar a factura
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
        {esProforma && puedeEditar && (
          <button type="button" disabled={ocupado} onClick={duplicar} className={boton}>
            <Copy size={16} /> Duplicar
          </button>
        )}
        {esFinal && puedeEditar && (
          <>
            {!factura.esRectificativa && (
              <button type="button" disabled={ocupado} onClick={duplicar} className={boton}>
                <Copy size={16} /> Duplicar
              </button>
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
          Es un borrador: no cuenta para el IVA, los informes ni la contabilidad hasta que lo pases a factura.
          {proforma && (
            <>
              {' '}Viene de la proforma{' '}
              <Link href={`/dashboard/proformas/${proforma.id}`} className="font-semibold underline">{proforma.numeroCompleto}</Link>.
            </>
          )}
        </p>
      )}

      {esFinal && proforma && (
        <p className="text-sm text-slate-600">
          Viene de la proforma{' '}
          <Link href={`/dashboard/proformas/${proforma.id}`} className="font-medium text-blue-700 underline">{proforma.numeroCompleto}</Link>.
        </p>
      )}

      {esProforma && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Factura proforma: documento sin validez fiscal. No cuenta para el IVA, los informes ni la contabilidad, y no admite cobros.
          {factura.estado === 'ACEPTADA' && factura.facturaGeneradaId && (
            <>
              {' '}Ya se pasó a factura:{' '}
              <Link href={`/dashboard/facturas/${factura.facturaGeneradaId}`} className="font-semibold underline">ver la factura</Link>.
            </>
          )}
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
        {factura.fechaOperacion && factura.fechaOperacion !== factura.fechaEmision && (
          <Dato etiqueta="Fecha de la operación" valor={fecha(factura.fechaOperacion)} />
        )}
        <div className="col-span-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Moneda</p>
          <p className="font-medium text-slate-900">
            {moneda}
            {NOMBRE_MONEDA[moneda] ? <span className="font-normal text-slate-600"> · {NOMBRE_MONEDA[moneda]}</span> : null}
          </p>
          {enDivisa && (
            <p className="text-sm text-slate-600">
              {factura.fuenteTipoCambio === 'PENDIENTE' || !factura.tipoCambio ? (
                'Sin tipo de cambio todavía: se fija al pasarla a factura.'
              ) : (
                <>
                  <span className="font-mono">{textoTipo(monedaCuenta, moneda, factura.tipoCambio)}</span>
                  {origenTipo(factura) && ` (${origenTipo(factura)})`}{' '}
                  <span
                    className={`ml-1 rounded-full border px-2 py-0.5 text-xs ${
                      estadoTipo === 'definitivo' || estadoTipo === 'heredado'
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {estadoTipo}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        {tipoOp && (
          <div className="col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Operación</p>
            <p className="font-medium text-slate-900">{ETIQUETA_LARGA[tipoOp] ?? tipoOp}</p>
            {factura.referenciaLegal && <p className="text-sm text-slate-600">{factura.referenciaLegal}</p>}
          </div>
        )}
        <div className="col-span-2 md:col-span-4 border-t border-slate-100 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Cliente</p>
          <p className="font-medium text-slate-900">{cliente?.nombreFiscal ?? '—'}</p>
          <p className="font-mono text-sm text-slate-600">
            {cliente?.nifCif}
            {cliente?.pais && cliente.pais !== 'ES' && <span className="ml-2 font-sans">{nombrePais(cliente.pais)}</span>}
          </p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Descripción</th>
              <th className="px-4 py-2 text-right font-medium">Cant.</th>
              <th className="px-4 py-2 text-right font-medium">Precio{enDivisa ? ` (${moneda})` : ''}</th>
              <th className="px-4 py-2 text-right font-medium">Dto.</th>
              {!sinIva && <th className="px-4 py-2 text-right font-medium">IVA</th>}
              <th className="px-4 py-2 text-right font-medium">Importe{enDivisa ? ` (${moneda})` : ''}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {factura.lineas.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 text-slate-900">{l.descripcion}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.cantidad.toLocaleString('es-ES')}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtDoc(l.precioUnitarioDoc ?? l.precioUnitario)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.descuentoPorcentaje ? `${l.descuentoPorcentaje} %` : ''}</td>
                {!sinIva && <td className="px-4 py-2 text-right tabular-nums">{etiquetaIva(l.tipoIva)}</td>}
                <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtDoc(l.baseLineDoc ?? l.baseLine)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-end">
        {factura.mencionFiscal && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm md:max-w-md md:flex-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Mención en la factura</p>
            <p className="mt-1 text-slate-800">{factura.mencionFiscal.es}</p>
            {factura.mencionFiscal.en && <p className="mt-1 text-slate-500">{factura.mencionFiscal.en}</p>}
          </section>
        )}
        <section className="w-full rounded-xl border border-slate-200 bg-slate-50 p-5 md:max-w-sm">
          <dl className="space-y-2 text-sm">
            <Fila etiqueta="Base imponible" valor={fmtDoc(factura.baseTotalDoc ?? factura.baseTotal)} />
            {!sinIva && <Fila etiqueta="IVA" valor={fmtDoc(factura.ivaTotalDoc ?? factura.ivaTotal)} />}
            {factura.retencionTotal !== 0 && (
              <Fila etiqueta="Retención IRPF" valor={fmtDoc(-(factura.retencionTotalDoc ?? factura.retencionTotal))} />
            )}
            <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold text-slate-900">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{fmtDoc(totalDoc)}</dd>
            </div>
          </dl>
          {enDivisa && factura.fuenteTipoCambio !== 'PENDIENTE' && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Contravalor en {monedaCuenta}
                {estadoTipo === 'provisional' ? ' (orientativo)' : ''}
              </p>
              <dl className="space-y-1 text-sm">
                <Fila etiqueta="Base imponible" valor={fmtCuenta(factura.baseTotal)} />
                {!sinIva && factura.ivaTotal !== 0 && (
                  <Fila etiqueta={monedaCuenta === 'EUR' ? 'Cuota de IVA en euros' : 'Cuota de IVA'} valor={fmtCuenta(factura.ivaTotal)} />
                )}
                {factura.retencionTotal !== 0 && <Fila etiqueta="Retención IRPF" valor={fmtCuenta(-factura.retencionTotal)} />}
                <div className="flex justify-between font-semibold text-slate-900">
                  <dt>Total</dt>
                  <dd className="font-mono tabular-nums">{fmtCuenta(factura.totalFactura)}</dd>
                </div>
              </dl>
            </div>
          )}
        </section>
      </div>

      {esFinal && factura.totalFactura > 0 && (
        <CobrosFactura
          tipo="INGRESO"
          facturaId={id}
          puedeEditar={puedeCobrar}
          fechaFactura={factura.fechaEmision}
          moneda={moneda}
          monedaCuenta={monedaCuenta}
          onCambio={cargar}
        />
      )}

      {factura.observaciones && !factura.esRectificativa && (
        <p className="whitespace-pre-line rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">{factura.observaciones}</p>
      )}

      {esFinal && (
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
          ({formatoImporte(-(factura.totalFacturaDoc ?? factura.totalFactura), factura.moneda ?? 'EUR')}
          {factura.moneda && factura.monedaCuenta && factura.moneda !== factura.monedaCuenta ? ', con el mismo tipo de cambio' : ''}). Si solo
          había que corregir algo, después emite una factura nueva con los datos buenos.
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
