'use client';

import { useCallback, useEffect, useState } from 'react';
import { Money, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte, formatoTipo, parseImporte, redondear2, textoTipo } from '@/lib/moneda';

/**
 * Cobros de una factura de venta o pagos de una factura de gasto: lo pendiente,
 * la lista de cobros/pagos (con su asiento) y el alta y anulacion. Cada cobro
 * genera un asiento 572/570 contra la cuenta del cliente (o del proveedor).
 *
 * Factura en otra moneda que la de la contabilidad: lo pendiente va en la
 * moneda de la factura; el banco recibe lo cobrado al tipo del dia (el del BCE,
 * el indicado o lo que abona el banco) y la diferencia con el tipo de la
 * factura va a la 768 (ganancia) o a la 668 (perdida); la comision, a la 626.
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
  /** Lo mismo en la moneda de cuenta (cuadra con la 430). */
  totalFacturaCuenta?: number;
  importeCobradoCuenta?: number;
  importePendienteCuenta?: number;
  estado: string;
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
const hoy = () => new Date().toISOString().slice(0, 10);

const boton =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

const TEXTOS = {
  INGRESO: { ruta: 'income-invoices', recurso: 'cobros', uno: 'cobro', titulo: 'Cobros', registrar: 'Registrar cobro', hecho: 'Cobro registrado.', nada: 'Todavía no hay cobros.' },
  GASTO: { ruta: 'expense-invoices', recurso: 'pagos', uno: 'pago', titulo: 'Pagos', registrar: 'Registrar pago', hecho: 'Pago registrado.', nada: 'Todavía no hay pagos.' },
} as const;

export default function CobrosFactura({
  tipo,
  facturaId,
  puedeEditar,
  fechaFactura,
  moneda: monedaProp = 'EUR',
  monedaCuenta: monedaCuentaProp = 'EUR',
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
  /** Se llama tras registrar o anular (para recargar la factura). */
  onCambio?: () => void;
}) {
  const t = TEXTOS[tipo];
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
    if (!window.confirm(`¿Anular el ${t.uno} de ${fmt(c.importeDoc ?? c.importe)} del ${fecha(c.fecha)}?\n\nSu asiento (${c.asientoNumero ?? 'sin asiento'}) dejará de contar.`)) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const r = await apiFetch<{ resumen: Resumen; contraasiento: boolean }>(`${base}/${c.id}/anular`, { method: 'POST', body: '{}' });
      setResumen(r.resumen);
      setAviso(
        r.contraasiento
          ? `${t.uno[0].toUpperCase()}${t.uno.slice(1)} anulado. Como su periodo ya está cerrado, se ha hecho un contraasiento con fecha de hoy.`
          : `${t.uno[0].toUpperCase()}${t.uno.slice(1)} anulado.`,
      );
      onCambio?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const pendiente = resumen?.importePendiente ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{t.titulo}</h2>
          {resumen && (
            <p className="mt-0.5 text-sm text-slate-600">
              {tipo === 'INGRESO' ? 'Cobrado' : 'Pagado'} {fmt(resumen.importeCobrado)} de {fmt(resumen.totalFactura)} ·{' '}
              <span className={`font-semibold ${pendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>Pendiente: {fmt(pendiente)}</span>
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
                {fmt(c.importeDoc ?? c.importe)}
              </span>
              <span className="text-slate-600">{c.medio === 'CAJA' ? 'Caja (570)' : `Banco (${c.cuentaTesoreria})`}</span>
              {enDivisa && (
                <span className="w-full text-xs text-slate-500 sm:w-auto">
                  {c.tipoCambio ? `${textoTipo(monedaCuenta, moneda, c.tipoCambio)} · ` : ''}
                  {c.medio === 'CAJA' ? 'caja' : 'banco'} {fmtCuenta(c.importeTesoreria ?? c.importe)}
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
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">Anulado</span>
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
          base={base}
          pendiente={pendiente}
          pendienteCuenta={resumen.importePendienteCuenta ?? pendiente}
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
  base,
  pendiente,
  pendienteCuenta,
  moneda,
  monedaCuenta,
  fechaMinima,
  onCerrar,
  onHecho,
}: {
  tipo: Tipo;
  base: string;
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
  const t = TEXTOS[tipo];
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
  const tcDia = modoTipo === 'TIPO' ? parseImporte(tipoDia) : bce?.tipoCambio ?? NaN;
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
    if (Math.round(valor * 100) > Math.round(pendiente * 100)) return setError(`El importe no puede superar lo pendiente (${fmt(pendiente)}).`);
    if (!fechaCobro) return setError('Indica la fecha.');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-cobro">
      <div className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 id="titulo-cobro" className="text-lg font-semibold text-slate-900">{t.registrar}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Pendiente: <span className="font-semibold">{fmt(pendiente)}</span>. Puedes registrar una parte; se genera su asiento{' '}
          {tipo === 'INGRESO' ? '(banco o caja contra la cuenta del cliente)' : '(cuenta del proveedor contra banco o caja)'}.
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
          <label htmlFor="cobro-cuenta" className="mb-1 block text-sm font-medium text-slate-700">{tipo === 'INGRESO' ? 'Dónde se cobra' : 'Desde dónde se paga'}</label>
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
            <p className="mt-1 text-xs text-slate-500">No hay cuentas bancarias activas: créalas en Tesorería para cobrar por banco.</p>
          )}
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
                Cliente (430): {fmtCuenta(previa.a430)} · Banco: {fmtCuenta(previa.banco)}
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
