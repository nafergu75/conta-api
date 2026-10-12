'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Calendar, CheckCircle, Clock, WarningCircle } from '@phosphor-icons/react';
import { ApiError, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { anioDeTexto, hoyIso } from '@/lib/anios';
import { enlaceModelo, textoPeriodoModelo, trimestreAPresentar } from '@/lib/aeatCalendar';
import { useAniosEmpresa, useElegido } from '@/lib/useAniosEmpresa';
import { leerModelosImpuesto, useVencimientosAeat, type ModeloImpuestoResumen } from '@/lib/useVencimientosAeat';
import SelectorAnio from '@/components/SelectorAnio';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { ConfirmationModal } from '@/components/dashboard/ConfirmationModal';

/**
 * Estado fiscal: el calendario de modelos de un ejercicio tal como lo calcula
 * el servidor (GET /impuestos/modelos), con la fecha límite ya pasada al día
 * hábil, y los próximos plazos.
 *
 * Lo que presentó otro (la gestoría, antes de usar la app) se marca como
 * «presentado fuera de la app», uno a uno o todo lo terminado del ejercicio.
 * Se puede deshacer. Ver: impuestos:read; marcar: impuestos:write.
 */

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type Confirmar = { tipo: 'modelo'; modelo: ModeloImpuestoResumen } | { tipo: 'ejercicio' } | null;

export default function EstadoFiscalPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-slate-200" />}>
      <EstadoFiscal />
    </Suspense>
  );
}

function EstadoFiscal() {
  const sp = useSearchParams();
  const aniosEmpresa = useAniosEmpresa();
  const { listo, actual, primero } = aniosEmpresa;
  // El ejercicio del último trimestre terminado (en enero, el anterior), nunca antes del primero de la empresa.
  const [ejercicio, setEjercicio] = useElegido(anioDeTexto(sp?.get('ejercicio')), trimestreAPresentar(hoyIso(), primero).ejercicio);
  const [pendientes, setPendientes] = useState<ModeloImpuestoResumen[]>([]);
  const [presentados, setPresentados] = useState<ModeloImpuestoResumen[]>([]);
  const [omitidos, setOmitidos] = useState<ModeloImpuestoResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmar>(null);
  const [ocupado, setOcupado] = useState(false);
  const [puedeMarcar, setPuedeMarcar] = useState(false);
  const { vencimientos } = useVencimientosAeat(6);

  useEffect(() => {
    setPuedeMarcar(tieneAlgunPermiso(getUser(), ['impuestos:write']));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga('');
    try {
      const [p, pr, o] = await Promise.all([
        leerModelosImpuesto(ejercicio, 'activos'),
        leerModelosImpuesto(ejercicio, 'presentados'),
        leerModelosImpuesto(ejercicio, 'omitidos'),
      ]);
      setPendientes(p);
      setPresentados(pr);
      setOmitidos(o);
    } catch (e) {
      setPendientes([]);
      setPresentados([]);
      setOmitidos([]);
      setErrorCarga(
        e instanceof ApiError && e.status === 403 ? 'Para ver el calendario de modelos necesitas permiso de impuestos en esta empresa.' : errorMessage(e),
      );
    } finally {
      setCargando(false);
    }
  }, [ejercicio]);

  useEffect(() => {
    if (listo) cargar();
  }, [listo, cargar]);

  const vencidos = pendientes.filter((m) => m.estado === 'expirado');
  // El servidor marca solo los periodos ya terminados; los que siguen en curso se quedan como están.
  const puedeMarcarEjercicio = puedeMarcar && ejercicio <= actual && pendientes.length > 0;

  const marcarModelo = async (m: ModeloImpuestoResumen) => {
    setOcupado(true);
    setAviso(null);
    try {
      await apiFetch(companyPath(`/impuestos/modelos/${encodeURIComponent(m.id)}/presentado-fuera-app`), { method: 'POST', body: '{}' });
      setAviso({ ok: true, texto: `Modelo ${m.codigo} (${textoPeriodoModelo(m.ejercicio, m.periodo)}) marcado como presentado fuera de la app.` });
      await cargar();
    } catch (e) {
      setAviso({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  };

  const marcarEjercicio = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await apiFetch<{ ejercicio: number; marcados: ModeloImpuestoResumen[] }>(
        companyPath(`/impuestos/ejercicios/${ejercicio}/presentado-fuera-app`),
        { method: 'POST', body: '{}' },
      );
      const n = r.marcados.length;
      setAviso({
        ok: true,
        texto: n
          ? `${n === 1 ? 'Se ha marcado 1 modelo' : `Se han marcado ${n} modelos`} de ${ejercicio} como presentados fuera de la app.`
          : `No había nada terminado y sin presentar en ${ejercicio}.`,
      });
      await cargar();
    } catch (e) {
      setAviso({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  };

  const deshacer = async (m: ModeloImpuestoResumen) => {
    setOcupado(true);
    setAviso(null);
    try {
      await apiFetch(companyPath(`/impuestos/modelos/${encodeURIComponent(m.id)}/no-presentado`), { method: 'POST', body: '{}' });
      setAviso({ ok: true, texto: `Modelo ${m.codigo} (${textoPeriodoModelo(m.ejercicio, m.periodo)}) vuelve a estar pendiente.` });
      await cargar();
    } catch (e) {
      setAviso({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado(false);
    }
  };

  const fila = (m: ModeloImpuestoResumen) => {
    const vencido = m.estado === 'expirado';
    const fueraApp = m.estado === 'presentado' && m.origen === 'fuera-app';
    return (
      <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
        <Link href={enlaceModelo(m.codigo, m.ejercicio, m.periodo)} className="w-14 font-mono font-semibold text-blue-700 hover:underline">
          {m.codigo}
        </Link>
        <span className="w-32 text-slate-700">{textoPeriodoModelo(m.ejercicio, m.periodo)}</span>
        <span className="min-w-0 flex-1 basis-40 text-slate-600">{m.descripcion}</span>
        <span className={`text-xs ${vencido ? 'font-medium text-red-700' : 'text-slate-500'}`}>
          {m.estado === 'presentado' ? (fueraApp ? 'Presentado fuera de la app' : 'Presentado') : m.estado === 'omitido' ? 'No se presenta' : `${vencido ? 'Venció' : 'Vence'} el ${fechaCorta(m.fechaVencimiento)}`}
        </span>
        {puedeMarcar && (m.estado === 'vigente' || m.estado === 'expirado') && (
          <button
            type="button"
            onClick={() => setConfirmar({ tipo: 'modelo', modelo: m })}
            disabled={ocupado}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Ya lo presenté fuera de la app
          </button>
        )}
        {puedeMarcar && fueraApp && (
          <button
            type="button"
            onClick={() => deshacer(m)}
            disabled={ocupado}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Deshacer
          </button>
        )}
      </li>
    );
  };

  const bloque = (titulo: string, lista: ModeloImpuestoResumen[], vacio: string) => (
    <section className="rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">
        {titulo} <span className="font-normal text-slate-500">({lista.length})</span>
      </h2>
      {lista.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">{vacio}</p> : <ul className="divide-y divide-slate-100">{lista.map(fila)}</ul>}
    </section>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Estado fiscal</h1>
        <p className="mt-2 text-slate-600">Los modelos de cada ejercicio: lo que falta por presentar, lo presentado y los próximos plazos.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <SelectorAnio id="estado-ejercicio" valor={ejercicio} anios={aniosEmpresa.aniosModelos([ejercicio])} onChange={(a) => a !== null && setEjercicio(a)} />
        {puedeMarcarEjercicio && (
          <button
            type="button"
            onClick={() => setConfirmar({ tipo: 'ejercicio' })}
            disabled={ocupado}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Marcar todo lo terminado de {ejercicio} como presentado fuera de la app
          </button>
        )}
      </div>

      {aviso && (
        <p role={aviso.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-sm ${aviso.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {aviso.texto}
        </p>
      )}

      {errorCarga ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorCarga}
        </div>
      ) : cargando && !pendientes.length && !presentados.length ? (
        <div className="h-64 animate-pulse rounded-lg bg-slate-200" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Resumen icono={<Clock size={32} className="text-amber-600" />} titulo="Sin presentar" valor={pendientes.length} nota={`del ejercicio ${ejercicio}`} />
            <Resumen icono={<WarningCircle size={32} className="text-red-600" />} titulo="Plazo vencido" valor={vencidos.length} nota="sin presentar" />
            <Resumen icono={<CheckCircle size={32} className="text-emerald-600" />} titulo="Presentados" valor={presentados.length} nota="en la app o fuera" />
          </div>

          <div className={`space-y-6 ${cargando ? 'opacity-60' : ''}`}>
            {bloque('Sin presentar', pendientes, `No queda nada por presentar de ${ejercicio}.`)}
            {bloque('Presentados', presentados, `Todavía no hay nada presentado de ${ejercicio}.`)}
            {omitidos.length > 0 && bloque('No se presentan', omitidos, '')}
          </div>
        </>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Calendar size={24} className="text-blue-600" />
          Próximos plazos
        </h2>
        {vencimientos === null ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        ) : vencimientos.length === 0 ? (
          <p className="text-sm text-slate-500">No tienes modelos pendientes de presentar.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {vencimientos.map((v) => (
              <AlertCard key={v.id} alert={v} />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">Si el último día cae en fin de semana o fiesta nacional, el plazo acaba el siguiente día hábil, y así sale aquí.</p>
      </section>

      <ConfirmationModal
        isOpen={confirmar !== null}
        title={
          confirmar?.tipo === 'modelo'
            ? `Modelo ${confirmar.modelo.codigo} (${textoPeriodoModelo(confirmar.modelo.ejercicio, confirmar.modelo.periodo)}) presentado fuera de la app`
            : `Todo lo terminado de ${ejercicio}, presentado fuera de la app`
        }
        message={
          confirmar?.tipo === 'modelo'
            ? 'Úsalo si este modelo lo presentó otra persona (tu gestoría, por ejemplo) o lo presentaste en la sede de la AEAT sin la app. Deja de salir como pendiente. Se puede deshacer.'
            : `Se marcan como presentados todos los modelos de ${ejercicio} cuyo periodo ya ha terminado y que siguen sin presentar, también los de antes de empezar a usar la app. Úsalo con un año que llevó otra persona. Cada uno se puede deshacer después.`
        }
        confirmLabel="Sí, marcar como presentado"
        isLoading={ocupado}
        onConfirm={() => (confirmar?.tipo === 'modelo' ? marcarModelo(confirmar.modelo) : marcarEjercicio())}
        onCancel={() => setConfirmar(null)}
      />
    </div>
  );
}

function Resumen({ icono, titulo, valor, nota }: { icono: React.ReactNode; titulo: string; valor: number; nota: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <p className="text-sm text-slate-600">{titulo}</p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{valor}</p>
        <p className="mt-1 text-xs text-slate-500">{nota}</p>
      </div>
      {icono}
    </div>
  );
}
