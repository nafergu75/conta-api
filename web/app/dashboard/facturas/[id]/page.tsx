'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, FilePdf, PencilSimple, Prohibit, Receipt, Trash, WarningCircle } from '@phosphor-icons/react';
import ContabilizarButton from '@/components/ContabilizarButton';
import { AvisosFactura } from './AvisosFactura';
import CobrosFactura from '@/components/CobrosFactura';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getCompanyId, getUser, tieneAlgunPermiso } from '@/lib/auth';
import { formatoImporte, NOMBRE_MONEDA, parseTipo, textoTipo, tipoParaEditar } from '@/lib/moneda';
import { conDevengoFuera, ETIQUETA_CORTA, ETIQUETA_LARGA, nombrePais } from '@/lib/fiscal';
import { useRedSeguridad } from '@/lib/verifactu';
import AvisoRedSeguridad from '@/components/verifactu/AvisoRedSeguridad';
import { leerAvisosVenta, type RectificativaVentaResp, TEXTO_TIPO_R, type TipoRectificativaVenta } from '@/lib/rectificativasVenta';

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
  /** Rectificativa de una factura de fuera de la app (de antes de facturar con ella). */
  rectificaFuera?: { numero: string; fecha: string | null };
  /** Factura nacida de una proforma. */
  proformaId?: string;
  /** Proforma aceptada: la factura que se creo al pasarla a factura. */
  facturaGeneradaId?: string;
  /** Rectificativa: lo que rectifica (una o varias facturas, de la app o de fuera, o un periodo), el motivo y la forma. */
  rectificativa?: RectificativaVentaResp | null;
  /** Abono: lo que no absorben sus originales y se puede devolver al cliente. */
  aFavor?: number;
  /** Rectificativas emitidas de esta factura. */
  rectificadaPor?: Array<{
    id: string;
    numeroCompleto: string | null;
    fechaEmision?: string;
    totalFactura: number;
    tipoRectificativa: string | null;
    tipoFactura?: string | null;
  }>;
  /** Sus rectificativas la dejan a cero: ya no se cobra ni se rectifica otra vez. */
  anuladaPorCompleto?: boolean;
  /** Asiento de la factura (no el de sus cobros); null si aún no tiene. */
  asiento?: { id: string; numero: string | null; estado: string } | null;
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
  // Avisos del servidor al guardar o emitir en Nueva factura (IVA al periodo de la original, plazos...).
  const [avisosGuardado, setAvisosGuardado] = useState<Array<{ codigo: string; mensaje: string }>>([]);
  // VERI*FACTU: desde el 1-1-2027, sin VERI*FACTU activo no se emite (el borrador si se guarda).
  const redSeguridad = useRedSeguridad();
  // Emitida pero sin asiento (p. ej. sin plan contable): lo dice la respuesta de emitir.
  const [sinAsiento, setSinAsiento] = useState('');

  useEffect(() => {
    // Se leen una vez (y se borran): si el efecto se repite, no se pisan con una lista vacía.
    const a = leerAvisosVenta(id);
    if (a.length) setAvisosGuardado(a);
  }, [id]);

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
        // Con el bloque `rectificativa` ya vienen el número y la fecha de las originales.
        invoice.facturaOriginalId && !invoice.rectificativa
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
  const rectificadaPor = factura.rectificadaPor ?? [];
  const anulada = esFinal && factura.anuladaPorCompleto === true;
  // Una rectificativa en negativo no se cobra: resta de la factura que rectifica.
  const abono = esFinal && factura.esRectificativa && factura.totalFactura < 0;
  const cobro = anulada
    ? {
        texto: `Anulada con ${rectificadaPor.map((r) => r.numeroCompleto).filter(Boolean).join(', ') || 'su rectificativa'}`,
        clase: 'bg-slate-100 text-slate-700 border-slate-300',
      }
    : abono
      ? { texto: (factura.aFavor ?? 0) > 0 ? 'Abono · a favor del cliente' : 'Abono', clase: 'bg-slate-100 text-slate-700 border-slate-300' }
      : ESTADO_COBRO[factura.estado];
  const estadoProforma = ESTADO_PROFORMA[factura.estado];
  const listado = esProforma ? '/dashboard/proformas' : '/dashboard/facturas';
  const titulo = esProforma
    ? `Proforma ${factura.numeroCompleto}`
    : esBorrador
      ? factura.esRectificativa
        ? 'Borrador de rectificativa'
        : 'Borrador de factura'
      : `${factura.esRectificativa ? 'Rectificativa' : 'Factura'} ${factura.numeroCompleto}`;

  const emitir = () => {
    // undefined: lo decide el servidor; null: volver al del BCE.
    let tipoCambio: number | null | undefined;
    if (enDivisa) {
      // En divisa se aplica el tipo del BCE de la fecha de la operacion, salvo que se indique otro.
      // El manual del borrador se propone con todos sus decimales (aceptarlo no lo cambia).
      const actual = factura.fuenteTipoCambio === 'MANUAL' && factura.tipoCambio ? tipoParaEditar(factura.tipoCambio) : '';
      const respuesta = window.prompt(
        `Vas a ${factura.esRectificativa ? 'emitir la rectificativa' : 'pasar a factura'} por ${fmtDoc(totalDoc)} con fecha de hoy.\n\n` +
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
    } else if (
      !window.confirm(
        `Vas a ${factura.esRectificativa ? 'emitir la rectificativa' : 'pasar a factura'} por ${fmtDoc(totalDoc)} con fecha de hoy.\n\n${CONFIRMAR_PASAR_A_FACTURA}`,
      )
    ) {
      return;
    }
    accion(async () => {
      // Operación de un periodo cuyo 303 presenta la gestoría: se pregunta antes de emitirla.
      const emitida = await conDevengoFuera((extra) =>
        apiFetch<{ invoice: { contabilizada?: boolean; motivoSinAsiento?: string | null } }>(companyPath(`/income-invoices/${id}/finalizar`), {
          method: 'POST',
          body: JSON.stringify({ ...(tipoCambio !== undefined ? { tipoCambio } : {}), ...extra }),
        }),
      );
      if (emitida === null) return;
      if (emitida.r.invoice.contabilizada === false) setSinAsiento(emitida.r.invoice.motivoSinAsiento || 'No se pudo contabilizar.');
      await cargar();
      const hecho = factura.esRectificativa ? 'Rectificativa emitida.' : 'Factura emitida.';
      setAviso(emitida.aviso ? `${hecho} ${emitida.aviso}` : hecho);
    });
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

      {esBorrador && puedeEditar && <AvisoRedSeguridad estado={redSeguridad} donde="borrador" />}

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
            <button
              type="button"
              disabled={ocupado || !!redSeguridad?.bloquea}
              onClick={emitir}
              title={redSeguridad?.bloquea ? redSeguridad.motivo ?? undefined : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Receipt size={16} /> {factura.esRectificativa ? 'Emitir rectificativa' : 'Pasar a factura'}
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
            {/* Una rectificativa no se rectifica, y una factura ya anulada entera tampoco (el servidor da 400 o 409).
                Abre Nueva factura con esta elegida y sus líneas en negativo; un ticket (F2) se rectifica con R5. */}
            {!factura.esRectificativa && !anulada && (
              <Link
                href={`/dashboard/facturas/nueva?rectifica=${encodeURIComponent(id)}${factura.tipoFactura === 'F2' ? '&ticket=1' : ''}`}
                className={boton}
              >
                Hacer rectificativa
              </Link>
            )}
          </>
        )}
      </div>

      <AvisosFactura facturaId={id} />

      {avisosGuardado.length > 0 && (
        <ul role="status" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {avisosGuardado.map((a) => (
            <li key={a.codigo} className="flex gap-2">
              <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {a.mensaje}
            </li>
          ))}
        </ul>
      )}

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

      {factura.esRectificativa && <DatosRectificativa factura={factura} original={original} fmt={fmtCuenta} />}

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

      {esFinal && rectificadaPor.length > 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {anulada ? 'Anulada por completo con ' : 'Rectificada con '}
          {rectificadaPor.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ', '}
              <Link href={`/dashboard/facturas/${r.id}`} className="font-semibold underline">
                {r.numeroCompleto ?? 'su rectificativa'}
              </Link>
              {r.fechaEmision ? ` del ${fecha(r.fechaEmision)}` : ''} ({fmtCuenta(r.totalFactura)}
              {r.tipoRectificativa === 'S' ? ', por sustitución' : ''})
            </span>
          ))}
          .{anulada ? ' No hay nada que cobrar.' : ''}
        </p>
      )}

      {esFinal && factura.totalFactura > 0 && !anulada && (
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

      {/* Abono: lo que no se come la factura que rectifica (ya cobrada) queda a favor del cliente y se le puede devolver. */}
      {abono && typeof factura.aFavor === 'number' && (
        <CobrosFactura
          tipo="INGRESO"
          abono
          aFavor={factura.aFavor}
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
          {factura.asiento ? (
            <p className="text-sm text-blue-900">
              Contabilizada con el asiento{' '}
              <Link href={`/dashboard/motor-contable/${factura.asiento.id}`} className="font-semibold underline">
                {factura.asiento.numero ?? 'de la factura'}
              </Link>
              {factura.asiento.estado !== 'POSTED' ? ' (pendiente de aprobar en el Motor contable)' : ''}.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-blue-900/80">Al emitirla se contabiliza sola. Si no se pudo (por ejemplo, sin plan contable), hazlo aquí.</p>
              <ContabilizarButton
                invoiceId={id}
                companyId={getCompanyId()}
                tipo="INGRESO"
                onSuccess={(journalId) => setTimeout(() => router.push(`/dashboard/motor-contable/${journalId}`), 1000)}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

const esTipoR = (t: string): t is TipoRectificativaVenta => t in TEXTO_TIPO_R;

/**
 * Lo que rectifica una rectificativa: la factura o facturas (con enlace si
 * están en la app), las de fuera con su número y fecha, o el periodo de un
 * rappel; el tipo, la forma y la causa. Las anteriores al bloque
 * `rectificativa` salen de facturaOriginalId o rectificaFuera.
 */
function DatosRectificativa({ factura, original, fmt }: { factura: Factura; original: Factura | null; fmt: (n: number) => string }) {
  const r = factura.rectificativa ?? null;
  const forma = (r?.forma ?? factura.tipoRectificativa) === 'S' ? 'Por sustitución' : 'Por diferencias';
  const originales = r?.originales ?? [];
  const varias = originales.length > 1;
  const causa = [r?.motivoTexto, r?.explicacion ?? factura.motivoRectificacion].filter((t): t is string => !!t && !!t.trim());
  return (
    <section aria-label="Lo que rectifica" className="space-y-1 rounded-lg border border-violet-200 bg-white p-4 text-sm text-slate-800">
      {r?.periodo ? (
        <p>
          Rectifica las ventas del <span className="font-semibold">{fecha(r.periodo.desde)}</span> al <span className="font-semibold">{fecha(r.periodo.hasta)}</span>{' '}
          (rappel o descuento por volumen).
        </p>
      ) : originales.length > 0 ? (
        <>
          <p>Rectifica {varias ? 'las facturas:' : 'la factura'}</p>
          <ul className={varias ? 'list-disc space-y-0.5 pl-5' : ''}>
            {originales.map((o, i) => (
              <li key={`${o.id ?? o.numeroCompleto}-${i}`}>
                {o.enApp && o.id ? (
                  <Link href={`/dashboard/facturas/${o.id}`} className="font-semibold text-blue-700 underline">
                    {o.numeroCompleto}
                  </Link>
                ) : (
                  <span className="font-semibold">{o.numeroCompleto}</span>
                )}
                {o.fecha ? ` del ${fecha(o.fecha)}` : ''}
                {!o.enApp ? ' (no está en la app)' : ''}
                {varias && o.base !== null ? ` · base ${fmt(o.base)}` : ''}
                {varias && o.cuota !== null ? ` · IVA ${fmt(o.cuota)}` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          Rectifica la factura{' '}
          {original ? (
            <Link href={`/dashboard/facturas/${original.id}`} className="font-semibold text-blue-700 underline">
              {original.numeroCompleto}
            </Link>
          ) : factura.rectificaFuera ? (
            <span className="font-semibold">
              {factura.rectificaFuera.numero}
              {factura.rectificaFuera.fecha ? ` del ${fecha(factura.rectificaFuera.fecha)}` : ''} (no está en la app)
            </span>
          ) : (
            'original'
          )}
          .
        </p>
      )}
      <p className="text-slate-600">
        {forma}.{' '}
        {esTipoR(factura.tipoFactura) ? `Tipo ${factura.tipoFactura}: ${TEXTO_TIPO_R[factura.tipoFactura]}.` : `Tipo ${factura.tipoFactura}.`}
      </p>
      {causa.length > 0 && <p>Causa: {causa.join('. ')}</p>}
    </section>
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
