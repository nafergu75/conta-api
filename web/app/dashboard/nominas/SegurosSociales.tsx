'use client';

import { useEffect, useState } from 'react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  Alerta,
  aNumero,
  boton,
  botonPeligro,
  botonSecundario,
  CamposMedioPago,
  campo,
  cuerpoMedioPago,
  etiqueta,
  eur,
  fechaEs,
  hoyIso,
  medioPagoCompleto,
  Modal,
  periodoTexto,
  type MedioPago,
} from './comun';

/**
 * Seguros sociales del mes (RLC): lo previsto sale de las nominas
 * contabilizadas; se puede apuntar el importe real del RLC y la IT
 * compensada, y pagarlo (476 contra el banco; la diferencia, a la 642).
 * La complementaria (tipo COMPLEMENTARIA) salda la SS de las nominas
 * contabilizadas despues de pagar el RLC normal; el resto va a la 642.
 */

export interface SegurosSocialesMes {
  id: string | null;
  ejercicio: number;
  mes: number;
  tipo: string;
  nominas: number;
  borradores: number;
  cuotaObrera: number;
  cuotaPatronal: number;
  totalPrevisto: number;
  totalRlc: number | null;
  compensacionIt: number;
  aPagar: number;
  diferencia: number;
  fechaCargoPrevista: string;
  estado: 'SIN_NOMINAS' | 'PENDIENTE' | 'PAGADA';
  asientoPagoNumero: string | null;
  fechaPago: string | null;
  cuentaPago: string | null;
  observaciones: string | null;
}

const texto = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

export function SegurosSociales({
  ss,
  escribir,
  onCambio,
  onMensaje,
}: {
  ss: SegurosSocialesMes;
  escribir: boolean;
  onCambio: () => void;
  onMensaje: (tipo: 'ok' | 'error', texto: string) => void;
}) {
  const [rlc, setRlc] = useState(texto(ss.totalRlc));
  const [it, setIt] = useState(ss.compensacionIt ? texto(ss.compensacionIt) : '');
  const [fechaCargo, setFechaCargo] = useState(ss.fechaCargoPrevista);
  const [guardando, setGuardando] = useState(false);
  const [modal, setModal] = useState<'pagar' | 'anular' | null>(null);

  useEffect(() => {
    setRlc(texto(ss.totalRlc));
    setIt(ss.compensacionIt ? texto(ss.compensacionIt) : '');
    setFechaCargo(ss.fechaCargoPrevista);
  }, [ss]);

  const pagada = ss.estado === 'PAGADA';
  const sinNominas = ss.estado === 'SIN_NOMINAS';
  const complementaria = ss.tipo === 'COMPLEMENTARIA';
  // Prefijo de los id: la normal y la complementaria pueden estar a la vez en la pantalla.
  const id = complementaria ? 'ssc' : 'ss';
  const cambiado = rlc !== texto(ss.totalRlc) || it !== (ss.compensacionIt ? texto(ss.compensacionIt) : '') || fechaCargo !== ss.fechaCargoPrevista;
  const ruta = `/nominas/seguros-sociales/${ss.ejercicio}/${ss.mes}`;

  const guardar = async () => {
    const totalRlc = rlc.trim() === '' ? null : aNumero(rlc);
    const compensacionIt = aNumero(it);
    if ((totalRlc !== null && !(totalRlc >= 0)) || !(compensacionIt >= 0)) return onMensaje('error', 'El importe del RLC y la IT tienen que ser números positivos.');
    setGuardando(true);
    try {
      await apiFetch(companyPath(ruta), { method: 'PUT', body: JSON.stringify({ tipo: ss.tipo, totalRlc, compensacionIt, fechaCargoPrevista: fechaCargo }) });
      onMensaje('ok', `Seguros sociales ${complementaria ? 'complementarios ' : ''}de ${periodoTexto(ss.ejercicio, ss.mes)} guardados.`);
      onCambio();
    } catch (e) {
      onMensaje('error', errorMessage(e));
    } finally {
      setGuardando(false);
    }
  };

  const fila = (t: string, v: string, fuerte = false) => (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-slate-600">{t}</dt>
      <dd className={`tabular-nums ${fuerte ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{v}</dd>
    </div>
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby={`${id}-titulo`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-titulo`} className="font-semibold text-slate-900">
          {complementaria ? 'Seguros sociales complementarios' : 'Seguros sociales'}
        </h2>
        {pagada ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Pagados el {fechaEs(ss.fechaPago)}</span>
        ) : sinNominas ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">Sin nóminas contabilizadas</span>
        ) : (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">Pendiente · cargo el {fechaEs(ss.fechaCargoPrevista)}</span>
        )}
      </div>

      {complementaria && !pagada && (
        <p className="mb-2 text-xs text-slate-600">
          El RLC normal ya está pagado. Lo que sigue en la 476 es la SS de nóminas contabilizadas después de pagarlo: el RLC complementario la salda, y lo que pase de ahí va a la 642.
        </p>
      )}
      <dl className="divide-y divide-slate-100 text-sm">
        {fila('Cuota obrera (SS de los trabajadores)', eur.format(ss.cuotaObrera))}
        {fila('Cuota patronal (SS de la empresa)', eur.format(ss.cuotaPatronal))}
        {fila(complementaria ? 'En la 476 por nóminas posteriores' : 'Previsto según las nóminas', eur.format(ss.totalPrevisto), true)}
        {ss.totalRlc !== null && fila('RLC real', eur.format(ss.totalRlc))}
        {ss.compensacionIt > 0 && fila('IT compensada (pago delegado)', eur.format(ss.compensacionIt))}
        {ss.diferencia !== 0 && fila('Diferencia (va a la 642)', eur.format(ss.diferencia))}
        {fila(pagada ? 'Pagado' : 'A pagar', eur.format(ss.aPagar), true)}
        {pagada && ss.asientoPagoNumero && fila('Asiento del pago', `${ss.asientoPagoNumero}${ss.cuentaPago ? ` · ${ss.cuentaPago}` : ''}`)}
      </dl>

      {ss.borradores > 0 && !complementaria && (
        <p className="mt-3 text-xs text-amber-700">
          {ss.borradores} {ss.borradores === 1 ? 'nómina sigue' : 'nóminas siguen'} en borrador: su SS no está en la 476 y no se pueden pagar los seguros sociales hasta contabilizarlas.
        </p>
      )}

      {escribir && !pagada && !sinNominas && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`${id}-rlc`} className={etiqueta}>
                Importe del RLC{complementaria ? ' complementario' : ''}
              </label>
              <input id={`${id}-rlc`} inputMode="decimal" value={rlc} onChange={(e) => setRlc(e.target.value)} placeholder={texto(ss.totalPrevisto)} className={`${campo} text-right tabular-nums`} />
            </div>
            <div>
              <label htmlFor={`${id}-it`} className={etiqueta}>
                IT compensada
              </label>
              <input id={`${id}-it`} inputMode="decimal" value={it} onChange={(e) => setIt(e.target.value)} placeholder="0,00" className={`${campo} text-right tabular-nums`} />
            </div>
            <div>
              <label htmlFor={`${id}-fecha`} className={etiqueta}>
                Fecha de cargo
              </label>
              <input id={`${id}-fecha`} type="date" value={fechaCargo} onChange={(e) => setFechaCargo(e.target.value)} className={campo} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={guardar} disabled={guardando || !cambiado} className={botonSecundario}>
              {guardando ? 'Guardando...' : 'Guardar RLC'}
            </button>
            <button
              type="button"
              onClick={() => setModal('pagar')}
              disabled={(ss.borradores > 0 && !complementaria) || cambiado || !(ss.aPagar > 0)}
              className={boton}
              title={cambiado ? 'Guarda antes los cambios' : !(ss.aPagar > 0) ? 'Indica antes el importe del RLC' : undefined}
            >
              {complementaria ? 'Pagar la complementaria' : 'Pagar seguros sociales'}
            </button>
          </div>
        </div>
      )}
      {escribir && pagada && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <button type="button" onClick={() => setModal('anular')} className="text-sm font-medium text-red-700 hover:underline">
            Anular el pago
          </button>
        </div>
      )}

      {modal === 'pagar' && (
        <PagarSS
          ss={ss}
          onCerrar={() => setModal(null)}
          onHecho={(t) => {
            setModal(null);
            onMensaje('ok', t);
            onCambio();
          }}
        />
      )}
      {modal === 'anular' && (
        <AnularPagoSS
          ss={ss}
          onCerrar={() => setModal(null)}
          onHecho={(t) => {
            setModal(null);
            onMensaje('ok', t);
            onCambio();
          }}
        />
      )}
    </section>
  );
}

function PagarSS({ ss, onCerrar, onHecho }: { ss: SegurosSocialesMes; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [medio, setMedio] = useState<MedioPago>({ fecha: ss.fechaCargoPrevista <= hoyIso() ? ss.fechaCargoPrevista : hoyIso(), cuenta: '' });
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch<{ asiento: { numero: string }; importe: number; diferencia: number }>(
        companyPath(`/nominas/seguros-sociales/${ss.ejercicio}/${ss.mes}/pago`),
        { method: 'POST', body: JSON.stringify({ ...cuerpoMedioPago(medio), ...(ss.tipo === 'COMPLEMENTARIA' ? { tipo: 'COMPLEMENTARIA' } : {}) }) },
      );
      onHecho(`Seguros sociales pagados: ${eur.format(r.importe)} (asiento ${r.asiento.numero}).${r.diferencia ? ` La diferencia de ${eur.format(r.diferencia)} con lo previsto va a la 642.` : ''}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal titulo={`Pagar los seguros sociales ${ss.tipo === 'COMPLEMENTARIA' ? 'complementarios ' : ''}de ${periodoTexto(ss.ejercicio, ss.mes)}`} onCerrar={onCerrar}>
      <form onSubmit={pagar} className="space-y-4">
        <p className="text-sm text-slate-700">
          Se paga <strong className="tabular-nums">{eur.format(ss.aPagar)}</strong>
          {ss.totalRlc === null ? ' (lo previsto según las nóminas; si el RLC es otro importe, guárdalo antes)' : ' (el RLC)'}: la 476 contra el banco
          {ss.diferencia !== 0 ? `, y la diferencia de ${eur.format(ss.diferencia)} a la 642` : ''}
          {ss.compensacionIt > 0 ? `; la IT compensada (${eur.format(ss.compensacionIt)}) a la 471` : ''}.
        </p>
        <CamposMedioPago valor={medio} onCambiar={setMedio} importe={ss.aPagar} />
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado || !medioPagoCompleto(medio)} className={boton}>
            {ocupado ? 'Pagando...' : `Pagar ${eur.format(ss.aPagar)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AnularPagoSS({ ss, onCerrar, onHecho }: { ss: SegurosSocialesMes; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [fecha, setFecha] = useState(hoyIso());
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const anular = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch<{ asientoRevertido: string | null; contraasiento: { numero: string } | null }>(
        companyPath(`/nominas/seguros-sociales/${ss.ejercicio}/${ss.mes}/pago/anular`),
        { method: 'POST', body: JSON.stringify({ tipo: ss.tipo, fecha, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }) },
      );
      onHecho(
        r.contraasiento
          ? `Pago de los seguros sociales anulado con el contraasiento ${r.contraasiento.numero}.`
          : `Pago de los seguros sociales anulado${r.asientoRevertido ? ` (asiento ${r.asientoRevertido} revertido)` : ''}.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal titulo="Anular el pago de los seguros sociales" onCerrar={onCerrar}>
      <form onSubmit={anular} className="space-y-4">
        <p className="text-sm text-slate-700">
          Si el periodo del pago está abierto, el asiento se anula. Si está cerrado, se hace un contraasiento con esta fecha.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ass-fecha" className={etiqueta}>
              Fecha del contraasiento
            </label>
            <input id="ass-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="ass-motivo" className={etiqueta}>
              Motivo
            </label>
            <input id="ass-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Opcional" />
          </div>
        </div>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado} className={botonPeligro}>
            {ocupado ? 'Anulando...' : 'Anular el pago'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
