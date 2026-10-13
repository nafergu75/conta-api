'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Money, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte, formatoTipo, parseImporte, parseTipo, redondear2, textoTipo } from '@/lib/moneda';
import { hoyIso } from '@/lib/anios';

/**
 * Cobros de una factura de venta o pagos de una factura de gasto: lo pendiente,
 * la lista de cobros/pagos (con su asiento) y el alta y anulacion. Cada cobro
 * genera un asiento 572/570 contra la cuenta del cliente (o del proveedor).
 *
 * Factura en otra moneda que la de la contabilidad: lo pendiente va en la
 * moneda de la factura; el banco recibe lo cobrado al tipo del dia (el del BCE,
 * el indicado o lo que abona el banco) y la diferencia con el tipo de la
 * factura va a la 768 (ganancia) o a la 668 (perdida); la comision, a la 626.
 *
 * Abono de proveedor (factura de gasto en negativo): no se paga, el proveedor
 * devuelve lo que queda a tu favor. Aqui se registra esa devolucion (el
 * servidor la guarda en negativo; se escribe en positivo).
 *
 * Abono de venta (factura de venta en negativo): lo que no se come la factura
 * que rectifica queda a favor del cliente (`aFavor`, de la ficha) y aqui se
 * registra su devolucion al cliente (en positivo; el servidor la guarda en
 * negativo, con el asiento de la cuenta del cliente contra el banco o la caja).
 */

type Tipo = 'INGRESO' | 'GASTO';

interface Cobro {
  id: string;
  fecha: string;
  /** En la moneda de cuenta: lo aplicado a la cuenta del cliente (430), al tipo de la factura. */
  importe: number;
  /** En la moneda de la factura (lo que reduce lo pendiente). */
  importeDoc?: number;
  /** En la moneda de cuenta: lo que entro en el banco o la caja. */
  importeTesoreria?: number;
  tipoCambio?: number;
  fuenteTipoCambio?: string;
  /** En lo que entra en el banco, > 0 ganancia (768) y < 0 perdida (668); en lo que sale, al reves. */
  diferenciaCambio?: number;
  comisionBancaria?: number;
  cuentaTesoreria: string;
  medio: 'BANCO' | 'CAJA';
  nota: string | null;
  estado: 'ACTIVO' | 'ANULADO';
  asientoNumero: string | null;
}

interface Resumen {
  /** Moneda de la factura: total, cobrado y pendiente van en ella. */
  moneda?: string;
  monedaCuenta?: string;
  totalFactura: number;
  importeCobrado: number;
  importePendiente: number;
  /** Gastos: lo compensado con abonos (incluido en importeCobrado). En un abono, en negativo. */
  importeCompensado?: number;
  /** Gastos: es un abono (total < 0): sus «pagos» son devoluciones recibidas. */
  esAbono?: boolean;
  /** Lo mismo en la moneda de cuenta (cuadra con la 430). */
  totalFacturaCuenta?: number;
  importeCobradoCuenta?: number;
  importePendienteCuenta?: number;
  estado: string;
  /** Subcuenta del cliente o proveedor contra la que va el cobro o pago (43000012, 41000007...). */
  cuentaTercero?: string | null;
  cobros: Cobro[];
}

interface CuentaBancaria {
  id: string;
  iban: string;
  bancoNombre?: string;
  subcuentaCodigo: string;
  activa: boolean;
  moneda?: string;
}

interface TipoCambioApi {
  tipoCambio: number | null;
  fechaTipoCambio: string | null;
  aviso?: string;
}
const fecha = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES') : '');
/** Hoy en España (toISOString da la fecha en UTC: de 00:00 a 02:00 en España saldría ayer). */
const hoy = () => hoyIso();

const boton =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

const TEXTOS = {
  INGRESO: { ruta: 'income-invoices', recurso: 'cobros', uno: 'cobro', titulo: 'Cobros', registrar: 'Registrar cobro', hecho: 'Cobro registrado.', nada: 'Todavía no hay cobros.', sinBancos: 'No hay cuentas bancarias activas: créalas en Tesorería para cobrar por banco.' },
  GASTO: { ruta: 'expense-invoices', recurso: 'pagos', uno: 'pago', titulo: 'Pagos', registrar: 'Registrar pago', hecho: 'Pago registrado.', nada: 'Todavía no hay pagos.', sinBancos: 'No hay cuentas bancarias activas: créalas en Tesorería para pagar desde el banco.' },
} as const;
/** Abono de proveedor: lo que se registra es la devolución recibida. */
const TEXTOS_ABONO = {
  ruta: 'expense-invoices',
  recurso: 'pagos',
  uno: 'devolución',
  titulo: 'Devoluciones recibidas',
  registrar: 'Registrar devolución recibida',
  hecho: 'Devolución registrada.',
  nada: 'Todavía no hay devoluciones.',
  sinBancos: 'No hay cuentas bancarias activas: créalas en Tesorería para registrar lo recibido en el banco.',
} as const;
/** Abono de venta: lo que se registra es la devolución al cliente. */
const TEXTOS_DEVOLUCION_CLIENTE = {
  ruta: 'income-invoices',
  recurso: 'cobros',
  uno: 'devolución',
  titulo: 'Devoluciones al cliente',
  registrar: 'Registrar devolución',
  hecho: 'Devolución registrada.',
  nada: 'Todavía no hay devoluciones.',
  sinBancos: 'No hay cuentas bancarias activas: créalas en Tesorería para devolver por banco.',
} as const;

/** Textos según el tipo y si es un abono (devoluciones en vez de cobros o pagos). */
const textosDe = (tipo: Tipo, abono: boolean) => (!abono ? TEXTOS[tipo] : tipo === 'GASTO' ? TEXTOS_ABONO : TEXTOS_DEVOLUCION_CLIENTE);

/**
 * El dinero sale del banco o la caja: el pago de una compra y la devolución al
 * cliente de un abono de venta. El servidor los calcula como un pago: la
 * comisión sale aparte y la diferencia de cambio positiva es pérdida (668).
 */
const salidaDeDinero = (tipo: Tipo, abono: boolean) => (tipo === 'GASTO' ? !abono : abono);

export default function CobrosFactura({
  tipo,
  facturaId,
  puedeEditar,
  fechaFactura,
  moneda: monedaProp = 'EUR',
  monedaCuenta: monedaCuentaProp = 'EUR',
  abono = false,
  aFavor,
  sustituidaPor = null,
  sustituyeA = null,
  onCambio,
}: {
  tipo: Tipo;
  facturaId: string;
  puedeEditar: boolean;
  /** No se puede cobrar con fecha anterior a la de la factura. */
  fechaFactura?: string;
  /** Moneda de la factura y de la contabilidad (por defecto EUR: las compras van siempre en la de cuenta). */
  moneda?: string;
  monedaCuenta?: string;
  /** Abono (factura en negativo): devoluciones recibidas (gasto) o devoluciones al cliente (venta). */
  abono?: boolean;
  /** Abono de venta: lo que queda a favor del cliente (tope de la devolución), de la ficha. */
  aFavor?: number;
  /**
   * Venta sustituida por una rectificativa por sustitución: lo que queda por
   * cobrar es lo de esa rectificativa, y se cobra en ella. Aquí ya no se
   * registran cobros (los que tenga se pueden ver y anular).
   */
  sustituidaPor?: { id: string; numero: string | null } | null;
  /**
   * Rectificativa por sustitución de una venta de la app: lo cobrado a la
   * factura que sustituye también cuenta, para no cobrar dos veces (como en la
   * cartera de cobros).
   */
  sustituyeA?: { id: string; numero: string | null } | null;
  /** Se llama tras registrar o anular (para recargar la factura). */
  onCambio?: () => void;
}) {
  const esAbono = abono;
  const abonoVenta = abono && tipo === 'INGRESO';
  const t = textosDe(tipo, esAbono);
  const base = companyPath(`/${t.ruta}/${facturaId}/${t.recurso}`);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setResumen(await apiFetch<Resumen>(base));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [base]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Rectificativa por sustitución: lo cobrado a la factura que sustituye (cobros activos), en su
  // moneda y en la de cuenta. undefined mientras se carga; null si no hay o no se ha podido leer.
  const idSustituida = sustituyeA?.id ?? null;
  const [cobradoSustituida, setCobradoSustituida] = useState<{ doc: number; cuenta: number } | null | undefined>(idSustituida ? undefined : null);
  useEffect(() => {
    if (!idSustituida) {
      setCobradoSustituida(null);
      return;
    }
    let vivo = true;
    setCobradoSustituida(undefined);
    apiFetch<Resumen>(companyPath(`/income-invoices/${idSustituida}/cobros`))
      .then((r) => {
        if (!vivo) return;
        const activos = (r.cobros ?? []).filter((c) => c.estado === 'ACTIVO');
        setCobradoSustituida({
          doc: redondear2(activos.reduce((a, c) => a + (c.importeDoc ?? c.importe), 0)),
          cuenta: redondear2(activos.reduce((a, c) => a + c.importe, 0)),
        });
      })
      // Sin poder leerlo, manda lo que diga el servidor de esta factura.
      .catch(() => vivo && setCobradoSustituida(null));
    return () => {
      vivo = false;
    };
  }, [idSustituida]);

  const moneda = resumen?.moneda ?? monedaProp;
  const monedaCuenta = resumen?.monedaCuenta ?? monedaCuentaProp;
  const enDivisa = moneda !== monedaCuenta;
  const fmt = (n: number) => formatoImporte(n, moneda);
  const fmtCuenta = (n: number) => formatoImporte(n, monedaCuenta);

  const anular = async (c: Cobro) => {
    if (!window.confirm(`¿Anular ${esAbono ? 'la' : 'el'} ${t.uno} de ${fmt(Math.abs(c.importeDoc ?? c.importe))} del ${fecha(c.fecha)}?\n\nSu asiento (${c.asientoNumero ?? 'sin asiento'}) dejará de contar.`)) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const r = await apiFetch<{ resumen: Resumen; contraasiento: boolean }>(`${base}/${c.id}/anular`, { method: 'POST', body: '{}' });
      setResumen(r.resumen);
      const hecho = `${t.uno[0].toUpperCase()}${t.uno.slice(1)} ${esAbono ? 'anulada' : 'anulado'}.`;
      setAviso(r.contraasiento ? `${hecho} Como su periodo ya está cerrado, se ha hecho un contraasiento con fecha de hoy.` : hecho);
      onCambio?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  // En un abono el pendiente llega en negativo: lo que queda a tu favor, en positivo. En uno de
  // venta, lo que queda a favor del cliente lo dice la ficha (aFavor, en la moneda de la factura y
  // ya descontado lo devuelto: es el tope de la próxima devolución).
  const activos = (resumen?.cobros ?? []).filter((c) => c.estado === 'ACTIVO');
  // Lo cobrado en esta factura (sus cobros activos), en su moneda y en la de cuenta.
  const cobradoPropio = redondear2(activos.reduce((a, c) => a + (c.importeDoc ?? c.importe), 0));
  const cobradoPropioCuenta = redondear2(activos.reduce((a, c) => a + c.importe, 0));
  // Rectificativa por sustitución: como mucho, su total menos sus cobros y los de la factura que sustituye.
  const topeSustitucion =
    resumen && !esAbono && cobradoSustituida
      ? {
          doc: Math.max(0, redondear2(resumen.totalFactura - cobradoPropio - cobradoSustituida.doc)),
          cuenta: Math.max(0, redondear2((resumen.totalFacturaCuenta ?? resumen.totalFactura) - cobradoPropioCuenta - cobradoSustituida.cuenta)),
        }
      : null;
  const pendiente = abonoVenta && aFavor !== undefined
    ? Math.max(0, aFavor)
    : esAbono
      ? -(resumen?.importePendiente ?? 0)
      : Math.min(resumen?.importePendiente ?? 0, topeSustitucion?.doc ?? Infinity);
  // Lo mismo en la moneda de cuenta. En un abono de venta, aFavor al tipo del propio abono (su total
  // en las dos monedas): así la vista previa de la cuenta del cliente no mezcla aFavor con el abono entero.
  const pendienteCuenta = (() => {
    if (!resumen) return pendiente;
    if (abonoVenta && aFavor !== undefined) {
      const proporcion = resumen.totalFacturaCuenta !== undefined && resumen.totalFactura ? resumen.totalFacturaCuenta / resumen.totalFactura : 1;
      return Math.round(pendiente * Math.abs(proporcion) * 100) / 100;
    }
    if (esAbono) return resumen.importePendienteCuenta !== undefined ? -resumen.importePendienteCuenta : pendiente;
    return Math.min(resumen.importePendienteCuenta ?? pendiente, topeSustitucion?.cuenta ?? Infinity);
  })();
  const devuelto = activos.reduce((a, c) => a + Math.abs(c.importeDoc ?? c.importe), 0);
  // Se puede registrar un cobro aquí: no en una sustituida (se cobra en su sustituta) ni mientras se lee lo cobrado a la que sustituye.
  const admiteCobros = !sustituidaPor && cobradoSustituida !== undefined;
  // Diferencia de cambio guardada: en lo que entra en el banco, > 0 es ganancia; en lo que sale (pagos y devoluciones al cliente), pérdida.
  const gananciaDe = (dif: number) => (salidaDeDinero(tipo, esAbono) ? dif < 0 : dif > 0);
  const compensado = Math.abs(resumen?.importeCompensado ?? 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{t.titulo}</h2>
          {resumen && (
            <p className="mt-0.5 text-sm text-slate-600">
              {abonoVenta ? (
                <>
                  Devuelto {fmt(Math.round(devuelto * 100) / 100)} ·{' '}
                  <span className={`font-semibold ${pendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>A favor del cliente: {fmt(pendiente)}</span>
                </>
              ) : esAbono ? (
                <>
                  Devuelto o aplicado {fmt(Math.abs(resumen.importeCobrado))} de {fmt(Math.abs(resumen.totalFactura))} ·{' '}
                  <span className={`font-semibold ${pendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>A tu favor: {fmt(pendiente)}</span>
                </>
              ) : (
                <>
                  {tipo === 'INGRESO' ? 'Cobrado' : 'Pagado'}{' '}
                  {fmt(sustituyeA ? cobradoPropio : Math.round((resumen.importeCobrado - compensado) * 100) / 100)}
                  {sustituyeA && cobradoSustituida && cobradoSustituida.doc > 0 && ` y ${fmt(cobradoSustituida.doc)} en la ${sustituyeA.numero ?? 'factura'} que sustituye,`}
                  {compensado > 0 && ` y descontado con abonos ${fmt(compensado)}`} de {fmt(resumen.totalFactura)} ·{' '}
                  {sustituidaPor ? (
                    <span className="font-semibold text-slate-700">
                      Sustituida por la{' '}
                      <Link href={`/dashboard/facturas/${sustituidaPor.id}`} className="underline">
                        {sustituidaPor.numero ?? 'rectificativa'}
                      </Link>
                      : lo que quede por cobrar se cobra en ella.
                    </span>
                  ) : (
                    <span className={`font-semibold ${pendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>Pendiente: {fmt(pendiente)}</span>
                  )}
                </>
              )}
              {enDivisa && resumen.importePendienteCuenta !== undefined && !sustituidaPor && (
                <span className="text-slate-500"> ({fmtCuenta(esAbono ? resumen.importePendienteCuenta : pendienteCuenta)} en la cuenta del cliente)</span>
              )}
            </p>
          )}
        </div>
        {puedeEditar && resumen && pendiente > 0 && admiteCobros && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Money size={16} /> {t.registrar}
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {aviso && <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}

      {resumen && resumen.cobros.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          {abonoVenta && pendiente <= 0 ? 'No hay nada que devolver: el abono se ha descontado de lo que debía el cliente.' : t.nada}
        </p>
      )}
      {resumen && resumen.cobros.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {resumen.cobros.map((c) => (
            <li key={c.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-2 ${c.estado === 'ANULADO' ? 'text-slate-400' : ''}`}>
              <span className="w-24 tabular-nums">{fecha(c.fecha)}</span>
              <span className={`w-32 text-right font-mono tabular-nums ${c.estado === 'ANULADO' ? 'line-through' : 'font-semibold text-slate-900'}`}>
                {fmt(Math.abs(c.importeDoc ?? c.importe))}
              </span>
              <span className="text-slate-600">{c.medio === 'CAJA' ? 'Caja (570)' : `Banco (${c.cuentaTesoreria})`}</span>
              {enDivisa && (
                <span className="w-full text-xs text-slate-500 sm:w-auto">
                  {c.tipoCambio ? `${textoTipo(monedaCuenta, moneda, c.tipoCambio)} · ` : ''}
                  {c.medio === 'CAJA' ? 'caja' : 'banco'} {fmtCuenta(Math.abs(c.importeTesoreria ?? c.importe))}
                  {c.comisionBancaria ? ` · comisión ${fmtCuenta(c.comisionBancaria)}` : ''}
                  {c.diferenciaCambio
                    ? ` · ${gananciaDe(c.diferenciaCambio) ? 'ganancia' : 'pérdida'} de cambio ${fmtCuenta(Math.abs(c.diferenciaCambio))} (${gananciaDe(c.diferenciaCambio) ? '768' : '668'})`
                    : ''}
                </span>
              )}
              {c.asientoNumero && <span className="font-mono text-xs text-slate-500">Asiento {c.asientoNumero}</span>}
              {c.nota && <span className="min-w-0 flex-1 truncate text-slate-500" title={c.nota}>{c.nota}</span>}
              <span className="ml-auto">
                {c.estado === 'ANULADO' ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">{esAbono ? 'Anulada' : 'Anulado'}</span>
                ) : (
                  puedeEditar && (
                    <button type="button" disabled={ocupado} onClick={() => anular(c)} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50">
                      Anular
                    </button>
                  )
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {abierto && resumen && (
        <ModalCobro
          tipo={tipo}
          abono={esAbono}
          base={base}
          pendiente={pendiente}
          pendienteCuenta={pendienteCuenta}
          cuentaTercero={resumen.cuentaTercero ?? null}
          moneda={moneda}
          monedaCuenta={monedaCuenta}
          fechaMinima={fechaFactura}
          onCerrar={() => setAbierto(false)}
          onHecho={(r) => {
            setAbierto(false);
            setResumen(r);
            setError('');
            setAviso(t.hecho);
            onCambio?.();
          }}
        />
      )}
    </section>
  );
}

function ModalCobro({
  tipo,
  abono = false,
  base,
  pendiente,
  pendienteCuenta,
  cuentaTercero,
  moneda,
  monedaCuenta,
  fechaMinima,
  onCerrar,
  onHecho,
}: {
  tipo: Tipo;
  /** Devolución de un abono (el pendiente es lo que queda a favor: el tuyo en compras, el del cliente en ventas). */
  abono?: boolean;
  base: string;
  /** Subcuenta del tercero (null si aun no tiene: la recibe al registrar). */
  cuentaTercero: string | null;
  /** En la moneda de la factura. */
  pendiente: number;
  /** En la moneda de cuenta (430), al tipo de la factura. */
  pendienteCuenta: number;
  moneda: string;
  monedaCuenta: string;
  fechaMinima?: string;
  onCerrar: () => void;
  onHecho: (r: Resumen) => void;
}) {
  const t = textosDe(tipo, abono);
  const abonoVenta = abono && tipo === 'INGRESO';
  // El dinero sale del banco: un pago de una compra o la devolución al cliente de un abono de venta.
  const saleDinero = salidaDeDinero(tipo, abono);
  const enDivisa = moneda !== monedaCuenta;
  const fmt = (n: number) => formatoImporte(n, moneda);
  const fmtCuenta = (n: number) => formatoImporte(n, monedaCuenta);
  const [cuentas, setCuentas] = useState<CuentaBancaria[] | null>(null);
  const [fechaCobro, setFechaCobro] = useState(hoy());
  const [importe, setImporte] = useState(pendiente.toFixed(2));
  // id de la cuenta bancaria, o 'CAJA'
  const [medio, setMedio] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Solo en divisa: como se sabe lo que ha llegado al banco.
  const [modoTipo, setModoTipo] = useState<'BCE' | 'TIPO' | 'RECIBIDO'>('BCE');
  const [tipoDia, setTipoDia] = useState('');
  const [recibido, setRecibido] = useState('');
  const [comision, setComision] = useState('');
  const [bce, setBce] = useState<TipoCambioApi | null>(null);

  // Tipo de referencia del BCE de la fecha del cobro (solo para la vista previa).
  useEffect(() => {
    if (!enDivisa || !fechaCobro) return;
    let vivo = true;
    apiFetch<TipoCambioApi>(companyPath(`/tipos-cambio?moneda=${encodeURIComponent(moneda)}&fecha=${fechaCobro}`))
      .then((r) => vivo && setBce(r))
      .catch(() => vivo && setBce(null));
    return () => {
      vivo = false;
    };
  }, [enDivisa, moneda, fechaCobro]);

  useEffect(() => {
    apiFetch<CuentaBancaria[]>(companyPath('/bancos/cuentas'))
      .then((l) => {
        const activas = (Array.isArray(l) ? l : []).filter((c) => c.activa);
        setCuentas(activas);
        setMedio(activas[0]?.id ?? 'CAJA');
      })
      .catch(() => {
        setCuentas([]);
        setMedio('CAJA');
      });
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  // Vista previa del cobro en divisa (el servidor hace el calculo definitivo).
  const valor = parseImporte(importe);
  // El tipo se lee con parseTipo: '1.085' es 1,085 (no 1085, como lo leeria un importe).
  const tcDia = modoTipo === 'TIPO' ? parseTipo(tipoDia) : bce?.tipoCambio ?? NaN;
  const com = comision.trim() ? parseImporte(comision) : 0;
  const comVal = Number.isFinite(com) ? com : 0;
  const previa = (() => {
    if (!enDivisa || !(valor > 0)) return null;
    const esUltimo = Math.round(valor * 100) === Math.round(pendiente * 100);
    const a430 = esUltimo ? pendienteCuenta : redondear2((valor * pendienteCuenta) / pendiente);
    // Lo de la factura en el banco: lo recibido o lo cargado (sin la comisión) o, si no, lo de la factura al tipo del día.
    let porFactura: number;
    if (modoTipo === 'RECIBIDO') {
      porFactura = parseImporte(recibido);
    } else {
      if (!(tcDia > 0)) return null;
      porFactura = redondear2(valor / tcDia);
    }
    if (!Number.isFinite(porFactura)) return null;
    if (saleDinero) {
      // Sale del banco lo de la factura más la comisión. Pagar más que lo que se debía en la cuenta es pérdida (668).
      const dif = redondear2(porFactura - a430);
      return { a430, banco: redondear2(porFactura + comVal), dif, ganancia: dif < 0 };
    }
    // Entra en el banco lo cobrado menos la comisión. Cobrar más que lo que se debía es ganancia (768).
    const banco = modoTipo === 'RECIBIDO' ? porFactura : redondear2(porFactura - comVal);
    const dif = redondear2(banco + comVal - a430);
    return { a430, banco, dif, ganancia: dif > 0 };
  })();

  const guardar = async () => {
    if (!Number.isFinite(valor) || valor <= 0) return setError('Indica un importe mayor que cero.');
    if (Math.round(valor * 100) > Math.round(pendiente * 100)) {
      return setError(
        abonoVenta
          ? `El importe no puede superar lo que queda a favor del cliente (${fmt(pendiente)}).`
          : abono
            ? `El importe no puede superar lo que queda a tu favor (${fmt(pendiente)}).`
            : `El importe no puede superar lo pendiente (${fmt(pendiente)}).`,
      );
    }
    if (!fechaCobro) return setError('Indica la fecha.');
    const divisa: Record<string, number> = {};
    if (enDivisa) {
      if (modoTipo === 'TIPO') {
        if (!(tcDia > 0)) return setError(`Indica el tipo del día (1 ${monedaCuenta} = … ${moneda}).`);
        divisa.tipoCambio = tcDia;
      }
      if (modoTipo === 'RECIBIDO') {
        const r = parseImporte(recibido);
        if (!(r > 0)) return setError(saleDinero ? `Indica lo que ha salido del banco por la factura, sin la comisión, en ${monedaCuenta}.` : `Indica lo que ha llegado al banco, en ${monedaCuenta}.`);
        divisa.importeRecibido = r;
      }
      if (comision.trim()) {
        if (!(com >= 0)) return setError('La comisión tiene que ser un número (0 o más).');
        divisa.comisionBancaria = com;
      }
    }
    setEnviando(true);
    setError('');
    try {
      const r = await apiFetch<{ resumen: Resumen }>(base, {
        method: 'POST',
        body: JSON.stringify({
          fecha: fechaCobro,
          // En divisa, el importe va en la moneda de la factura (importeDoc).
          ...(enDivisa ? { importeDoc: valor, ...divisa } : { importe: valor }),
          ...(medio === 'CAJA' ? { caja: true } : { cuentaBancariaId: medio }),
          nota: nota.trim() || undefined,
        }),
      });
      onHecho(r.resumen);
    } catch (e) {
      setError(errorMessage(e));
      setEnviando(false);
    }
  };

  const campo = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-cobro">
      <div className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 id="titulo-cobro" className="text-lg font-semibold text-slate-900">{t.registrar}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          {abonoVenta ? 'A favor del cliente' : abono ? 'A tu favor' : 'Pendiente'}: <span className="font-semibold">{fmt(pendiente)}</span>. Puedes registrar una
          parte; se genera su asiento{' '}
          {abonoVenta
            ? '(cuenta del cliente contra banco o caja)'
            : tipo === 'INGRESO'
              ? '(banco o caja contra la cuenta del cliente)'
              : abono
                ? '(banco o caja contra la cuenta del proveedor)'
                : '(cuenta del proveedor contra banco o caja)'}
          .
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cobro-fecha" className="mb-1 block text-sm font-medium text-slate-700">Fecha</label>
            <input id="cobro-fecha" type="date" min={fechaMinima?.slice(0, 10)} value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="cobro-importe" className="mb-1 block text-sm font-medium text-slate-700">
              Importe ({moneda})
            </label>
            <input id="cobro-importe" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} className={`${campo} text-right font-mono`} />
          </div>
        </div>
        <div>
          <label htmlFor="cobro-cuenta" className="mb-1 block text-sm font-medium text-slate-700">{abonoVenta ? 'Desde dónde se devuelve' : tipo === 'INGRESO' ? 'Dónde se cobra' : abono ? 'Dónde lo recibes' : 'Desde dónde se paga'}</label>
          {cuentas === null ? (
            <p className="text-sm text-slate-500">Cargando cuentas…</p>
          ) : (
            <select id="cobro-cuenta" value={medio} onChange={(e) => setMedio(e.target.value)} className={campo}>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.bancoNombre || 'Banco')} · {c.iban.slice(-4).padStart(8, '•')} ({c.subcuentaCodigo}) · {c.moneda ?? 'EUR'}
                </option>
              ))}
              <option value="CAJA">Caja / efectivo (570)</option>
            </select>
          )}
          {cuentas && cuentas.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">{t.sinBancos}</p>
          )}
        </div>
        {enDivisa && (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">
              {saleDinero ? 'Lo que sale del banco' : 'Lo que llega al banco'} ({monedaCuenta})
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="modo-tipo" checked={modoTipo === 'BCE'} onChange={() => setModoTipo('BCE')} />
                Tipo del BCE {bce?.tipoCambio ? `(${formatoTipo(bce.tipoCambio)})` : ''}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="modo-tipo" checked={modoTipo === 'TIPO'} onChange={() => setModoTipo('TIPO')} />
                Tipo del día
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="modo-tipo" checked={modoTipo === 'RECIBIDO'} onChange={() => setModoTipo('RECIBIDO')} />
                {saleDinero ? 'Importe cargado' : 'Importe recibido'}
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {modoTipo === 'TIPO' && (
                <div>
                  <label htmlFor="cobro-tipo" className="mb-1 block text-xs font-medium text-slate-600">
                    1 {monedaCuenta} = … {moneda}
                  </label>
                  <input id="cobro-tipo" inputMode="decimal" value={tipoDia} onChange={(e) => setTipoDia(e.target.value)} className={`${campo} text-right font-mono`} />
                </div>
              )}
              {modoTipo === 'RECIBIDO' && (
                <div>
                  <label htmlFor="cobro-recibido" className="mb-1 block text-xs font-medium text-slate-600">
                    {saleDinero ? `Cargado en el banco, sin la comisión (${monedaCuenta})` : `Recibido en el banco (${monedaCuenta})`}
                  </label>
                  <input id="cobro-recibido" inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} className={`${campo} text-right font-mono`} />
                </div>
              )}
              <div>
                <label htmlFor="cobro-comision" className="mb-1 block text-xs font-medium text-slate-600">
                  Comisión bancaria ({monedaCuenta}, opcional)
                </label>
                <input id="cobro-comision" inputMode="decimal" value={comision} onChange={(e) => setComision(e.target.value)} className={`${campo} text-right font-mono`} />
              </div>
            </div>
            {modoTipo === 'BCE' && bce && !bce.tipoCambio && (
              <p className="text-xs text-amber-700">{bce.aviso || `Sin tipo del BCE para esa fecha: indica el tipo del día o ${saleDinero ? 'lo cargado' : 'lo recibido'}.`}</p>
            )}
            {previa && (
              <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                {tipo === 'INGRESO' ? 'Cliente' : 'Proveedor'} ({cuentaTercero ?? (tipo === 'INGRESO' ? 'su subcuenta 430' : 'su subcuenta 400 o 410')}): {fmtCuenta(previa.a430)} · {saleDinero ? 'Sale del banco' : 'Banco'}:{' '}
                {fmtCuenta(previa.banco)}
                {saleDinero && com > 0 ? ' (con la comisión)' : ''}
                {com > 0 ? ` · Comisión (626): ${fmtCuenta(com)}` : ''}
                {previa.dif !== 0 &&
                  ` · Diferencia de cambio (${previa.ganancia ? '768' : '668'}): ${fmtCuenta(Math.abs(previa.dif))} ${previa.ganancia ? 'de ganancia' : 'de pérdida'}`}
              </p>
            )}
          </fieldset>
        )}
        <div>
          <label htmlFor="cobro-nota" className="mb-1 block text-sm font-medium text-slate-700">Nota (opcional)</label>
          <input id="cobro-nota" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: transferencia del 2º plazo" className={campo} />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={boton}>Cancelar</button>
          <button
            type="button"
            disabled={enviando || cuentas === null}
            onClick={guardar}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {enviando ? 'Guardando…' : t.registrar}
          </button>
        </div>
      </div>
    </div>
  );
}
