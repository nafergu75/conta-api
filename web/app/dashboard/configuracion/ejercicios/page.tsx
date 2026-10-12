'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck, LockKey, LockKeyOpen, Plus } from '@phosphor-icons/react';
import { ConfirmationModal } from '@/components/dashboard/ConfirmationModal';
import { ApiError, apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  claseBoton,
  claseBotonSecundario,
  claseCampo,
  fechaCorta,
  MESES,
  puedeEditar,
  puedeVer,
  QUIEN_EDITA,
  type EjercicioConfig,
  type PeriodoMes,
} from '@/lib/configuracion';
import { AvisoSoloLectura, CabeceraBloque, Etiqueta, Mensaje, SinAcceso, type MensajeConfig } from '../componentes';
import { useConfiguracion } from '../contexto';

/**
 * Ejercicios y periodos: los ejercicios con un estado unico, crear cualquier
 * año natural, bloquear o desbloquear meses y exigir el cuadre de bancos
 * antes de cerrar. Cerrar o deshacer el cierre se hace en Cierre y traspaso
 * de saldos. Ver: contabilidad:read; cambiar: contabilidad:write; reabrir un
 * ejercicio cerrado sin asientos: admin:empresa.
 */

const ANIO_MINIMO = 1990;
const enlaceCierre = (anio: string) => `/dashboard/contabilidad/cierre-ejercicio?ejercicio=${anio}`;

const ESTADO_EJERCICIO: Record<EjercicioConfig['estadoEfectivo'], { texto: string; tono: 'verde' | 'gris' | 'ambar' }> = {
  ABIERTO: { texto: 'Abierto', tono: 'verde' },
  CERRADO: { texto: 'Cerrado', tono: 'gris' },
  CERRADO_SIN_ASIENTOS: { texto: 'Cerrado sin asientos', tono: 'ambar' },
};

/** «303 1T», «303 1T y 111 1T», «303 1T, 111 1T y 115 1T». */
function enumerar(lista: string[], articulo = ''): string {
  const l = lista.map((m) => `${articulo}${m}`);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : (l[0] ?? '');
}

/** Detalles de un error del servidor (motivo, aviso, enlace...). */
function detalles(e: unknown): Record<string, unknown> {
  const d = e instanceof ApiError ? e.detalles : undefined;
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
}

export default function EjerciciosPage() {
  const { user, listo } = useConfiguracion();
  const ver = puedeVer(user, 'ejercicios');
  const editar = puedeEditar(user, 'ejercicios');
  const reabrirPermitido = puedeVer(user, 'reabrir');

  const [ejercicios, setEjercicios] = useState<EjercicioConfig[] | null>(null);
  const [anioSel, setAnioSel] = useState('');
  const [periodos, setPeriodos] = useState<PeriodoMes[] | null>(null);
  const [exigirCuadre, setExigirCuadre] = useState<boolean | null>(null);
  const [mensaje, setMensaje] = useState<MensajeConfig>(null);
  const [ocupado, setOcupado] = useState('');
  const [nuevoAnio, setNuevoAnio] = useState('');
  const [reabrir, setReabrir] = useState<EjercicioConfig | null>(null);
  const [confirmarMes, setConfirmarMes] = useState<{ mes: number; modelos: string[] } | null>(null);

  const cargarEjercicios = useCallback(async (seleccionar?: string) => {
    const lista = await apiFetch<EjercicioConfig[]>(companyPath('/fiscal-years'));
    setEjercicios(lista);
    const hoy = String(new Date().getFullYear());
    setAnioSel((actual) => {
      if (seleccionar) return seleccionar;
      if (lista.some((e) => e.label === actual)) return actual;
      return (lista.find((e) => e.label === hoy) ?? lista[0])?.label ?? '';
    });
  }, []);

  useEffect(() => {
    if (!listo || !ver) return;
    cargarEjercicios().catch((e) => {
      setEjercicios([]);
      setMensaje({ ok: false, texto: errorMessage(e) });
    });
    apiFetch<{ exigirCuadreBancos: boolean }>(companyPath('/cuadre-bancos/config'))
      .then((c) => setExigirCuadre(!!c.exigirCuadreBancos))
      .catch(() => setExigirCuadre(null));
  }, [listo, ver, cargarEjercicios]);

  const cargarPeriodos = useCallback(async (anio: string) => {
    if (!/^\d{4}$/.test(anio)) {
      setPeriodos(null);
      return;
    }
    setPeriodos(await apiFetch<PeriodoMes[]>(companyPath(`/periodos?ejercicio=${anio}`)));
  }, []);

  useEffect(() => {
    setPeriodos(null);
    if (!anioSel) return;
    cargarPeriodos(anioSel).catch((e) => setMensaje({ ok: false, texto: errorMessage(e) }));
  }, [anioSel, cargarPeriodos]);

  const anioActual = new Date().getFullYear();
  // Años que se pueden crear: de 1990 al que viene, sin los que ya existen.
  const aniosLibres = useMemo(() => {
    const usados = new Set((ejercicios ?? []).map((e) => e.label));
    const r: string[] = [];
    for (let a = anioActual + 1; a >= ANIO_MINIMO; a--) if (!usados.has(String(a))) r.push(String(a));
    return r;
  }, [ejercicios, anioActual]);

  // Propuesta: el siguiente al ultimo (sin pasar del que viene) o, sin ninguno, el actual.
  useEffect(() => {
    if (!ejercicios) return;
    const ultimos = ejercicios.map((e) => Number(e.label)).filter(Number.isInteger);
    const propuesto = ultimos.length ? Math.min(Math.max(...ultimos) + 1, anioActual + 1) : anioActual;
    setNuevoAnio(aniosLibres.includes(String(propuesto)) ? String(propuesto) : (aniosLibres[0] ?? ''));
  }, [ejercicios, aniosLibres, anioActual]);

  const ejercicioSel = ejercicios?.find((e) => e.label === anioSel) ?? null;
  const ejercicioCerrado = !!ejercicioSel && ejercicioSel.estadoEfectivo !== 'ABIERTO';
  // Marcado como cerrado sin regularizacion ni cierre: no hay cierre que deshacer,
  // la salida es «Reabrir» (solo el administrador) y despues cerrarlo bien.
  const cerradoSinAsientos = ejercicioSel?.estadoEfectivo === 'CERRADO_SIN_ASIENTOS';

  /**
   * Que hacer con un ejercicio cerrado sin asientos. El servidor dice si se
   * puede reabrir (puedeReabrir) y, si no, por que (motivoNoReabrir): un año
   * sin asientos o con un ejercicio posterior ya cerrado se queda cerrado.
   */
  const queHacerSinAsientos = (e: EjercicioConfig, dondeBoton: string): string => {
    if (e.puedeReabrir !== true) {
      return e.motivoNoReabrir || 'Ahora mismo no se puede reabrir.';
    }
    return reabrirPermitido
      ? `Pulsa «Reabrir»${dondeBoton} y después ciérralo en Cierre y traspaso de saldos.`
      : 'Pide al administrador de la empresa que lo reabra para cerrarlo bien.';
  };

  const crear = async () => {
    if (!nuevoAnio) return;
    setOcupado('crear');
    setMensaje(null);
    try {
      await apiFetch(companyPath('/fiscal-years'), { method: 'POST', body: JSON.stringify({ anio: Number(nuevoAnio) }) });
      await cargarEjercicios(nuevoAnio);
      setMensaje({ ok: true, texto: `Ejercicio ${nuevoAnio} creado: va del 1 de enero al 31 de diciembre.` });
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado('');
    }
  };

  const hacerReabrir = async () => {
    if (!reabrir) return;
    setOcupado('reabrir');
    setMensaje(null);
    try {
      await apiFetch(companyPath(`/fiscal-years/${encodeURIComponent(reabrir.id)}/reabrir`), { method: 'POST', body: '{}' });
      await cargarEjercicios(reabrir.label);
      await cargarPeriodos(reabrir.label);
      setMensaje({
        ok: true,
        texto: (
          <>
            Ejercicio {reabrir.label} reabierto. Sus meses quedan bloqueados: si tienes que ajustar algo, desbloquea solo ese mes aquí abajo. Para
            cerrarlo bien (regularización, cierre y apertura del siguiente), ve a{' '}
            <Link href={enlaceCierre(reabrir.label)} className="font-medium underline">
              Cierre y traspaso de saldos
            </Link>
            .
          </>
        ),
      });
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setReabrir(null);
      setOcupado('');
    }
  };

  const cambiarMes = async (mes: number, estado: 'abierto' | 'bloqueado', confirmar = false) => {
    setOcupado(`mes-${mes}`);
    setMensaje(null);
    try {
      const r = await apiFetch<PeriodoMes & { aviso?: string; modelosPresentados?: string[]; avisoAmortizacion?: string }>(
        companyPath(`/periodos/${mes}/estado?ejercicio=${anioSel}`),
        { method: 'PUT', body: JSON.stringify(confirmar ? { estado, confirmar: true } : { estado }) },
      );
      await cargarPeriodos(anioSel);
      const nombre = `${MESES[mes - 1].toLowerCase()} de ${anioSel}`;
      setMensaje({
        ok: true,
        texto:
          estado === 'bloqueado'
            ? r.avisoAmortizacion
              ? (
                  // El bloqueo se hace igual; solo se avisa de la amortización que falta por apuntar.
                  <>
                    Mes de {nombre} bloqueado. Ojo: {r.avisoAmortizacion}{' '}
                    <Link href="/dashboard/contabilidad/inmovilizado" className="font-medium underline">
                      Ir a Inmovilizado
                    </Link>
                  </>
                )
              : `Mes de ${nombre} bloqueado: ya no se pueden registrar facturas, cobros, pagos ni asientos con esa fecha.`
            : r.aviso === 'modelo_presentado'
              ? (r.modelosPresentados?.length ?? 0) > 1
                ? `Mes de ${nombre} desbloqueado. Ojo: ${enumerar(r.modelosPresentados ?? [], 'el ')} ya están presentados; si cambias algo, puede que tengas que presentar complementarias.`
                : `Mes de ${nombre} desbloqueado. Ojo: ${enumerar(r.modelosPresentados ?? [], 'el ')} ya está presentado; si cambias algo, puede que tengas que presentar una complementaria.`
              : `Mes de ${nombre} desbloqueado.`,
      });
      setConfirmarMes(null);
    } catch (e) {
      const d = detalles(e);
      if (e instanceof ApiError && e.status === 409 && d.aviso === 'modelo_presentado') {
        // Hay modelos presentados de ese mes: se pregunta antes de desbloquear.
        setConfirmarMes({ mes, modelos: Array.isArray(d.modelosPresentados) ? d.modelosPresentados.map(String) : [] });
      } else {
        setConfirmarMes(null);
        const enlace = typeof d.enlace === 'string' ? d.enlace : null;
        setMensaje({
          ok: false,
          texto: (
            <>
              {errorMessage(e)}
              {enlace && (
                <>
                  {' '}
                  <Link href={enlace} className="font-medium underline">
                    {enlace.includes('/arranque') ? 'Ir a Traer la contabilidad de 2026' : 'Ir a Cierre y traspaso de saldos'}
                  </Link>
                </>
              )}
            </>
          ),
        });
      }
    } finally {
      setOcupado('');
    }
  };

  const cambiarCuadre = async (valor: boolean) => {
    setOcupado('cuadre');
    setMensaje(null);
    try {
      const c = await apiFetch<{ exigirCuadreBancos: boolean }>(companyPath('/cuadre-bancos/config'), {
        method: 'PUT',
        body: JSON.stringify({ exigirCuadreBancos: valor }),
      });
      setExigirCuadre(!!c.exigirCuadreBancos);
      setMensaje({
        ok: true,
        texto: c.exigirCuadreBancos
          ? 'A partir de ahora, para cerrar un ejercicio los bancos tienen que cuadrar con la contabilidad.'
          : 'Ya no se exige que cuadren los bancos para cerrar un ejercicio.',
      });
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado('');
    }
  };

  if (!listo) return null;

  return (
    <>
      <CabeceraBloque
        icono={CalendarCheck}
        titulo="Ejercicios y periodos"
        descripcion="Los años contables de la empresa y los meses que se pueden tocar. Un mes bloqueado no admite facturas, cobros, pagos ni asientos con esa fecha."
      />

      {!ver ? (
        <SinAcceso texto="Para ver los ejercicios necesitas permiso de contabilidad en esta empresa." />
      ) : (
        <>
          {!editar && <AvisoSoloLectura quien={QUIEN_EDITA.ejercicios} />}
          <Mensaje mensaje={mensaje} onCerrar={() => setMensaje(null)} />

          <section aria-labelledby="lista-ejercicios" className="rounded-xl border border-slate-200 bg-white">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-4 py-3 md:px-5">
              <h2 id="lista-ejercicios" className="font-semibold text-slate-900">
                Ejercicios
              </h2>
              {editar && aniosLibres.length > 0 && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-sm text-slate-700">
                    <span className="sr-only">Año del ejercicio nuevo</span>
                    <select value={nuevoAnio} onChange={(e) => setNuevoAnio(e.target.value)} className={`${claseCampo} mt-0 w-28`}>
                      {aniosLibres.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={crear} disabled={!nuevoAnio || ocupado === 'crear'} className={claseBoton}>
                    <Plus size={16} weight="bold" /> {ocupado === 'crear' ? 'Creando…' : 'Crear ejercicio'}
                  </button>
                </div>
              )}
            </header>

            {!ejercicios ? (
              <p className="px-4 py-4 text-sm text-slate-500 md:px-5">Cargando ejercicios…</p>
            ) : ejercicios.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-600 md:px-5">
                Todavía no hay ningún ejercicio.{' '}
                {editar ? 'Elige el año y pulsa «Crear ejercicio».' : 'Pide a quien lleva la contabilidad que lo cree.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {ejercicios.map((e) => {
                  const estado = ESTADO_EJERCICIO[e.estadoEfectivo] ?? ESTADO_EJERCICIO.ABIERTO;
                  const elegido = e.label === anioSel;
                  return (
                    <li key={e.id} className={`px-4 py-3 md:px-5 ${elegido ? 'bg-emerald-50' : ''}`}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <button
                          type="button"
                          onClick={() => setAnioSel(e.label)}
                          aria-pressed={elegido}
                          className="min-w-0 text-left"
                          title="Ver sus meses"
                        >
                          <span className="block font-semibold text-slate-900">{e.label}</span>
                          <span className="block text-xs text-slate-500">
                            Del {fechaCorta(e.fechaInicio)} al {fechaCorta(e.fechaFin)}
                          </span>
                        </button>
                        <Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>
                        <div className="flex-1" />
                        {e.estadoEfectivo === 'CERRADO_SIN_ASIENTOS' && reabrirPermitido && e.puedeReabrir === true && (
                          <button type="button" onClick={() => setReabrir(e)} aria-label={`Reabrir el ejercicio ${e.label}`} className={claseBotonSecundario}>
                            <LockKeyOpen size={16} /> Reabrir
                          </button>
                        )}
                        {e.estadoEfectivo !== 'CERRADO_SIN_ASIENTOS' && (
                          <Link
                            href={enlaceCierre(e.label)}
                            aria-label={`Cerrar o deshacer el cierre de ${e.label}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
                          >
                            Cerrar o deshacer el cierre <ArrowRight size={14} />
                          </Link>
                        )}
                      </div>
                      {(e.legalizationDeadline || e.accountsDepositDeadline || e.closingDate) && (
                        <p className="mt-1 text-xs text-slate-600">
                          {e.closingDate && <>Cerrado el {fechaCorta(e.closingDate)}. </>}
                          {e.legalizationDeadline && <>Legalizar libros antes del {fechaCorta(e.legalizationDeadline)}. </>}
                          {e.accountsDepositDeadline && <>Depositar cuentas como tarde el {fechaCorta(e.accountsDepositDeadline)}.</>}
                        </p>
                      )}
                      {e.estadoEfectivo === 'CERRADO_SIN_ASIENTOS' && (
                        <p className="mt-1 text-xs text-amber-800">
                          Se marcó como cerrado sin hacer la regularización ni el cierre. {queHacerSinAsientos(e, '')}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {ejercicioSel && (
            <section aria-labelledby="meses" className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <h2 id="meses" className="font-semibold text-slate-900">
                Meses de {ejercicioSel.label}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Bloquea un mes cuando lo des por terminado (por ejemplo, después de presentar el IVA). El estado «Cerrado» lo pone el cierre del ejercicio.
              </p>
              {cerradoSinAsientos ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  El ejercicio se marcó como cerrado sin hacer el cierre, así que sus meses no se pueden tocar.{' '}
                  {ejercicioSel && queHacerSinAsientos(ejercicioSel, ' en la lista de arriba')}
                </p>
              ) : (
                ejercicioCerrado && (
                  <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    El ejercicio está cerrado: sus meses no se pueden tocar. Para volver a tocarlo, deshaz el cierre en{' '}
                    <Link href={enlaceCierre(ejercicioSel.label)} className="font-medium text-emerald-700 underline">
                      Cierre y traspaso de saldos
                    </Link>
                    .
                  </p>
                )
              )}
              {!periodos ? (
                <p className="mt-3 text-sm text-slate-500">Cargando meses…</p>
              ) : (
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {periodos.map((p) => {
                    const presentados = p.modelosPresentados ?? [];
                    // En un ejercicio cerrado ningun mes admite cambios, aunque conste abierto.
                    const textoEstado = ejercicioCerrado
                      ? p.estado === 'cerrado'
                        ? 'Cerrado'
                        : 'Cerrado con el ejercicio'
                      : p.estado === 'abierto'
                        ? 'Abierto'
                        : p.estado === 'bloqueado'
                          ? 'Bloqueado'
                          : 'Cerrado';
                    return (
                      <li key={p.mes} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        {ejercicioCerrado ? (
                          <LockKey size={18} className="shrink-0 text-slate-500" aria-hidden />
                        ) : p.estado === 'abierto' ? (
                          <LockKeyOpen size={18} className="shrink-0 text-emerald-600" aria-hidden />
                        ) : (
                          <LockKey size={18} className={`shrink-0 ${p.estado === 'cerrado' ? 'text-slate-500' : 'text-amber-600'}`} aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{MESES[p.mes - 1]}</p>
                          <p className="text-xs text-slate-500">
                            {textoEstado}
                            {presentados.length > 0 && ` · ${enumerar(presentados)} ${presentados.length > 1 ? 'presentados' : 'presentado'}`}
                          </p>
                        </div>
                        {editar && p.estado === 'abierto' && !ejercicioCerrado && (
                          <button
                            type="button"
                            onClick={() => cambiarMes(p.mes, 'bloqueado')}
                            disabled={!!ocupado}
                            aria-label={`Bloquear ${MESES[p.mes - 1].toLowerCase()} de ${anioSel}`}
                            className={claseBotonSecundario}
                          >
                            {ocupado === `mes-${p.mes}` ? '…' : 'Bloquear'}
                          </button>
                        )}
                        {editar && p.estado === 'bloqueado' && !ejercicioCerrado && (
                          <button
                            type="button"
                            onClick={() => cambiarMes(p.mes, 'abierto')}
                            disabled={!!ocupado}
                            aria-label={`Desbloquear ${MESES[p.mes - 1].toLowerCase()} de ${anioSel}`}
                            className={claseBotonSecundario}
                          >
                            {ocupado === `mes-${p.mes}` ? '…' : 'Desbloquear'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {exigirCuadre !== null && (
            <section aria-labelledby="cuadre" className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <h2 id="cuadre" className="font-semibold text-slate-900">
                Antes de cerrar un ejercicio
              </h2>
              <label className="mt-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={exigirCuadre}
                  disabled={!editar || ocupado === 'cuadre'}
                  onChange={(e) => cambiarCuadre(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900">Exigir que cuadren los bancos</span>
                  <span className="block text-slate-600">
                    El cierre no se deja hacer si el saldo de alguna cuenta bancaria no coincide con su cuenta 572 de la contabilidad.
                  </span>
                </span>
              </label>
            </section>
          )}
        </>
      )}

      <ConfirmationModal
        isOpen={!!reabrir}
        title={`Reabrir el ejercicio ${reabrir?.label ?? ''}`}
        message="Se marcó como cerrado sin hacer la regularización ni el cierre. Al reabrirlo, sus doce meses quedan bloqueados para que nada se apunte en él por error: si tienes que ajustar algo, desbloquea solo ese mes. Se borran los plazos de legalización y depósito; los libros ya generados no se tocan. Después, ciérralo en Cierre y traspaso de saldos."
        confirmLabel="Reabrir"
        isLoading={ocupado === 'reabrir'}
        onConfirm={hacerReabrir}
        onCancel={() => setReabrir(null)}
      />

      <ConfirmationModal
        isOpen={!!confirmarMes}
        title={`Desbloquear ${confirmarMes ? MESES[confirmarMes.mes - 1].toLowerCase() : ''} de ${anioSel}`}
        message="Hay modelos de este mes ya presentados a Hacienda. Si cambias facturas o asientos de ese periodo, puede que tengas que presentar una declaración complementaria."
        details={
          confirmarMes?.modelos.length ? (
            <p>
              {confirmarMes.modelos.length > 1 ? 'Presentados' : 'Presentado'}: {enumerar(confirmarMes.modelos)}
            </p>
          ) : undefined
        }
        confirmLabel="Desbloquear igualmente"
        isDangerous
        isLoading={!!confirmarMes && ocupado === `mes-${confirmarMes.mes}`}
        onConfirm={() => confirmarMes && cambiarMes(confirmarMes.mes, 'abierto', true)}
        onCancel={() => setConfirmarMes(null)}
      />
    </>
  );
}
