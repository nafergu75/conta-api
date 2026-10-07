'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  DESVIACION_AVISO,
  desviacion,
  formatoImporte,
  formatoTipo,
  NOMBRE_MONEDA,
  pareceInvertido,
  parseImporte,
  parseTipo,
  redondear2,
  simboloMoneda,
  textoTipo,
  tipoParaEditar,
} from '@/lib/moneda';
import { calcularFactura } from '@/lib/divisas';
import { useContextoFiscal, type AvisoFiscal } from '@/lib/fiscal';

/**
 * Alta de factura de venta, o edicion de un borrador (?id=...).
 *
 * "Guardar borrador" la deja sin numero y editable. "Pasar a factura" le da el
 * siguiente numero de la serie y ya no se puede cambiar: los errores se
 * corrigen con una rectificativa (como exige Verifactu).
 *
 * Con ?tipo=proforma (o al editar una proforma pendiente) es el formulario de
 * la factura proforma: mismo documento, numerado en la serie P al guardarlo y
 * sin efectos fiscales. Solo tiene "Guardar proforma".
 *
 * Moneda: EUR o USD. En otra moneda que la de la contabilidad se propone el
 * tipo de referencia del BCE (editable); el definitivo se fija al emitir.
 *
 * Tipo de operacion de IVA (solo empresas espanolas): uno por factura. Los
 * tipos sin cuota (exenta, intracomunitaria, exportacion...) ponen el IVA a 0.
 * Una empresa no establecida en Espana factura sin IVA ni IRPF, en su moneda.
 */

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  pais?: string;
  monedaPreferida?: string | null;
}

interface Serie {
  id: string;
  codigo: string;
  descripcion: string;
  activa: boolean;
  porDefecto: boolean;
  ultimoNumero?: number;
}

interface Producto {
  id: string;
  referencia: string;
  descripcion: string;
  precio: number;
  ivaPorcentaje: number;
  bloqueado: boolean;
}

interface Linea {
  clave: number;
  productoServicioId: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  descuentoPorcentaje: string;
  tipoIva: number;
  /** IVA que tenia antes de elegir un tipo de operacion sin cuota (se restaura al volver a nacional). */
  ivaPrevio?: number;
}

interface FacturaApi {
  id: string;
  customerId: string;
  serie: string;
  numeroCompleto?: string | null;
  estadoDocumento: string;
  estado: string;
  tipoFactura: string;
  formaPago?: string;
  fechaEmision: string;
  fechaVencimiento: string;
  fechaOperacion?: string | null;
  observaciones?: string;
  moneda?: string;
  tipoCambio?: number;
  fuenteTipoCambio?: string;
  tipoOperacion?: string | null;
  causaExencion?: string | null;
  referenciaLegal?: string | null;
  lineas: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    precioUnitarioDoc?: number;
    descuentoPorcentaje: number;
    tipoIva: number;
    tipoRetencion: number;
    productoServicioId?: string;
  }>;
}

interface TipoCambioApi {
  monedaCuenta: string;
  moneda: string;
  tipoCambio: number | null;
  fechaTipoCambio: string | null;
  fuente: string;
  texto: string | null;
  textoInverso: string | null;
  provisional: boolean;
  aviso?: string;
}

interface Revision {
  mencion: { es: string; en: string | null } | null;
  avisosCliente?: AvisoFiscal[];
  revision?: { tipoOperacion: string | null; errores: AvisoFiscal[]; avisos: AvisoFiscal[] };
}

const IVAS = [21, 10, 5, 4, 0];
const IRPFS = [0, 7, 15, 19];
const FORMAS_PAGO = [
  ['TRANSFERENCIA', 'Transferencia bancaria'],
  ['GIRO', 'Giro / recibo domiciliado'],
  ['CONTADO', 'Contado'],
] as const;
const num = (s: string): number => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const hoy = () => new Date().toISOString().slice(0, 10);
const masDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const fechaES = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

let siguienteClave = 1;
const lineaVacia = (tipoIva = 21): Linea => ({
  clave: siguienteClave++,
  productoServicioId: '',
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  descuentoPorcentaje: '0',
  tipoIva,
});

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500';
const etiqueta = 'mb-1 block text-sm font-medium text-slate-700';

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={<p className="p-6 text-slate-500">Cargando…</p>}>
      <FormularioFactura />
    </Suspense>
  );
}

function FormularioFactura() {
  const router = useRouter();
  const params = useSearchParams();
  const borradorId = params.get('id');
  // Proforma nueva (?tipo=proforma) o una proforma pendiente que se edita.
  const [esProforma, setEsProforma] = useState(params.get('tipo') === 'proforma');
  const [numeroProforma, setNumeroProforma] = useState('');

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const [clienteId, setClienteId] = useState('');
  const [serie, setSerie] = useState('');
  const [tipoFactura, setTipoFactura] = useState('F1');
  const [formaPago, setFormaPago] = useState('TRANSFERENCIA');
  const [fechaEmision, setFechaEmision] = useState(hoy());
  const [fechaVencimiento, setFechaVencimiento] = useState(masDias(hoy(), 30));
  const [fechaOperacion, setFechaOperacion] = useState('');
  const [irpf, setIrpf] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);

  // Moneda y tipo de cambio ('' = aun sin decidir: la de la contabilidad).
  const [moneda, setMoneda] = useState('');
  const [monedaTocada, setMonedaTocada] = useState(false);
  const [tipoManual, setTipoManual] = useState(''); // texto del campo; '' = el del BCE
  const [bce, setBce] = useState<TipoCambioApi | null>(null);
  const [bceCargando, setBceCargando] = useState(false);
  const [bceError, setBceError] = useState('');
  // Borrador guardado con tipo manual que se quiere volver a dejar en el del BCE.
  const [volverAlBce, setVolverAlBce] = useState(false);
  // Borrador creado en esta pantalla al "Pasar a factura": si emitirlo falla, el
  // reintento lo modifica (PUT) en vez de crear otro.
  const [idCreado, setIdCreado] = useState<string | null>(null);

  // Tipo de operacion de IVA.
  const [tipoOperacion, setTipoOperacion] = useState('');
  const [tipoTocado, setTipoTocado] = useState(false);
  const [supuesto, setSupuesto] = useState('');
  const [referenciaLegal, setReferenciaLegal] = useState('');
  const [revision, setRevision] = useState<Revision | null>(null);

  const { contexto, error: errorContexto } = useContextoFiscal(clienteId || undefined);
  const espanola = contexto?.empresaEspanola ?? true;
  const monedaCuenta = contexto?.monedaCuenta ?? 'EUR';
  const monedaDoc = moneda || monedaCuenta;
  const enDivisa = monedaDoc !== monedaCuenta;
  const regla = contexto?.tipos.find((t) => t.codigo === tipoOperacion) ?? null;
  const sinCuota = !espanola || (regla ? !regla.llevaCuota : false);
  const sinRetencion = !espanola || (regla ? !regla.admiteRetencion : false);
  const clienteElegido = clientes.find((c) => c.id === clienteId);

  useEffect(() => {
    (async () => {
      try {
        const [cli, ser, prod] = await Promise.all([
          apiFetch<{ items: Cliente[] } | Cliente[]>(companyPath('/clientes?limit=1000')),
          apiFetch<Serie[]>(companyPath('/series?tipoDocumento=FACTURA')),
          apiFetch<{ items: Producto[] }>(companyPath('/productos?limit=1000&activos=true')).catch(() => ({ items: [] })),
        ]);
        setClientes(Array.isArray(cli) ? cli : cli.items ?? []);
        const activas = ser.filter((s) => s.activa);
        setSeries(activas);
        setProductos(prod.items ?? []);

        if (borradorId) {
          const { invoice } = await apiFetch<{ invoice: FacturaApi }>(companyPath(`/income-invoices/${borradorId}`));
          const proforma = invoice.estadoDocumento === 'PROFORMA';
          if (proforma ? invoice.estado !== 'PENDIENTE' : invoice.estadoDocumento !== 'BORRADOR') {
            router.replace(`/dashboard/${proforma ? 'proformas' : 'facturas'}/${invoice.id}`);
            return;
          }
          setEsProforma(proforma);
          setNumeroProforma(proforma ? (invoice.numeroCompleto ?? '') : '');
          setClienteId(invoice.customerId);
          setSerie(invoice.serie);
          setTipoFactura(invoice.tipoFactura);
          setFormaPago(invoice.formaPago ?? 'TRANSFERENCIA');
          setFechaEmision(invoice.fechaEmision);
          setFechaVencimiento(invoice.fechaVencimiento);
          setFechaOperacion(invoice.fechaOperacion ?? '');
          setObservaciones(invoice.observaciones ?? '');
          setIrpf(invoice.lineas.find((l) => l.tipoRetencion)?.tipoRetencion ?? 0);
          if (invoice.moneda) {
            setMoneda(invoice.moneda);
            setMonedaTocada(true);
          }
          // Con todos sus decimales: guardar sin tocarlo no cambia el tipo (formatoTipo lo redondea a 4).
          if (invoice.fuenteTipoCambio === 'MANUAL' && invoice.tipoCambio) setTipoManual(tipoParaEditar(invoice.tipoCambio));
          // Un borrador ya guardado no cambia de tipo solo: si hay sugerencia, se ofrece.
          setTipoOperacion(invoice.tipoOperacion ?? '');
          setTipoTocado(true);
          setReferenciaLegal(invoice.referenciaLegal ?? '');
          setSupuesto(invoice.causaExencion || invoice.referenciaLegal ? 'CAUSA:' : '');
          setLineas(
            invoice.lineas.map((l) => ({
              clave: siguienteClave++,
              productoServicioId: l.productoServicioId ?? '',
              descripcion: l.descripcion,
              cantidad: String(l.cantidad),
              // Precio en la moneda de la factura (las anteriores no lo tienen: el de siempre).
              precioUnitario: String(l.precioUnitarioDoc ?? l.precioUnitario),
              descuentoPorcentaje: String(l.descuentoPorcentaje ?? 0),
              tipoIva: l.tipoIva,
            })),
          );
        } else {
          setSerie((activas.find((s) => s.porDefecto) ?? activas[0])?.codigo ?? '');
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setCargando(false);
      }
    })();
  }, [borradorId, router]);

  // Supuesto de exencion guardado: se busca en el catalogo por su referencia.
  useEffect(() => {
    if (!contexto || !supuesto.startsWith('CAUSA:')) return;
    const lista = tipoOperacion === 'EXENTA' ? contexto.supuestosExencion : contexto.supuestosIsp;
    const s = lista.find((x) => x.referenciaLegal && x.referenciaLegal === referenciaLegal);
    setSupuesto(s ? s.codigo : 'OTRO');
  }, [contexto, supuesto, tipoOperacion, referenciaLegal]);

  // Cliente nuevo en una factura nueva, mientras la moneda no se haya tocado a
  // mano: la que prefiere el cliente o, si no tiene, la de la contabilidad (asi
  // corregir el cliente no deja la factura en la moneda del anterior). Con
  // precios ya escritos se pregunta si se convierten.
  useEffect(() => {
    if (!clienteElegido || monedaTocada || borradorId || !contexto || !contexto.empresaEspanola) return;
    const pref = clienteElegido.monedaPreferida;
    const nueva = pref && contexto.monedasFactura.some((m) => m.codigo === pref) ? pref : contexto.monedaCuenta;
    if (nueva !== monedaDoc) void cambiarMoneda(nueva, false);
    // cambiarMoneda y monedaDoc se leen al cambiar de cliente; no hay que repetirlo al cambiar ellos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteElegido, monedaTocada, borradorId, contexto]);
  const sugerido = contexto?.sugerencia?.tipoOperacion ?? null;
  useEffect(() => {
    if (!espanola || tipoTocado || !sugerido) return;
    aplicarTipo(sugerido);
    // aplicarTipo solo cambia estado; se quiere al cambiar la sugerencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugerido, espanola, tipoTocado]);

  // Empresa no espanola: sin IVA ni retencion, en su moneda.
  useEffect(() => {
    if (!contexto || contexto.empresaEspanola) return;
    setLineas((ls) => (ls.some((l) => l.tipoIva !== 0) ? ls.map((l) => ({ ...l, tipoIva: 0 })) : ls));
    setIrpf(0);
    setTipoFactura('F1');
    setMoneda(contexto.monedaCuenta);
  }, [contexto]);

  // Tipo de cambio del BCE para la fecha de la operacion (o de emision).
  const devengo = fechaOperacion || fechaEmision;
  useEffect(() => {
    if (!enDivisa || !devengo) {
      setBce(null);
      setBceError('');
      return;
    }
    let vivo = true;
    setBceCargando(true);
    const t = setTimeout(() => {
      apiFetch<TipoCambioApi>(companyPath(`/tipos-cambio?moneda=${encodeURIComponent(monedaDoc)}&fecha=${devengo}`))
        .then((r) => {
          if (!vivo) return;
          setBce(r);
          setBceError(r.tipoCambio ? '' : r.aviso || 'No se ha podido obtener el tipo del BCE: indícalo a mano.');
        })
        .catch((e) => vivo && (setBce(null), setBceError(`${errorMessage(e)} Indica el tipo a mano.`)))
        .finally(() => vivo && setBceCargando(false));
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [enDivisa, monedaDoc, devengo]);

  // Un tipo no lleva separador de miles: '1.149' es 1,149 (parseImporte lo leeria como 1149).
  const manual = tipoManual.trim() ? parseTipo(tipoManual) : NaN;
  const tipoAplicado = enDivisa ? (Number.isFinite(manual) && manual > 0 ? manual : bce?.tipoCambio ?? null) : 1;
  const avisoTipo = (() => {
    if (!enDivisa || !tipoManual.trim()) return '';
    if (!Number.isFinite(manual) || manual <= 0) return 'El tipo de cambio tiene que ser un número mayor que cero.';
    const ref = bce?.tipoCambio;
    if (!ref) return '';
    if (pareceInvertido(manual, ref)) {
      return `Parece escrito al revés: el BCE da ${textoTipo(monedaCuenta, monedaDoc, ref)}. Indica cuántos ${monedaDoc} vale 1 ${monedaCuenta}.`;
    }
    if (manual < ref / 2 || manual > ref * 2) return `Muy lejos del tipo del BCE (${formatoTipo(ref)}). Revísalo.`;
    if (desviacion(manual, ref) > DESVIACION_AVISO) {
      return `Se separa un ${(desviacion(manual, ref) * 100).toFixed(1).replace('.', ',')} % del tipo del BCE (${formatoTipo(ref)}).`;
    }
    return '';
  })();

  const cambiarLinea = (clave: number, cambios: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  const elegirProducto = (clave: number, id: string) => {
    const p = productos.find((x) => x.id === id);
    if (!p) return cambiarLinea(clave, { productoServicioId: '' });
    // El precio del catalogo esta en la moneda de la contabilidad: en otra moneda se convierte al tipo propuesto.
    const precio = enDivisa && tipoAplicado ? redondear2(p.precio * tipoAplicado) : p.precio;
    const iva = IVAS.includes(p.ivaPorcentaje) ? p.ivaPorcentaje : 21;
    cambiarLinea(clave, {
      productoServicioId: p.id,
      descripcion: p.descripcion,
      precioUnitario: String(precio),
      ...(sinCuota ? { tipoIva: 0, ivaPrevio: iva } : { tipoIva: iva }),
    });
  };

  /** Elige el tipo de operacion: sin cuota, IVA a 0 (y se guarda el anterior); sin retencion, IRPF a 0. */
  function aplicarTipo(codigo: string) {
    setTipoOperacion(codigo);
    setSupuesto('');
    setReferenciaLegal('');
    const r = contexto?.tipos.find((t) => t.codigo === codigo);
    if (!r) return;
    if (!r.llevaCuota) {
      setLineas((ls) => ls.map((l) => (l.tipoIva === 0 ? l : { ...l, tipoIva: 0, ivaPrevio: l.tipoIva })));
    } else {
      setLineas((ls) => ls.map((l) => (l.ivaPrevio !== undefined ? { ...l, tipoIva: l.ivaPrevio, ivaPrevio: undefined } : l.tipoIva === 0 ? { ...l, tipoIva: 21 } : l)));
    }
    if (!r.admiteRetencion) setIrpf(0);
    if (r.tiposFacturaProhibidos.includes(tipoFactura)) setTipoFactura('F1');
  }

  /**
   * Cambio de moneda con precios ya escritos: se pregunta si se convierten.
   *  - De la moneda de la contabilidad a otra: al tipo del BCE de la nueva para
   *    la fecha de la operacion (se pide al servidor; mientras la factura va en
   *    la de la contabilidad no hay tipo cargado). Sin tipo, se avisa de que los
   *    precios no se convierten.
   *  - De otra a la de la contabilidad: al tipo aplicado (el escrito a mano, si lo hay).
   * `aMano` = false cuando la cambia el cliente elegido: la moneda sigue "sin tocar".
   */
  const cambiarMoneda = async (nueva: string, aMano = true) => {
    if (nueva === monedaDoc) return;
    if (aMano) setMonedaTocada(true);
    const conPrecios = lineas.some((l) => l.precioUnitario.trim() !== '');
    const aDivisa = monedaDoc === monedaCuenta && nueva !== monedaCuenta;
    const aCuenta = monedaDoc !== monedaCuenta && nueva === monedaCuenta;
    if (conPrecios && (aDivisa || aCuenta)) {
      let tc: number | null = aCuenta ? tipoAplicado : null;
      if (aDivisa && devengo) {
        tc = await apiFetch<TipoCambioApi>(companyPath(`/tipos-cambio?moneda=${encodeURIComponent(nueva)}&fecha=${devengo}`))
          .then((r) => r.tipoCambio)
          .catch(() => null);
      }
      if (tc && tc > 0) {
        const ok = window.confirm(
          `¿Convertir los precios a ${nueva} al tipo ${textoTipo(monedaCuenta, aDivisa ? nueva : monedaDoc, tc)}?\n\n` +
            'Aceptar: se convierten. Cancelar: se quedan como están (solo cambia la moneda).',
        );
        if (ok) {
          const t = tc;
          setLineas((ls) =>
            ls.map((l) => {
              const p = parseImporte(l.precioUnitario);
              if (!Number.isFinite(p)) return l;
              return { ...l, precioUnitario: String(redondear2(aDivisa ? p * t : p / t)) };
            }),
          );
        }
      } else {
        window.alert(`No hay tipo de cambio para convertir los precios: se quedan como están, ahora en ${nueva}. Revísalos.`);
      }
    }
    setTipoManual('');
    setMoneda(nueva);
  };

  // Mismo calculo que el servidor (redondeo por linea), para que lo que se ve sea lo que se emite.
  const calculo = useMemo(
    () =>
      calcularFactura(
        lineas.map((l) => ({
          cantidad: num(l.cantidad),
          precioUnitario: num(l.precioUnitario),
          descuentoPorcentaje: num(l.descuentoPorcentaje),
          tipoIva: l.tipoIva,
          tipoRetencion: irpf,
        })),
        { tipoCambio: tipoAplicado, mismaMoneda: !enDivisa },
      ),
    [lineas, irpf, tipoAplicado, enDivisa],
  );
  const totales = calculo.doc;
  const fmt = (n: number) => formatoImporte(n, monedaDoc);
  const fmtCuenta = (n: number) => formatoImporte(n, monedaCuenta);

  // Revision fiscal en el servidor (mencion del PDF, errores y avisos), sin guardar nada.
  const firmaRevision = JSON.stringify([clienteId, tipoOperacion, supuesto, referenciaLegal, tipoFactura, irpf, lineas.map((l) => [l.tipoIva, l.productoServicioId])]);
  const ultimaRevision = useRef('');
  useEffect(() => {
    if (!espanola || !contexto || !clienteId) {
      setRevision(null);
      return;
    }
    if (ultimaRevision.current === firmaRevision) return;
    const t = setTimeout(() => {
      ultimaRevision.current = firmaRevision;
      const c = causaYReferencia();
      apiFetch<Revision>(companyPath('/income-invoices/sugerir-operacion'), {
        method: 'POST',
        body: JSON.stringify({
          customerId: clienteId,
          tipoOperacion: tipoOperacion || null,
          causaExencion: c.causaExencion,
          referenciaLegal: c.referenciaLegal,
          tipoFactura,
          // La proforma no se emite: sus contradicciones son avisos.
          modo: esProforma ? 'guardar' : 'emitir',
          lineas: lineas.map((l) => ({ tipoIva: l.tipoIva, tipoRetencion: irpf, productoServicioId: l.productoServicioId || undefined })),
        }),
      })
        .then(setRevision)
        .catch(() => setRevision(null));
    }, 500);
    return () => clearTimeout(t);
    // causaYReferencia depende de lo que ya esta en la firma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaRevision, espanola, contexto, clienteId]);

  /** Causa de exencion y referencia legal segun el supuesto elegido. */
  function causaYReferencia(): { causaExencion: string | null; referenciaLegal: string | null } {
    if (tipoOperacion === 'EXENTA') {
      const s = contexto?.supuestosExencion.find((x) => x.codigo === supuesto);
      if (!s) return { causaExencion: null, referenciaLegal: null };
      return { causaExencion: s.causa ?? null, referenciaLegal: (s.referenciaLegal ?? referenciaLegal.trim()) || null };
    }
    if (tipoOperacion === 'ISP_NACIONAL') {
      const s = contexto?.supuestosIsp.find((x) => x.codigo === supuesto);
      return { causaExencion: null, referenciaLegal: (s?.referenciaLegal ?? referenciaLegal.trim()) || null };
    }
    return { causaExencion: null, referenciaLegal: null };
  }

  const serieElegida = series.find((s) => s.codigo === serie);

  const cuerpo = () => {
    const fiscal = espanola ? { tipoOperacion: tipoOperacion || null, ...causaYReferencia() } : {};
    return {
      customer: { id: clienteId },
      // La proforma va siempre en su serie de proformas (la pone el servidor).
      serie: esProforma ? undefined : serie,
      tipoFactura,
      formaPago,
      fechaEmision,
      fechaVencimiento,
      fechaOperacion: fechaOperacion && fechaOperacion !== fechaEmision ? fechaOperacion : null,
      observaciones: observaciones.trim() || undefined,
      moneda: monedaDoc,
      // Solo el tipo escrito a mano; sin el, el del BCE (null: volver al del BCE).
      ...(enDivisa && tipoManual.trim() ? { tipoCambio: manual } : volverAlBce ? { tipoCambio: null } : {}),
      ...fiscal,
      lineas: lineas.map((l) => ({
        descripcion: l.descripcion.trim(),
        cantidad: num(l.cantidad),
        precioUnitario: num(l.precioUnitario),
        descuentoPorcentaje: num(l.descuentoPorcentaje),
        tipoIva: sinCuota ? 0 : l.tipoIva,
        tipoRetencion: sinRetencion ? 0 : irpf,
        productoServicioId: l.productoServicioId || undefined,
        moneda: monedaDoc,
      })),
    };
  };

  const comprobar = (emitir: boolean): string => {
    if (!contexto && emitir) {
      return errorContexto ? `No se han podido cargar los datos fiscales de la empresa: ${errorContexto}` : 'Cargando los datos de la empresa…';
    }
    if (!clienteId) return 'Elige el cliente.';
    if (!serie && !esProforma) return 'Elige la serie.';
    if (fechaVencimiento < fechaEmision) return 'El vencimiento no puede ser anterior a la fecha de emisión.';
    if (fechaOperacion && fechaOperacion > fechaEmision) return 'La fecha de la operación no puede ser posterior a la de emisión.';
    const mal = lineas.findIndex((l) => !l.descripcion.trim() || num(l.cantidad) === 0 || l.precioUnitario === '');
    if (mal >= 0) return `Completa la línea ${mal + 1}: descripción, cantidad y precio.`;
    if (enDivisa && tipoManual.trim() && !(manual > 0)) return 'El tipo de cambio tiene que ser un número mayor que cero.';
    if (enDivisa && tipoManual.trim() && bce?.tipoCambio && pareceInvertido(manual, bce.tipoCambio)) return avisoTipo;
    if (emitir && !esProforma) {
      if (espanola && !tipoOperacion) return 'Elige el tipo de operación de la factura.';
      if (enDivisa && !tipoAplicado) return `Sin tipo de cambio del BCE: indica el tipo a mano (1 ${monedaCuenta} = … ${monedaDoc}).`;
      // Al emitir nunca vale un tipo viejo: el que se ve es orientativo (de dias anteriores).
      if (enDivisa && !tipoManual.trim() && bce?.provisional) {
        return `Aún no está el tipo del BCE de la fecha de la operación (el que se ve es orientativo, del ${fechaES(bce.fechaTipoCambio)}): indica el tipo a mano o guarda el borrador y pásalo a factura más tarde.`;
      }
      const errores = revision?.revision?.errores ?? [];
      if (errores.length > 0) return errores.map((e) => e.mensaje).join(' ');
    }
    return '';
  };

  const guardar = async (emitir: boolean) => {
    const fallo = comprobar(emitir);
    if (fallo) return setError(fallo);
    if (emitir) {
      const siguiente = (serieElegida?.ultimoNumero ?? 0) + 1;
      const tipoTxt = enDivisa
        ? `\n\nTipo de cambio: ${tipoManual.trim() ? `${textoTipo(monedaCuenta, monedaDoc, manual)} (indicado a mano)` : `el del BCE del día de la operación${tipoAplicado ? ` (hoy, ${textoTipo(monedaCuenta, monedaDoc, tipoAplicado)})` : ''}`}.`
        : '';
      const ok = window.confirm(
        `Vas a pasar a factura por ${fmt(totales.total)} (número ${serie}-${siguiente}, aprox.).${tipoTxt}\n\n` +
          'Una vez pasada a factura recibirá el número de la serie y no se podrá modificar ni borrar; solo corregir con una rectificativa.',
      );
      if (!ok) return;
    }
    setGuardando(true);
    setError('');
    try {
      let id = borradorId ?? idCreado;
      if (id) {
        await apiFetch(companyPath(`/income-invoices/${id}`), { method: 'PUT', body: JSON.stringify(cuerpo()) });
      } else {
        const { invoice } = await apiFetch<{ invoice: { id: string } }>(companyPath('/income-invoices'), {
          method: 'POST',
          body: JSON.stringify(esProforma ? { ...cuerpo(), proforma: true } : { ...cuerpo(), borrador: true }),
        });
        id = invoice.id;
        // Si pasarlo a factura falla, el siguiente intento modifica este borrador (no crea otro).
        setIdCreado(invoice.id);
      }
      if (emitir && !esProforma) {
        const { invoice } = await apiFetch<{ invoice: { contabilizada?: boolean; motivoSinAsiento?: string | null } }>(
          companyPath(`/income-invoices/${id}/finalizar`),
          {
            method: 'POST',
            body: JSON.stringify({ fechaEmision, ...(enDivisa && tipoManual.trim() ? { tipoCambio: manual } : {}) }),
          },
        );
        if (invoice.contabilizada === false) {
          try {
            sessionStorage.setItem(`conta_sin_asiento_${id}`, invoice.motivoSinAsiento || 'No se pudo contabilizar.');
          } catch {
            // Sin sessionStorage: la ficha no muestra el aviso, pero tiene el boton de contabilizar.
          }
        }
      }
      router.push(`/dashboard/${esProforma ? 'proformas' : 'facturas'}/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setGuardando(false);
    }
  };

  if (cargando) return <p className="p-6 text-slate-500">Cargando…</p>;

  const titulo = esProforma
    ? borradorId
      ? `Editar proforma ${numeroProforma}`.trim()
      : 'Nueva proforma'
    : borradorId
      ? 'Editar borrador'
      : 'Nueva factura';

  const revisionErrores = revision?.revision?.errores ?? [];
  const avisosFiscales = [
    ...(revision?.avisosCliente ?? contexto?.avisosCliente ?? []),
    ...(revision?.revision?.avisos ?? []),
  ]
    // Sin repetir, y sin lo que ya sale como error.
    .filter((a, i, arr) => arr.findIndex((b) => b.codigo === a.codigo) === i && !revisionErrores.some((e) => e.codigo === a.codigo));
  const supuestosLista = tipoOperacion === 'EXENTA' ? contexto?.supuestosExencion ?? [] : tipoOperacion === 'ISP_NACIONAL' ? contexto?.supuestosIsp ?? [] : [];
  const etiquetaSinCuota = regla && !regla.llevaCuota ? regla.etiquetaCorta : 'Sin IVA';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link
          href={esProforma ? '/dashboard/proformas' : '/dashboard/facturas'}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label={esProforma ? 'Volver a proformas' : 'Volver a facturas'}
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
        <Tooltip
          text={
            esProforma
              ? 'La proforma recibe su número P al guardarla. No es una factura: no cuenta para el IVA ni la contabilidad. Si el cliente la acepta, pásala a factura desde su ficha.'
              : 'Guarda como borrador mientras la preparas. Al pasarla a factura recibe el siguiente número de la serie y ya no se puede cambiar.'
          }
        />
      </div>

      {esProforma && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Documento sin validez fiscal: se guarda tal cual, sin contabilizarse ni contar para el IVA.
        </p>
      )}

      {contexto && !espanola && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Tu empresa no está establecida en España: la factura va sin IVA ni retención, en{' '}
          {monedaCuenta === 'USD' ? 'dólares' : monedaCuenta === 'EUR' ? 'euros' : monedaCuenta} ({monedaCuenta}) y el PDF sale en inglés.
        </p>
      )}

      {errorContexto && !contexto && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No se han podido cargar los datos fiscales de la empresa ({errorContexto}). Puedes guardar el borrador, pero no pasarlo a factura hasta que se carguen.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className={etiqueta} htmlFor="cliente">Cliente</label>
          <select id="cliente" className={campo} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Elige un cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombreFiscal} — {c.nifCif}
                {c.pais && c.pais !== 'ES' ? ` (${c.pais})` : ''}
              </option>
            ))}
          </select>
          {clientes.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              No hay clientes. <Link href="/dashboard/clientes" className="text-blue-700 underline">Da de alta uno</Link> antes de facturar.
            </p>
          )}
        </div>
        <div>
          <label className={etiqueta} htmlFor="serie">Serie</label>
          {esProforma ? (
            <p id="serie" className={`${campo} bg-slate-50 text-slate-600`}>
              {numeroProforma ? `Proforma ${numeroProforma}` : 'Proformas (P): el número se asigna al guardar'}
            </p>
          ) : (
            <select id="serie" className={campo} value={serie} onChange={(e) => setSerie(e.target.value)}>
              {series.map((s) => (
                <option key={s.id} value={s.codigo}>
                  {s.codigo} — {s.descripcion}
                </option>
              ))}
            </select>
          )}
        </div>

        {espanola && contexto && (
          <>
            <div className="md:col-span-2">
              <label className={etiqueta} htmlFor="tipo-operacion">
                Tipo de operación (IVA)
              </label>
              <select
                id="tipo-operacion"
                className={campo}
                value={tipoOperacion}
                onChange={(e) => {
                  setTipoTocado(true);
                  aplicarTipo(e.target.value);
                }}
              >
                <option value="">Elige…</option>
                {contexto.tipos.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
              {tipoTocado && clienteId && sugerido && sugerido !== tipoOperacion && (
                <p className="mt-1 text-xs text-slate-600">
                  Para este cliente se suele usar «{contexto.tipos.find((t) => t.codigo === sugerido)?.etiqueta ?? sugerido}».{' '}
                  <button type="button" className="font-medium text-blue-700 underline" onClick={() => aplicarTipo(sugerido)}>
                    Aplicar
                  </button>
                </p>
              )}
            </div>
            {supuestosLista.length > 0 ? (
              <div>
                  <label className={etiqueta} htmlFor="supuesto">
                    {tipoOperacion === 'EXENTA' ? 'Supuesto de exención' : 'Supuesto (opcional)'}
                  </label>
                  <select id="supuesto" className={campo} value={supuesto} onChange={(e) => setSupuesto(e.target.value)}>
                    <option value="">{tipoOperacion === 'EXENTA' ? 'Elige…' : 'Sin indicar'}</option>
                    {supuestosLista.map((s) => (
                      <option key={s.codigo} value={s.codigo}>
                        {s.etiqueta}
                      </option>
                    ))}
                  </select>
                  {supuesto === 'OTRO' && (
                    <input
                      aria-label="Precepto legal"
                      className={`${campo} mt-2`}
                      maxLength={200}
                      value={referenciaLegal}
                      placeholder={tipoOperacion === 'EXENTA' ? 'Ej.: art. 20.Uno.12.º Ley 37/1992' : 'Ej.: g)'}
                      onChange={(e) => setReferenciaLegal(e.target.value)}
                    />
                  )}
              </div>
            ) : (
              <div className="hidden md:block" />
            )}
          </>
        )}

        <div>
          <label className={etiqueta} htmlFor="moneda">Moneda</label>
          <select
            id="moneda"
            className={campo}
            value={monedaDoc}
            disabled={!contexto || !espanola || (contexto.monedasFactura?.length ?? 0) < 2}
            onChange={(e) => void cambiarMoneda(e.target.value)}
          >
            {(contexto?.monedasFactura ?? [{ codigo: monedaCuenta, nombre: monedaCuenta, simbolo: monedaCuenta }]).map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo} — {NOMBRE_MONEDA[m.codigo] ?? m.nombre}
              </option>
            ))}
          </select>
        </div>
        {enDivisa && (
          <div className="md:col-span-2">
            <label className={etiqueta} htmlFor="tipo-cambio">
              Tipo de cambio
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">1 {monedaCuenta} =</span>
              <input
                id="tipo-cambio"
                inputMode="decimal"
                className={`${campo.replace('w-full ', '')} w-32 text-right font-mono`}
                value={tipoManual || (bce?.tipoCambio ? formatoTipo(bce.tipoCambio) : '')}
                placeholder={bceCargando ? 'Buscando…' : '0,0000'}
                onChange={(e) => {
                  setTipoManual(e.target.value);
                  setVolverAlBce(false);
                }}
              />
              <span>{monedaDoc}</span>
              {tipoManual.trim() ? (
                <>
                  <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs">Indicado a mano</span>
                  {bce?.tipoCambio && (
                    <button
                      type="button"
                      className="text-xs font-medium text-blue-700 underline"
                      onClick={() => {
                        setTipoManual('');
                        setVolverAlBce(true);
                      }}
                    >
                      Usar el del BCE ({formatoTipo(bce.tipoCambio)})
                    </button>
                  )}
                </>
              ) : (
                bce?.tipoCambio && (
                  <span className="text-xs text-slate-500">
                    BCE {fechaES(bce.fechaTipoCambio)}
                    {bce.provisional ? ' · provisional' : ''}
                  </span>
                )
              )}
            </div>
            {avisoTipo && <p className="mt-1 text-xs text-amber-700">{avisoTipo}</p>}
            {bceError && !tipoManual.trim() && <p className="mt-1 text-xs text-amber-700">{bceError}</p>}
            {!esProforma && (
              <p className="mt-1 text-xs text-slate-500">
                Se toma el tipo de referencia del BCE de la fecha de la operación; el definitivo se fija al pasarla a factura. Si lo cambias, queda el tuyo.
              </p>
            )}
          </div>
        )}

        {espanola && (
          <div>
            <label className={etiqueta} htmlFor="tipo">Tipo de factura</label>
            <select id="tipo" className={campo} value={tipoFactura} onChange={(e) => setTipoFactura(e.target.value)}>
              <option value="F1">Completa (F1)</option>
              <option value="F2" disabled={!!regla?.tiposFacturaProhibidos.includes('F2')}>
                Simplificada / ticket (F2)
              </option>
            </select>
          </div>
        )}
        <div>
          <label className={etiqueta} htmlFor="forma-pago">Forma de pago</label>
          <select id="forma-pago" className={campo} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
            {FORMAS_PAGO.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiqueta} htmlFor="emision">Fecha de emisión</label>
          <input id="emision" type="date" className={campo} value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="vencimiento">Vencimiento</label>
          <input id="vencimiento" type="date" className={campo} value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="operacion">
            Fecha de la operación <span className="font-normal text-slate-500">(si es distinta)</span>
          </label>
          <input
            id="operacion"
            type="date"
            className={campo}
            max={fechaEmision}
            value={fechaOperacion}
            onChange={(e) => setFechaOperacion(e.target.value)}
          />
        </div>
      </section>

      {espanola && contexto && clienteId && (revision?.mencion || revisionErrores.length > 0 || avisosFiscales.length > 0) && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          {revision?.mencion && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mención en la factura</p>
              <p className="mt-0.5 text-slate-800">{revision.mencion.es}</p>
              {revision.mencion.en && <p className="text-slate-500">{revision.mencion.en}</p>}
            </div>
          )}
          {revisionErrores.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {revisionErrores.map((e) => (
                <li key={e.codigo} className="flex gap-2">
                  <WarningCircle size={16} className="mt-0.5 shrink-0" /> {e.mensaje}
                </li>
              ))}
            </ul>
          )}
          {avisosFiscales.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              {avisosFiscales.map((a) => (
                <li key={a.codigo} className="flex gap-2">
                  <WarningCircle size={16} className="mt-0.5 shrink-0" /> {a.mensaje}
                  {a.codigo === 'CLIENTE_SIN_NIF_IVA' && (
                    <Link href={`/dashboard/clientes/${clienteId}`} className="whitespace-nowrap font-medium underline">
                      Ficha del cliente
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-900">Líneas</h2>
          <button
            type="button"
            onClick={() => setLineas((ls) => [...ls, lineaVacia(sinCuota ? 0 : 21)])}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} /> Añadir línea
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${espanola ? 'min-w-[860px]' : 'min-w-[720px]'}`}>
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Cant.</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Precio ({simboloMoneda(monedaDoc)})</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Dto. %</th>
                {espanola && <th className="w-24 px-3 py-2 font-medium">IVA</th>}
                <th className="w-32 px-3 py-2 text-right font-medium">Importe</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineas.map((l, i) => {
                const bruto = r2(num(l.cantidad) * num(l.precioUnitario));
                const importe = r2(bruto - r2((bruto * num(l.descuentoPorcentaje)) / 100));
                return (
                  <tr key={l.clave}>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Producto de la línea ${i + 1}`}
                        className={campo}
                        value={l.productoServicioId}
                        onChange={(e) => elegirProducto(l.clave, e.target.value)}
                      >
                        <option value="">Libre</option>
                        {productos.filter((p) => !p.bloqueado).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.referencia} — {p.descripcion}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Descripción de la línea ${i + 1}`}
                        className={campo}
                        value={l.descripcion}
                        onChange={(e) => cambiarLinea(l.clave, { descripcion: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Cantidad de la línea ${i + 1}`}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.cantidad}
                        onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Precio de la línea ${i + 1} en ${monedaDoc}`}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.precioUnitario}
                        onChange={(e) => cambiarLinea(l.clave, { precioUnitario: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Descuento de la línea ${i + 1}`}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.descuentoPorcentaje}
                        onChange={(e) => cambiarLinea(l.clave, { descuentoPorcentaje: e.target.value })}
                      />
                    </td>
                    {espanola && (
                      <td className="px-3 py-2">
                        {sinCuota ? (
                          <p className={`${campo} whitespace-nowrap bg-slate-100 text-slate-600`} title="El tipo de operación no lleva IVA">
                            {etiquetaSinCuota}
                          </p>
                        ) : (
                          <select
                            aria-label={`IVA de la línea ${i + 1}`}
                            className={campo}
                            value={l.tipoIva}
                            onChange={(e) => cambiarLinea(l.clave, { tipoIva: Number(e.target.value) })}
                          >
                            {IVAS.map((t) => (
                              <option key={t} value={t}>
                                {t} %
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{fmt(importe)}</td>
                    <td className="px-1 py-2">
                      <button
                        type="button"
                        aria-label={`Quitar la línea ${i + 1}`}
                        disabled={lineas.length === 1}
                        onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          {espanola && (
            <div>
              <label className={etiqueta} htmlFor="irpf">
                Retención de IRPF
              </label>
              <select id="irpf" className={campo} value={sinRetencion ? 0 : irpf} disabled={sinRetencion} onChange={(e) => setIrpf(Number(e.target.value))}>
                {IRPFS.map((t) => (
                  <option key={t} value={t}>
                    {t === 0 ? 'Sin retención' : `${t} %`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {sinRetencion ? 'A un cliente no residente no se le aplica retención.' : 'Profesionales: 15 % (7 % los tres primeros años de actividad).'}
              </p>
            </div>
          )}
          <div>
            <label className={etiqueta} htmlFor="obs">Observaciones</label>
            <textarea
              id="obs"
              rows={3}
              className={campo}
              value={observaciones}
              placeholder="Ej.: pedido nº 1234; entrega en almacén; gracias por su confianza…"
              onChange={(e) => setObservaciones(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Se imprimen en {esProforma ? 'la proforma' : 'la factura'}.</p>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Base imponible</dt>
              <dd className="font-mono tabular-nums">{fmt(totales.base)}</dd>
            </div>
            {espanola &&
              totales.porTipo.map((t) => (
                <div key={t.tipoIva} className="flex justify-between gap-3">
                  <dt className="text-slate-600">
                    {t.tipoIva === 0 && regla && !regla.llevaCuota ? `${regla.etiquetaCorta} sobre ${fmt(t.base)}` : `IVA ${t.tipoIva} % sobre ${fmt(t.base)}`}
                  </dt>
                  <dd className="font-mono tabular-nums">{fmt(t.cuota)}</dd>
                </div>
              ))}
            {totales.retencion > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600">Retención IRPF {irpf} %</dt>
                <dd className="font-mono tabular-nums">{fmt(-totales.retencion)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-slate-300 pt-2 text-base font-bold text-slate-900">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{fmt(totales.total)}</dd>
            </div>
          </dl>
          {enDivisa && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="mb-1 font-medium text-slate-700">
                Contravalor en {monedaCuenta} <span className="font-normal text-slate-500">(provisional hasta emitir)</span>
              </p>
              {calculo.cuenta ? (
                <dl className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Base imponible</dt>
                    <dd className="font-mono tabular-nums">{fmtCuenta(calculo.cuenta.base)}</dd>
                  </div>
                  {espanola && !sinCuota && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-600">Cuota de IVA</dt>
                      <dd className="font-mono tabular-nums">{fmtCuenta(calculo.cuenta.iva)}</dd>
                    </div>
                  )}
                  {calculo.cuenta.retencion > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-600">Retención</dt>
                      <dd className="font-mono tabular-nums">{fmtCuenta(-calculo.cuenta.retencion)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 font-semibold text-slate-900">
                    <dt>Total</dt>
                    <dd className="font-mono tabular-nums">{fmtCuenta(calculo.cuenta.total)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-slate-500">Sin tipo de cambio todavía.</p>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {esProforma ? (
          <button
            type="button"
            disabled={guardando}
            onClick={() => guardar(false)}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar proforma'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={guardando}
              onClick={() => guardar(false)}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={guardando || !contexto}
              onClick={() => guardar(true)}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Pasar a factura'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
