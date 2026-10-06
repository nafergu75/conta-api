'use client';

import { useCallback, useEffect, useState } from 'react';
import { Money, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';

/**
 * Cobros de una factura de venta o pagos de una factura de gasto: lo pendiente,
 * la lista de cobros/pagos (con su asiento) y el alta y anulacion. Cada cobro
 * genera un asiento 572/570 contra la cuenta del cliente (o del proveedor).
 */

type Tipo = 'INGRESO' | 'GASTO';

interface Cobro {
  id: string;
  fecha: string;
  importe: number;
  cuentaTesoreria: string;
  medio: 'BANCO' | 'CAJA';
  nota: string | null;
  estado: 'ACTIVO' | 'ANULADO';
  asientoNumero: string | null;
}

interface Resumen {
  totalFactura: number;
  importeCobrado: number;
  importePendiente: number;
  estado: string;
  cobros: Cobro[];
}

interface CuentaBancaria {
  id: string;
  iban: string;
  bancoNombre?: string;
  subcuentaCodigo: string;
  activa: boolean;
}

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
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
  onCambio,
}: {
  tipo: Tipo;
  facturaId: string;
  puedeEditar: boolean;
  /** No se puede cobrar con fecha anterior a la de la factura. */
  fechaFactura?: string;
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

  const anular = async (c: Cobro) => {
    if (!window.confirm(`¿Anular el ${t.uno} de ${eur.format(c.importe)} del ${fecha(c.fecha)}?\n\nSu asiento (${c.asientoNumero ?? 'sin asiento'}) dejará de contar.`)) return;
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
              {tipo === 'INGRESO' ? 'Cobrado' : 'Pagado'} {eur.format(resumen.importeCobrado)} de {eur.format(resumen.totalFactura)} ·{' '}
              <span className={`font-semibold ${pendiente > 0 ? 'text-amber-700' : 'text-green-700'}`}>Pendiente: {eur.format(pendiente)}</span>
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
              <span className={`w-28 text-right font-mono tabular-nums ${c.estado === 'ANULADO' ? 'line-through' : 'font-semibold text-slate-900'}`}>{eur.format(c.importe)}</span>
              <span className="text-slate-600">{c.medio === 'CAJA' ? 'Caja (570)' : `Banco (${c.cuentaTesoreria})`}</span>
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
  fechaMinima,
  onCerrar,
  onHecho,
}: {
  tipo: Tipo;
  base: string;
  pendiente: number;
  fechaMinima?: string;
  onCerrar: () => void;
  onHecho: (r: Resumen) => void;
}) {
  const t = TEXTOS[tipo];
  const [cuentas, setCuentas] = useState<CuentaBancaria[] | null>(null);
  const [fechaCobro, setFechaCobro] = useState(hoy());
  const [importe, setImporte] = useState(pendiente.toFixed(2));
  // id de la cuenta bancaria, o 'CAJA'
  const [medio, setMedio] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

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

  const guardar = async () => {
    const valor = Number(importe.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return setError('Indica un importe mayor que cero.');
    if (Math.round(valor * 100) > Math.round(pendiente * 100)) return setError(`El importe no puede superar lo pendiente (${eur.format(pendiente)}).`);
    if (!fechaCobro) return setError('Indica la fecha.');
    setEnviando(true);
    setError('');
    try {
      const r = await apiFetch<{ resumen: Resumen }>(base, {
        method: 'POST',
        body: JSON.stringify({
          fecha: fechaCobro,
          importe: valor,
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
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 id="titulo-cobro" className="text-lg font-semibold text-slate-900">{t.registrar}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Pendiente: <span className="font-semibold">{eur.format(pendiente)}</span>. Puedes registrar una parte; se genera su asiento{' '}
          {tipo === 'INGRESO' ? '(banco o caja contra la cuenta del cliente)' : '(cuenta del proveedor contra banco o caja)'}.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cobro-fecha" className="mb-1 block text-sm font-medium text-slate-700">Fecha</label>
            <input id="cobro-fecha" type="date" min={fechaMinima?.slice(0, 10)} value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="cobro-importe" className="mb-1 block text-sm font-medium text-slate-700">Importe (€)</label>
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
                  {(c.bancoNombre || 'Banco')} · {c.iban.slice(-4).padStart(8, '•')} ({c.subcuentaCodigo})
                </option>
              ))}
              <option value="CAJA">Caja / efectivo (570)</option>
            </select>
          )}
          {cuentas && cuentas.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">No hay cuentas bancarias activas: créalas en Tesorería para cobrar por banco.</p>
          )}
        </div>
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
