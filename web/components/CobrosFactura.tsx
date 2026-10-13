'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as TeclaReact } from 'react';
import Link from 'next/link';
import { Bank, Money, X } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
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
 * Donde se cobra: una venta al contado propone la caja (570); por transferencia
 * o recibo domiciliado, la cuenta del banco que sale en la factura. Los pagos y
 * las devoluciones, el banco. Si toca banco y la empresa no tiene ninguno, no
 * se elige la caja sin decir nada: se avisa y se deja dar de alta la cuenta ahi
 * mismo (con permiso de Tesoreria).
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
  /** > 0 ganancia (768), < 0 perdida (668). */
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
/** Respuesta del alta de una cuenta en Tesoreria (POST /treasury/bank-accounts). */
interface CuentaCreada {
  id: string;
  iban: string;
  bancoNombre?: string;
  subcuentaCodigo: string;
  estado: string;
  moneda?: string;
}

/** Ventas: como se cobra la factura (su forma de pago), en la frase del aviso. */
const COBRO_POR: Record<string, string> = {
  TRANSFERENCIA: 'por transferencia',
  GIRO: 'por recibo domiciliado',
};

/** Codigo del 409 del alta rapida cuando el plan ya tiene subcuentas de bancos sin cuenta. */
const SUBCUENTA_POR_ELEGIR = 'SUBCUENTA_BANCO_POR_ELEGIR';

const RUTA_CUENTAS_BANCARIAS = '/dashboard/tesoreria/cuentas';

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

export default function CobrosFactura({
  tipo,
  facturaId,
  puedeEditar,
  fechaFactura,
  moneda: monedaProp = 'EUR',
  monedaCuenta: monedaCuentaProp = 'EUR',
  abono = false,
  formaPago,
  cuentaPropuestaId = null,
  onCambio,
}: {
  tipo: Tipo;
  facturaId: string;
  puedeEditar: boolean;
  /** Ventas: forma de pago de la factura (TRANSFERENCIA, GIRO o CONTADO). Al contado se propone la caja; si no, el banco. */
  formaPago?: string;
  /** Ventas: cuenta bancaria que se propone (la del IBAN que salió en la factura). */
  cuentaPropuestaId?: string | null;
  /** No se puede cobrar con fecha anterior a la de la factura. */
  fechaFactura?: string;
  /** Moneda de la factura y de la contabilidad (por defecto EUR: las compras van siempre en la de cuenta). */
  moneda?: string;
  monedaCuenta?: string;
  /** Abono de proveedor (gasto en negativo): devoluciones recibidas en vez de pagos. */
  abono?: boolean;
  /** Se llama tras registrar o anular (para recargar la factura). */
  onCambio?: () => void;
}) {
  const esAbono = tipo === 'GASTO' && abono;
  const t = esAbono ? TEXTOS_ABONO : TEXTOS[tipo];
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

  // En un abono el pendiente llega en negativo: lo que queda a tu favor, en positivo.
  const pendiente = esAbono ? -(resumen?.importePendiente ?? 0) : resumen?.importePendiente ?? 0;
  const compensado = Math.abs(resumen?.importeCompensado ?? 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{t.titulo}</h2>
          {resumen && (
            <p className="mt-0.5 text-sm text-slate-600">
              {esAbono ? (
                <>
                  Devuelto o aplicado {fmt(Math.abs(resumen.importeCobrado))} de {fmt(Math.abs(resumen.totalFactura))} ·{' '}
                  <span className={`font-semibold ${pendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>A tu favor: {fmt(pendiente)}</span>
                </>
              ) : (
                <>
                  {tipo === 'INGRESO' ? 'Cobrado' : 'Pagado'} {fmt(Math.round((resumen.importeCobrado - compensado) * 100) / 100)}
                  {compensado > 0 && ` y descontado con abonos ${fmt(compensado)}`} de {fmt(resumen.totalFactura)} ·{' '}
                  <span className={`font-semibold ${pendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>Pendiente: {fmt(pendiente)}</span>
                </>
              )}
              {enDivisa && resumen.importePendienteCuenta !== undefined && (
                <span className="text-slate-500"> ({fmtCuenta(resumen.importePendienteCuenta)} en la cuenta del cliente)</span>
              )}
            </p>
          )}
        </div>
        {puedeEditar && resumen && pendiente > 0 && (
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

      {resumen && resumen.cobros.length === 0 && <p className="mt-3 text-sm text-slate-500">{t.nada}</p>}
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
                    ? ` · ${c.diferenciaCambio > 0 ? 'ganancia' : 'pérdida'} de cambio ${fmtCuenta(Math.abs(c.diferenciaCambio))} (${c.diferenciaCambio > 0 ? '768' : '668'})`
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
          pendienteCuenta={esAbono ? (resumen.importePendienteCuenta !== undefined ? -resumen.importePendienteCuenta : pendiente) : resumen.importePendienteCuenta ?? pendiente}
          cuentaTercero={resumen.cuentaTercero ?? null}
          formaPago={tipo === 'INGRESO' ? formaPago : undefined}
          cuentaPropuestaId={tipo === 'INGRESO' ? cuentaPropuestaId : null}
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
  formaPago,
  cuentaPropuestaId,
  moneda,
  monedaCuenta,
  fechaMinima,
  onCerrar,
  onHecho,
}: {
  tipo: Tipo;
  /** Devolución recibida de un abono de proveedor (el pendiente es lo que queda a tu favor). */
  abono?: boolean;
  base: string;
  /** Subcuenta del tercero (null si aun no tiene: la recibe al registrar). */
  cuentaTercero: string | null;
  /** Ventas: forma de pago de la factura. CONTADO propone la caja; el resto (o sin saber), el banco. */
  formaPago?: string;
  /** Ventas: cuenta bancaria que se propone si está entre las activas. */
  cuentaPropuestaId: string | null;
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
  const t = abono ? TEXTOS_ABONO : TEXTOS[tipo];
  const etiquetaMedio = tipo === 'INGRESO' ? 'Dónde se cobra' : abono ? 'Dónde lo recibes' : 'Desde dónde se paga';
  const textoMedio = etiquetaMedio[0].toLowerCase() + etiquetaMedio.slice(1);
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

  // Venta al contado: caja. Por transferencia, recibo domiciliado, sin saber o en
  // pagos: el banco, y si no hay ninguno no se elige nada (no la caja a escondidas).
  const alContado = formaPago === 'CONTADO';
  const [errorCuentas, setErrorCuentas] = useState(false);
  // Dar de alta una cuenta bancaria pide permiso de Tesorería (el administrador siempre lo tiene).
  const [puedeCrearBanco] = useState(() => tieneAlgunPermiso(getUser(), ['tesoreria:write']));
  const [avisoCuenta, setAvisoCuenta] = useState('');
  const cajaRef = useRef<HTMLDivElement>(null);
  const fechaRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let vivo = true;
    apiFetch<CuentaBancaria[]>(companyPath('/bancos/cuentas'))
      .then((l) => {
        if (!vivo) return;
        const activas = (Array.isArray(l) ? l : []).filter((c) => c.activa);
        setCuentas(activas);
        if (alContado) setMedio('CAJA');
        else setMedio(activas.find((c) => c.id === cuentaPropuestaId)?.id ?? activas[0]?.id ?? '');
      })
      .catch(() => {
        if (!vivo) return;
        setErrorCuentas(true);
        setCuentas([]);
        setMedio(alContado ? 'CAJA' : '');
      });
    return () => {
      vivo = false;
    };
  }, [alContado, cuentaPropuestaId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  // Foco: al abrir, en el primer campo; al cerrar, vuelve al botón que la abrió.
  useEffect(() => {
    const volverA = document.activeElement as HTMLElement | null;
    fechaRef.current?.focus();
    return () => {
      if (volverA && document.contains(volverA)) volverA.focus();
    };
  }, []);

  // El tabulador no sale de la ventana.
  const alTeclear = (e: TeclaReact<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !cajaRef.current) return;
    const enfocables = Array.from(
      cajaRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'),
    );
    if (!enfocables.length) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  // La cuenta recién dada de alta queda elegida.
  const alCrearCuenta = (c: CuentaCreada) => {
    setCuentas((l) => [...(l ?? []), { id: c.id, iban: c.iban, bancoNombre: c.bancoNombre, subcuentaCodigo: c.subcuentaCodigo, activa: true, moneda: c.moneda }]);
    setMedio(c.id);
    setError('');
    setAvisoCuenta(`Cuenta dada de alta con la subcuenta ${c.subcuentaCodigo}. Ya está elegida.`);
    requestAnimationFrame(() => selectRef.current?.focus());
  };

  // Vista previa del cobro en divisa (el servidor hace el calculo definitivo).
  const valor = parseImporte(importe);
  // El tipo se lee con parseTipo: '1.085' es 1,085 (no 1085, como lo leeria un importe).
  const tcDia = modoTipo === 'TIPO' ? parseTipo(tipoDia) : bce?.tipoCambio ?? NaN;
  const com = comision.trim() ? parseImporte(comision) : 0;
  const previa = (() => {
    if (!enDivisa || !(valor > 0)) return null;
    const esUltimo = Math.round(valor * 100) === Math.round(pendiente * 100);
    const a430 = esUltimo ? pendienteCuenta : redondear2((valor * pendienteCuenta) / pendiente);
    let banco: number;
    if (modoTipo === 'RECIBIDO') {
      banco = parseImporte(recibido);
    } else {
      if (!(tcDia > 0)) return null;
      banco = redondear2(redondear2(valor / tcDia) - (Number.isFinite(com) ? com : 0));
    }
    if (!Number.isFinite(banco)) return null;
    const dif = redondear2(banco + (Number.isFinite(com) ? com : 0) - a430);
    return { a430, banco, dif };
  })();

  const guardar = async () => {
    if (!Number.isFinite(valor) || valor <= 0) return setError('Indica un importe mayor que cero.');
    if (Math.round(valor * 100) > Math.round(pendiente * 100)) {
      return setError(abono ? `El importe no puede superar lo que queda a tu favor (${fmt(pendiente)}).` : `El importe no puede superar lo pendiente (${fmt(pendiente)}).`);
    }
    if (!fechaCobro) return setError('Indica la fecha.');
    if (!medio) {
      selectRef.current?.focus();
      return setError(`Falta elegir ${textoMedio}: da de alta la cuenta del banco o elige «Caja / efectivo».`);
    }
    const divisa: Record<string, number> = {};
    if (enDivisa) {
      if (modoTipo === 'TIPO') {
        if (!(tcDia > 0)) return setError(`Indica el tipo del día (1 ${monedaCuenta} = … ${moneda}).`);
        divisa.tipoCambio = tcDia;
      }
      if (modoTipo === 'RECIBIDO') {
        const r = parseImporte(recibido);
        if (!(r > 0)) return setError(`Indica lo que ha llegado al banco, en ${monedaCuenta}.`);
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

  const cobroPor = formaPago ? COBRO_POR[formaPago] : undefined;
  const pistaMedio =
    tipo !== 'INGRESO' || !cuentas || errorCuentas
      ? ''
      : alContado
        ? 'La factura es al contado: se propone la caja.'
        : cobroPor && cuentas.length > 0
          ? `La factura se cobra ${cobroPor}: se propone su cuenta del banco.`
          : '';
  const avisoSinBanco =
    tipo === 'INGRESO'
      ? cobroPor
        ? `Esta factura se cobra ${cobroPor} y aún no tienes dada de alta la cuenta del banco.`
        : 'Aún no tienes dada de alta la cuenta del banco.'
      : abono
        ? 'Aún no tienes dada de alta la cuenta del banco donde recibes la devolución.'
        : 'Aún no tienes dada de alta la cuenta del banco desde la que pagas.';

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-cobro">
      <div ref={cajaRef} onKeyDown={alTeclear} className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between">
          <h2 id="titulo-cobro" className="text-lg font-semibold text-slate-900">{t.registrar}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          {abono ? 'A tu favor' : 'Pendiente'}: <span className="font-semibold">{fmt(pendiente)}</span>. Puedes registrar una parte; se genera su asiento{' '}
          {tipo === 'INGRESO' ? '(banco o caja contra la cuenta del cliente)' : abono ? '(banco o caja contra la cuenta del proveedor)' : '(cuenta del proveedor contra banco o caja)'}.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cobro-fecha" className="mb-1 block text-sm font-medium text-slate-700">Fecha</label>
            <input ref={fechaRef} id="cobro-fecha" type="date" min={fechaMinima?.slice(0, 10)} value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="cobro-importe" className="mb-1 block text-sm font-medium text-slate-700">
              Importe ({moneda})
            </label>
            <input id="cobro-importe" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} className={`${campo} text-right font-mono`} />
          </div>
        </div>
        <div>
          <label htmlFor="cobro-cuenta" className="mb-1 block text-sm font-medium text-slate-700">{etiquetaMedio}</label>
          {cuentas === null ? (
            <p className="text-sm text-slate-500">Cargando cuentas…</p>
          ) : (
            <select
              ref={selectRef}
              id="cobro-cuenta"
              value={medio}
              onChange={(e) => {
                setMedio(e.target.value);
                setAvisoCuenta('');
              }}
              aria-describedby={pistaMedio ? 'cobro-cuenta-pista' : undefined}
              className={campo}
            >
              {!medio && (
                <option value="" disabled>
                  Elige {textoMedio}…
                </option>
              )}
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.bancoNombre || 'Banco')} · {c.iban.slice(-4).padStart(8, '•')} ({c.subcuentaCodigo}) · {c.moneda ?? 'EUR'}
                </option>
              ))}
              <option value="CAJA">Caja / efectivo (570)</option>
            </select>
          )}
          {pistaMedio && (
            <p id="cobro-cuenta-pista" className="mt-1 text-xs text-slate-500">
              {pistaMedio}
            </p>
          )}
          {avisoCuenta && (
            <p role="status" className="mt-1 text-xs font-medium text-green-700">
              {avisoCuenta}
            </p>
          )}
          {errorCuentas && (
            <p role="alert" className="mt-1 text-xs text-red-700">
              No se han podido cargar las cuentas bancarias. Cierra esta ventana y vuelve a abrirla.
            </p>
          )}
          {cuentas && cuentas.length === 0 && !errorCuentas && (alContado ? (
            <p className="mt-1 text-xs text-slate-500">{t.sinBancos}</p>
          ) : (
            <AltaCuentaBanco aviso={avisoSinBanco} puedeCrear={puedeCrearBanco} onCreada={alCrearCuenta} />
          ))}
        </div>
        {enDivisa && (
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Lo que llega al banco ({monedaCuenta})</legend>
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
                Importe recibido
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
                    Recibido en el banco ({monedaCuenta})
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
              <p className="text-xs text-amber-700">{bce.aviso || 'Sin tipo del BCE para esa fecha: indica el tipo del día o lo recibido.'}</p>
            )}
            {previa && (
              <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                {tipo === 'INGRESO' ? 'Cliente' : 'Proveedor'} ({cuentaTercero ?? (tipo === 'INGRESO' ? 'su subcuenta 430' : 'su subcuenta 400 o 410')}): {fmtCuenta(previa.a430)} · Banco:{' '}
                {fmtCuenta(previa.banco)}
                {com > 0 ? ` · Comisión (626): ${fmtCuenta(com)}` : ''}
                {previa.dif !== 0 &&
                  ` · Diferencia de cambio (${previa.dif > 0 ? '768' : '668'}): ${fmtCuenta(Math.abs(previa.dif))} ${previa.dif > 0 ? 'de ganancia' : 'de pérdida'}`}
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

/**
 * Toca cobrar o pagar por banco y la empresa no tiene ninguna cuenta bancaria:
 * lo dice y, con permiso de Tesorería, deja darla de alta aquí mismo (IBAN y
 * banco; el servidor le pone su subcuenta 572). Sin permiso, enlaza a Tesorería.
 */
function AltaCuentaBanco({ aviso, puedeCrear, onCreada }: { aviso: string; puedeCrear: boolean; onCreada: (c: CuentaCreada) => void }) {
  const [iban, setIban] = useState('');
  const [banco, setBanco] = useState('');
  const [errorIban, setErrorIban] = useState('');
  const [error, setError] = useState('');
  const [irATesoreria, setIrATesoreria] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const ibanRef = useRef<HTMLInputElement>(null);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorIban('');
    setIrATesoreria(false);
    if (!iban.trim()) {
      setErrorIban('Escribe el IBAN de la cuenta.');
      ibanRef.current?.focus();
      return;
    }
    setEnviando(true);
    try {
      const c = await apiFetch<CuentaCreada>(companyPath('/treasury/bank-accounts'), {
        method: 'POST',
        body: JSON.stringify({ iban: iban.trim(), bancoNombre: banco.trim() || undefined }),
      });
      onCreada(c);
    } catch (err) {
      if (campoDelError(err) === 'iban') {
        setErrorIban(errorMessage(err));
        ibanRef.current?.focus();
      } else {
        setError(errorMessage(err));
        const d = err instanceof ApiError ? (err.detalles as { codigo?: unknown } | undefined) : undefined;
        setIrATesoreria(d?.codigo === SUBCUENTA_POR_ELEGIR);
      }
      setEnviando(false);
    }
  };

  const enlace = (
    <Link href={RUTA_CUENTAS_BANCARIAS} className="font-medium text-amber-900 underline">
      Tesorería &gt; Cuentas bancarias
    </Link>
  );

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-start gap-2 font-medium">
        <Bank size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{aviso}</span>
      </p>
      {puedeCrear ? (
        <form onSubmit={crear} noValidate className="mt-3 space-y-3" aria-label="Alta de la cuenta del banco">
          <p className="text-xs text-amber-800">Dala de alta aquí y quedará elegida. Si fue en efectivo, elige «Caja / efectivo» en la lista.</p>
          <div>
            <label htmlFor="alta-banco-iban" className="mb-1 block text-xs font-medium text-slate-700">
              IBAN
            </label>
            <input
              ref={ibanRef}
              id="alta-banco-iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="ES91 2100 0418 4502 0005 1332"
              aria-invalid={errorIban ? true : undefined}
              aria-describedby={errorIban ? 'alta-banco-iban-error' : undefined}
              className={`w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-slate-900 ${errorIban ? 'border-red-400' : 'border-slate-300'}`}
            />
            {errorIban && (
              <p id="alta-banco-iban-error" className="mt-1 text-xs text-red-700">
                {errorIban}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="alta-banco-nombre" className="mb-1 block text-xs font-medium text-slate-700">
              Banco <span className="font-normal text-slate-500">(opcional)</span>
            </label>
            <input
              id="alta-banco-nombre"
              value={banco}
              maxLength={100}
              onChange={(e) => setBanco(e.target.value)}
              placeholder="Ej.: BBVA"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
              {irATesoreria && <> Ve a {enlace}.</>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {enviando ? 'Dando de alta…' : 'Dar de alta la cuenta'}
            </button>
            <span className="text-xs text-amber-800">Se le asigna sola su subcuenta 572 en el plan contable.</span>
          </div>
        </form>
      ) : (
        <p className="mt-2 text-xs text-amber-800">
          Darla de alta pide permiso de Tesorería, y no lo tienes: pídeselo al administrador de la empresa o que la dé de alta quien lo tenga, en {enlace}. Si
          fue en efectivo, elige «Caja / efectivo» en la lista.
        </p>
      )}
    </div>
  );
}
