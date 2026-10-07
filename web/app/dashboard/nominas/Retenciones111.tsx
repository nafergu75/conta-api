'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  Alerta,
  Avisos,
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
  type MedioPago,
} from './comun';

/**
 * Retenciones del trimestre (modelo 111) desde Nominas del mes: lo que sale con
 * las nominas por fecha de pago y los profesionales, lo que se paga (lo
 * presentado manda sobre el calculo) y el pago: 4751 contra el banco.
 */

interface Retenciones {
  periodo: { ejercicio: number; periodo: string };
  casillas: Record<string, number>;
  nominas: number;
  borradores: number;
  pago: { asientoId: string; numero: string; fecha: string } | null;
  aPagar: { importe: number; fuente: 'presentado' | 'editado' | 'calculado'; trabajo: number; profesionales: number };
  avisos: string[];
}

const FUENTE: Record<Retenciones['aPagar']['fuente'], string> = {
  presentado: 'lo presentado',
  editado: 'lo editado a mano en Impuestos',
  calculado: 'calculado con las nóminas (por fecha de pago) y las facturas de profesionales',
};

/** Ultimo dia para presentar e ingresar el 111 del trimestre (el 20 del mes siguiente; el 4T, el 20 de enero). */
const vencimiento = (ejercicio: number, t: number) => (t === 4 ? `${ejercicio + 1}-01-20` : `${ejercicio}-${String(t * 3 + 1).padStart(2, '0')}-20`);

export function Retenciones111({
  ejercicio,
  mes,
  escribir,
  version = 0,
  onMensaje,
}: {
  ejercicio: number;
  mes: number;
  escribir: boolean;
  /** Cambia cuando se recarga el mes: las retenciones se vuelven a pedir. */
  version?: number;
  onMensaje: (tipo: 'ok' | 'error', texto: string, avisos?: string[]) => void;
}) {
  const trimestre = Math.ceil(mes / 3);
  const [r, setR] = useState<Retenciones | null>(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'pagar' | 'anular' | null>(null);

  const cargar = useCallback(async () => {
    try {
      setR(await apiFetch<Retenciones>(companyPath(`/nominas/retenciones/${ejercicio}/${trimestre}T`)));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [ejercicio, trimestre]);

  useEffect(() => {
    cargar();
  }, [cargar, version]);

  const hecho = (texto: string, avisos?: string[]) => {
    setModal(null);
    onMensaje('ok', texto, avisos);
    cargar();
  };

  const c = (k: string) => r?.casillas[k] ?? 0;
  const fila = (t: string, v: string, fuerte = false) => (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-slate-600">{t}</dt>
      <dd className={`tabular-nums ${fuerte ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{v}</dd>
    </div>
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="ret-titulo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="ret-titulo" className="font-semibold text-slate-900">
          Retenciones del {trimestre}T/{ejercicio} (modelo 111)
        </h2>
        <Link href={`/dashboard/fiscal/modelo-111?ejercicio=${ejercicio}&trimestre=${trimestre}`} className="text-sm font-medium text-blue-700 hover:underline">
          Ver el modelo 111
        </Link>
      </div>
      {error && <Alerta tipo="error">{error}</Alerta>}
      {!r && !error && <p className="text-sm text-slate-500">Cargando las retenciones del trimestre...</p>}
      {r && (
        <>
          <dl className="divide-y divide-slate-100 text-sm">
            {fila(`Trabajo: ${c('01')} ${c('01') === 1 ? 'perceptor' : 'perceptores'}, base ${eur.format(c('02'))}`, eur.format(c('03')))}
            {(c('04') > 0 || c('06') > 0) && fila(`Especie: ingresos a cuenta (${c('04')} ${c('04') === 1 ? 'perceptor' : 'perceptores'})`, eur.format(c('06')))}
            {(c('07') > 0 || c('09') > 0) && fila(`Profesionales: ${c('07')}, base ${eur.format(c('08'))}`, eur.format(c('09')))}
            {fila(r.pago ? 'Pagado' : 'A ingresar', eur.format(r.aPagar.importe), true)}
          </dl>
          <p className="mt-1 text-xs text-slate-500">
            Importe: {FUENTE[r.aPagar.fuente]}. Nóminas del trimestre: {r.nominas}
            {r.borradores ? `, ${r.borradores} en borrador` : ''}. Vence el {fechaEs(vencimiento(ejercicio, trimestre))}.
          </p>
          {r.avisos.length > 0 && (
            <div className="mt-3">
              <Avisos avisos={r.avisos} />
            </div>
          )}
          {r.pago ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
              <span className="text-emerald-700">
                Pagado el {fechaEs(r.pago.fecha)} (asiento {r.pago.numero}).
              </span>
              {escribir && (
                <button type="button" onClick={() => setModal('anular')} className="text-sm font-medium text-red-700 hover:underline">
                  Anular el pago
                </button>
              )}
            </div>
          ) : (
            escribir &&
            r.aPagar.importe > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setModal('pagar')}
                  disabled={r.borradores > 0}
                  className={boton}
                  title={r.borradores > 0 ? 'Contabiliza antes las nóminas en borrador: su IRPF aún no está en la 4751' : undefined}
                >
                  Pagar el 111
                </button>
                {r.borradores > 0 && <p className="mt-1 text-xs text-amber-700">Contabiliza antes las nóminas en borrador: su IRPF aún no está en la 4751.</p>}
              </div>
            )
          )}
        </>
      )}

      {modal === 'pagar' && r && <Pagar111 r={r} ejercicio={ejercicio} trimestre={trimestre} onCerrar={() => setModal(null)} onHecho={hecho} />}
      {modal === 'anular' && r && <AnularPago111 ejercicio={ejercicio} trimestre={trimestre} onCerrar={() => setModal(null)} onHecho={hecho} />}
    </section>
  );
}

function Pagar111({ r, ejercicio, trimestre, onCerrar, onHecho }: { r: Retenciones; ejercicio: number; trimestre: number; onCerrar: () => void; onHecho: (t: string, avisos?: string[]) => void }) {
  const vence = vencimiento(ejercicio, trimestre);
  const [medio, setMedio] = useState<MedioPago>({ fecha: vence < hoyIso() ? vence : hoyIso(), cuenta: '' });
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const p = await apiFetch<{ importe: number; asiento: { numero: string }; avisos: string[] }>(companyPath(`/nominas/retenciones/${ejercicio}/${trimestre}T/pago`), {
        method: 'POST',
        body: JSON.stringify(cuerpoMedioPago(medio)),
      });
      onHecho(`111 del ${trimestre}T/${ejercicio} pagado: ${eur.format(p.importe)} (asiento ${p.asiento.numero}).`, p.avisos);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal titulo={`Pagar el 111 del ${trimestre}T/${ejercicio}`} onCerrar={onCerrar}>
      <form onSubmit={pagar} className="space-y-4">
        <p className="text-sm text-slate-700">
          Se paga <strong className="tabular-nums">{eur.format(r.aPagar.importe)}</strong> ({FUENTE[r.aPagar.fuente]}): se salda la 4751 de las retenciones del trabajo
          {r.aPagar.profesionales > 0 ? ' y la de profesionales' : ''} contra la cuenta elegida.
        </p>
        <CamposMedioPago valor={medio} onCambiar={setMedio} importe={r.aPagar.importe} />
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado || !medioPagoCompleto(medio)} className={boton}>
            {ocupado ? 'Pagando...' : `Pagar ${eur.format(r.aPagar.importe)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AnularPago111({ ejercicio, trimestre, onCerrar, onHecho }: { ejercicio: number; trimestre: number; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [fecha, setFecha] = useState(hoyIso());
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const anular = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const p = await apiFetch<{ asientoRevertido: string | null; contraasiento: { numero: string } | null }>(companyPath(`/nominas/retenciones/${ejercicio}/${trimestre}T/pago/anular`), {
        method: 'POST',
        body: JSON.stringify({ fecha, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }),
      });
      onHecho(p.contraasiento ? `Pago del 111 anulado con el contraasiento ${p.contraasiento.numero}.` : 'Pago del 111 anulado.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal titulo={`Anular el pago del 111 del ${trimestre}T/${ejercicio}`} onCerrar={onCerrar}>
      <form onSubmit={anular} className="space-y-4">
        <p className="text-sm text-slate-700">Si el periodo del pago está abierto, el asiento se anula. Si está cerrado, se hace un contraasiento con esta fecha.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="a111-fecha" className={etiqueta}>
              Fecha del contraasiento
            </label>
            <input id="a111-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="a111-motivo" className={etiqueta}>
              Motivo
            </label>
            <input id="a111-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Opcional" />
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
