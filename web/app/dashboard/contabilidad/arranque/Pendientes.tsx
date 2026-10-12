'use client';

import { useCallback, useEffect, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { hoyEspana } from '@/lib/verifactu';
import {
  ANIO_GESTORIA,
  eur,
  fechaEs,
  importeEnCampo,
  leerImporte,
  partidasApi,
  varios,
  type Liquidacion,
  type ListaPartidas,
  type PartidaVista,
} from '@/lib/arranque';
import { Bloque, boton, botonSecundario, campo, Cifra, Cifras, Dialogo, Nota } from './comun';

const A = ANIO_GESTORIA;

const ESTADO: Record<string, [string, string]> = {
  PENDIENTE: ['Pendiente', 'bg-amber-100 text-amber-800'],
  PARCIAL: ['En parte', 'bg-sky-100 text-sky-800'],
  LIQUIDADA: ['Saldada', 'bg-emerald-100 text-emerald-800'],
  ANULADA: ['Anulada', 'bg-slate-100 text-slate-700'],
};

interface CuentaBancaria {
  id: string;
  iban: string;
  bancoNombre?: string;
  estado: string;
}

/** Cobrar o pagar una factura de 2026 (todo o una parte). */
function Liquidar({ partida, cuentas, onCerrar, onHecho }: { partida: PartidaVista; cuentas: CuentaBancaria[]; onCerrar: () => void; onHecho: (texto: string) => void }) {
  const cobro = partida.tipo === 'COBRO';
  // Antes del 1-1-2027 no se puede cobrar en la app (2026 lo lleva la gestoría).
  const [fecha, setFecha] = useState(() => (hoyEspana() < `${A + 1}-01-01` ? `${A + 1}-01-01` : hoyEspana()));
  const [importe, setImporte] = useState(importeEnCampo(partida.pendiente));
  const [comision, setComision] = useState('');
  const [cuenta, setCuenta] = useState(cuentas.find((c) => c.estado === 'activa')?.id ?? (cuentas[0]?.id ?? 'caja'));
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    setError('');
    const n = leerImporte(importe);
    if (n === null) return setError('Escribe el importe (por ejemplo, 1.250,30).');
    const com = comision.trim() ? leerImporte(comision) : 0;
    if (com === null) return setError('La comisión no es un importe.');
    setOcupado(true);
    try {
      await partidasApi.liquidar(partida.id, {
        fecha,
        importe: n,
        ...(com ? { comision: com } : {}),
        ...(cuenta === 'caja' ? { caja: true } : { cuentaBancariaId: cuenta }),
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      });
      onHecho(`${cobro ? 'Cobro' : 'Pago'} de ${eur.format(n)} apuntado en la factura ${partida.numeroDocumento}.`);
    } catch (e) {
      setError(errorMessage(e));
      setOcupado(false);
    }
  };

  return (
    <Dialogo titulo={`${cobro ? 'Cobrar' : 'Pagar'} la factura ${partida.numeroDocumento}`} onCerrar={ocupado ? () => undefined : onCerrar}>
      <p className="text-sm text-slate-600">
        {partida.tercero} · queda {eur.format(partida.pendiente)}. El asiento va contra la subcuenta <span className="font-mono">{partida.subcuenta}</span>.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          Fecha
          <input type="date" className={campo} value={fecha} min={`${A + 1}-01-01`} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Importe
          <input inputMode="decimal" className={campo} value={importe} onChange={(e) => setImporte(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {cobro ? 'Cobrado en' : 'Pagado desde'}
          <select className={campo} value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.bancoNombre || 'Banco'} · {c.iban}
              </option>
            ))}
            <option value="caja">Caja (efectivo)</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Comisión del banco (si la hay)
          <input inputMode="decimal" className={campo} value={comision} placeholder="0,00" onChange={(e) => setComision(e.target.value)} />
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Nota
        <input className={campo} value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} />
      </label>
      {error && (
        <div className="mt-3">
          <Nota tipo="error">{error}</Nota>
        </div>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" className={boton} disabled={ocupado} onClick={guardar}>
          {ocupado ? 'Guardando…' : cobro ? 'Apuntar el cobro' : 'Apuntar el pago'}
        </button>
        <button type="button" className={botonSecundario} disabled={ocupado} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </Dialogo>
  );
}

/** Cobros o pagos de una factura de 2026, con «Anular». */
function Detalle({ partida, puedeEscribir, onCerrar, onHecho }: { partida: PartidaVista; puedeEscribir: boolean; onCerrar: () => void; onHecho: (texto: string) => void }) {
  const [liqs, setLiqs] = useState<Liquidacion[] | null>(null);
  const [error, setError] = useState('');
  const [fecha, setFecha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    partidasApi
      .detalle(partida.id)
      .then((d) => setLiqs(d.liquidaciones))
      .catch((e) => setError(errorMessage(e)));
  }, [partida.id]);

  const anular = async (l: Liquidacion) => {
    if (!window.confirm(`¿Anular el ${partida.tipo === 'COBRO' ? 'cobro' : 'pago'} de ${eur.format(l.importe)} del ${fechaEs(l.fecha)}?`)) return;
    setOcupado(true);
    setError('');
    try {
      const r = await partidasApi.anular(l.id, fecha || undefined);
      onHecho(r.contraasiento ? 'Anulado con un contraasiento (el mes estaba bloqueado).' : 'Anulado: la factura vuelve a quedar pendiente.');
    } catch (e) {
      setError(errorMessage(e));
      setOcupado(false);
    }
  };

  return (
    <Dialogo titulo={`Factura ${partida.numeroDocumento}`} onCerrar={onCerrar}>
      <p className="text-sm text-slate-600">
        {partida.tercero} · a 31-12-{A}: {eur.format(partida.importeInicial)} · queda {eur.format(partida.pendiente)}
      </p>
      {partida.compensado !== 0 && (
        <p className="mt-2 text-sm text-slate-600">
          {eur.format(partida.compensado)} se han descontado con abonos del proveedor. Se ven y se anulan en la ficha del abono, en Compras.
        </p>
      )}
      {!liqs && !error && <p className="mt-3 text-sm text-slate-500">Cargando…</p>}
      {liqs && liqs.length === 0 && partida.compensado === 0 && <p className="mt-3 text-sm text-slate-600">Todavía no tiene cobros ni pagos.</p>}
      {liqs && liqs.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {liqs.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className={l.estado === 'ANULADO' ? 'text-slate-400 line-through' : 'text-slate-800'}>
                {fechaEs(l.fecha)} · {eur.format(l.importe)}
                {l.comision ? ` (comisión ${eur.format(l.comision)})` : ''} · {l.cuentaTesoreria}
                {l.asiento ? ` · ${l.asiento}` : ''}
              </span>
              {puedeEscribir && l.estado === 'ACTIVO' && (
                <button type="button" disabled={ocupado} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50" onClick={() => anular(l)}>
                  Anular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeEscribir && liqs?.some((l) => l.estado === 'ACTIVO') && (
        <label className="mt-3 block text-xs font-medium text-slate-600">
          Fecha del contraasiento (solo si el mes del cobro está bloqueado)
          <input type="date" className={campo} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      )}
      {error && (
        <div className="mt-3">
          <Nota tipo="error">{error}</Nota>
        </div>
      )}
      <div className="mt-4">
        <button type="button" className={botonSecundario} onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </Dialogo>
  );
}

/**
 * Facturas de 2026 que la gestoría dejó pendientes a 31-12: lo que queda por
 * cobrar y por pagar, para cobrarlo o pagarlo en 2027. No son facturas de la
 * app: no cuentan para el IVA ni para el 347 de 2027.
 */
export function Pendientes() {
  const user = getUser();
  const puedeEscribir = tieneAlgunPermiso(user, ['tesoreria:write']);
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('ABIERTAS');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [datos, setDatos] = useState<ListaPartidas | null>(null);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const [liquidando, setLiquidando] = useState<PartidaVista | null>(null);
  const [viendo, setViendo] = useState<PartidaVista | null>(null);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);

  const cargar = useCallback(async () => {
    try {
      setDatos(await partidasApi.listar({ tipo, estado, q: busqueda }));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [tipo, estado, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!puedeEscribir) return;
    apiFetch<CuentaBancaria[]>(companyPath('/treasury/bank-accounts'))
      .then((c) => setCuentas(c ?? []))
      .catch(() => setCuentas([]));
  }, [puedeEscribir]);

  const terminar = (texto: string) => {
    setLiquidando(null);
    setViendo(null);
    setHecho(texto);
    cargar();
  };

  const tot = datos?.totales;
  return (
    <div className="space-y-4">
      <Bloque titulo={`Facturas de ${A} pendientes`}>
        <p className="text-sm text-slate-600">
          Las que la gestoría dejó por cobrar o por pagar a 31-12-{A}. Se cobran y se pagan aquí o casándolas en la conciliación del banco. Su IVA ya está en {A}: no salen en
          los modelos de {A + 1}.
        </p>
        {tot && (
          <div className="mt-3">
            <Cifras>
              <Cifra titulo="Por cobrar" valor={eur.format(tot.cobros.pendiente)} />
              <Cifra titulo="Facturas por cobrar" valor={tot.cobros.abiertas} />
              <Cifra titulo="Por pagar" valor={eur.format(tot.pagos.pendiente)} />
              <Cifra titulo="Facturas por pagar" valor={tot.pagos.abiertas} />
            </Cifras>
          </div>
        )}
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_2fr]"
          onSubmit={(e) => {
            e.preventDefault();
            setBusqueda(q.trim());
          }}
        >
          <label className="block text-xs font-medium text-slate-600">
            Qué
            <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Cobros y pagos</option>
              <option value="COBRO">Por cobrar</option>
              <option value="PAGO">Por pagar</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Estado
            <select className={campo} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="ABIERTAS">Sin saldar</option>
              <option value="LIQUIDADA">Saldadas</option>
              <option value="ANULADA">Anuladas</option>
              <option value="">Todas</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Buscar
            <span className="mt-1 flex gap-2">
              <input className={`${campo} mt-0`} value={q} placeholder="Cliente, proveedor, NIF o nº de factura" onChange={(e) => setQ(e.target.value)} />
              <button type="submit" className={`${botonSecundario} shrink-0 px-3`} aria-label="Buscar">
                <MagnifyingGlass size={16} />
              </button>
            </span>
          </label>
        </form>
      </Bloque>

      {hecho && <Nota tipo="bien">{hecho}</Nota>}
      {error && <Nota tipo="error">{error}</Nota>}

      {datos && (
        <section className="rounded-xl border border-slate-200 bg-white">
          {datos.partidas.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No hay facturas de {A} con este filtro.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {datos.partidas.map((p) => {
                const [texto, clase] = ESTADO[p.estado] ?? [p.estado, 'bg-slate-100 text-slate-700'];
                return (
                  <li key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-slate-900">
                        {p.tercero || p.subcuenta} <span className="font-normal text-slate-500">· {p.tipo === 'COBRO' ? 'por cobrar' : 'por pagar'}</span>
                      </p>
                      <p className="break-words text-xs text-slate-600">
                        {p.sinDetalle ? `Saldo sin detalle a 31-12-${A}` : `Factura ${p.numeroDocumento}`}
                        {p.fechaDocumento ? ` del ${fechaEs(p.fechaDocumento)}` : ''}
                        {p.fechaVencimiento ? ` · vence el ${fechaEs(p.fechaVencimiento)}` : ''} · <span className="font-mono">{p.subcuenta}</span>
                        {p.moneda !== 'EUR' ? ` · en ${p.moneda}` : ''}
                        {p.compensado !== 0 ? ` · ${eur.format(p.compensado)} descontados con abonos` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="text-right text-sm font-semibold tabular-nums text-slate-900">{eur.format(p.pendiente)}</span>
                      {p.vencida && p.estado !== 'LIQUIDADA' && p.estado !== 'ANULADA' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Vencida</span>}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${clase}`}>{texto}</span>
                      {p.liquidado !== 0 && (
                        <button type="button" className="text-xs font-medium text-slate-600 hover:underline" onClick={() => setViendo(p)}>
                          Ver {p.tipo === 'COBRO' ? 'cobros' : 'pagos'}
                        </button>
                      )}
                      {puedeEscribir && (p.estado === 'PENDIENTE' || p.estado === 'PARCIAL') && (
                        <button type="button" className={`${boton} px-3 py-1.5 text-xs`} onClick={() => setLiquidando(p)}>
                          {p.tipo === 'COBRO' ? 'Cobrar' : 'Pagar'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {datos.partidas.length > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{varios(datos.partidas.length, 'factura', 'facturas')}</p>}
        </section>
      )}

      {liquidando && <Liquidar partida={liquidando} cuentas={cuentas} onCerrar={() => setLiquidando(null)} onHecho={terminar} />}
      {viendo && <Detalle partida={viendo} puedeEscribir={puedeEscribir} onCerrar={() => setViendo(null)} onHecho={terminar} />}
    </div>
  );
}
