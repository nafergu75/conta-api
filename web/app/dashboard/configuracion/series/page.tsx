'use client';

import { useCallback, useEffect, useState } from 'react';
import { ListNumbers, PencilSimple, Plus, Star } from '@phosphor-icons/react';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { servidorConRectificativasNuevas } from '@/lib/rectificativasVenta';
import { claseBoton, claseBotonSecundario, claseCampo, puedeEditar, puedeVer, QUIEN_EDITA, type SerieConfig } from '@/lib/configuracion';
import { AvisoSoloLectura, CabeceraBloque, Etiqueta, Mensaje, SinAcceso, type MensajeConfig } from '../componentes';
import { useConfiguracion } from '../contexto';

/**
 * Series de numeracion de facturas, rectificativas, rectificativas de tickets
 * (RECTIFICATIVA_SIMPLIFICADA, R5) y proformas: crear, cambiar
 * la descripcion, activar o desactivar, marcar la predeterminada y fijar el
 * numero inicial (solo sin documentos). Sin borrar: una serie se desactiva.
 * Ver: ventas:read o contabilidad:read; cambiar: ventas:write.
 */

const TIPOS: Array<{ tipo: string; titulo: string; ayuda: string }> = [
  { tipo: 'FACTURA', titulo: 'Facturas', ayuda: 'Las facturas nuevas usan la predeterminada.' },
  { tipo: 'RECTIFICATIVA', titulo: 'Rectificativas', ayuda: 'Para corregir o anular facturas ya emitidas.' },
  {
    tipo: 'RECTIFICATIVA_SIMPLIFICADA',
    titulo: 'Rectificativas de tickets',
    ayuda: 'Para corregir tickets y facturas simplificadas: la ley pide una serie distinta de la de rectificativas.',
  },
  { tipo: 'PROFORMA', titulo: 'Proformas', ayuda: 'Presupuestos con forma de factura: no cuentan para nada fiscal.' },
];

const CODIGO_RE = /^[A-Z0-9-]{1,10}$/;
const NUMERO_MAX = 999_999_999;

type Errores = Partial<Record<'codigo' | 'descripcion' | 'tipoDocumento' | 'numeroInicial' | 'activa' | 'porDefecto', string>>;

/** Numero inicial escrito a mano: entero de 1 a 999.999.999, o null si esta vacio. */
function leerNumero(texto: string): number | null | 'mal' {
  const t = texto.trim().replace(/\./g, '');
  if (!t) return null;
  if (!/^\d+$/.test(t)) return 'mal';
  const n = Number(t);
  return n >= 1 && n <= NUMERO_MAX ? n : 'mal';
}

export default function SeriesPage() {
  const { user, listo } = useConfiguracion();
  const ver = puedeVer(user, 'series');
  const editar = puedeEditar(user, 'series');

  const [series, setSeries] = useState<SerieConfig[] | null>(null);
  const [mensaje, setMensaje] = useState<MensajeConfig>(null);
  const [ocupado, setOcupado] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setSeries(await apiFetch<SerieConfig[]>(companyPath('/series')));
  }, []);

  useEffect(() => {
    if (!listo || !ver) return;
    cargar().catch((e) => {
      setSeries([]);
      setMensaje({ ok: false, texto: errorMessage(e) });
    });
  }, [listo, ver, cargar]);

  // Rectificativas de tickets: el servidor anterior a las rectificativas nuevas no conoce ese tipo
  // (daría error al crear la serie). Sin ninguna serie de ese tipo, la sección solo sale si el servidor lo admite.
  const hayDeTickets = !!series?.some((s) => s.tipoDocumento === 'RECTIFICATIVA_SIMPLIFICADA');
  const [ticketsAdmitidos, setTicketsAdmitidos] = useState<boolean | null>(null);
  useEffect(() => {
    if (!listo || !ver || hayDeTickets || ticketsAdmitidos !== null) return;
    let vivo = true;
    servidorConRectificativasNuevas().then((si) => vivo && setTicketsAdmitidos(si));
    return () => {
      vivo = false;
    };
  }, [listo, ver, hayDeTickets, ticketsAdmitidos]);
  const tipos = TIPOS.filter((t) => t.tipo !== 'RECTIFICATIVA_SIMPLIFICADA' || hayDeTickets || ticketsAdmitidos === true);

  /** Cambio rapido (activar, desactivar, predeterminada): 409 con la regla que lo impide. */
  const cambioRapido = async (s: SerieConfig, cambio: { activa?: boolean; porDefecto?: boolean }, ok: string) => {
    setOcupado(s.id);
    setMensaje(null);
    try {
      await apiFetch(companyPath(`/series/${encodeURIComponent(s.id)}`), { method: 'PUT', body: JSON.stringify(cambio) });
      await cargar();
      setMensaje({ ok: true, texto: ok });
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
        icono={ListNumbers}
        titulo="Series de numeración"
        descripcion="Cada serie numera sus documentos seguidos: A-1, A-2, A-3… Una serie no se borra: si ya no la usas, desactívala."
      />

      {!ver ? (
        <SinAcceso texto="Para ver las series necesitas permiso de ventas o de contabilidad en esta empresa." />
      ) : (
        <>
          {!editar && <AvisoSoloLectura quien={QUIEN_EDITA.series} />}
          <Mensaje mensaje={mensaje} onCerrar={() => setMensaje(null)} />

          {!series ? (
            <p className="text-sm text-slate-500">Cargando series…</p>
          ) : (
            tipos.map(({ tipo, titulo, ayuda }) => {
              const delTipo = series.filter((s) => s.tipoDocumento === tipo);
              return (
                <section key={tipo} aria-labelledby={`tipo-${tipo}`} className="rounded-xl border border-slate-200 bg-white">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 md:px-5">
                    <div>
                      <h2 id={`tipo-${tipo}`} className="font-semibold text-slate-900">
                        {titulo}
                      </h2>
                      <p className="text-xs text-slate-500">{ayuda}</p>
                    </div>
                    {editar && creando !== tipo && (
                      <button type="button" onClick={() => setCreando(tipo)} className={claseBotonSecundario}>
                        <Plus size={16} /> Nueva serie
                      </button>
                    )}
                  </header>

                  {creando === tipo && (
                    <FormularioSerie
                      tipo={tipo}
                      onCancelar={() => setCreando(null)}
                      onGuardada={async (codigo) => {
                        setCreando(null);
                        await cargar();
                        setMensaje({ ok: true, texto: `Serie ${codigo} creada.` });
                      }}
                    />
                  )}

                  {delTipo.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-slate-600 md:px-5">
                      {tipo === 'RECTIFICATIVA_SIMPLIFICADA'
                        ? `Todavía no hay ninguna. La primera vez que rectifiques un ticket se crea sola la serie ${series.some((s) => s.codigo === 'RT') ? 'RTK' : 'RT'}.`
                        : 'No hay ninguna serie de este tipo.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {delTipo.map((s) =>
                        editando === s.id ? (
                          <li key={s.id}>
                            <FormularioSerie
                              tipo={tipo}
                              serie={s}
                              onCancelar={() => setEditando(null)}
                              onGuardada={async () => {
                                setEditando(null);
                                await cargar();
                                setMensaje({ ok: true, texto: `Serie ${s.codigo} guardada.` });
                              }}
                            />
                          </li>
                        ) : (
                          <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center md:px-5">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-slate-900">{s.codigo}</span>
                                <span className="truncate text-sm text-slate-700">{s.descripcion}</span>
                                {s.activa ? <Etiqueta tono="verde">Activa</Etiqueta> : <Etiqueta tono="gris">Desactivada</Etiqueta>}
                                {s.porDefecto && (
                                  <Etiqueta tono="azul">
                                    <Star size={12} weight="fill" className="mr-1" /> Predeterminada
                                  </Etiqueta>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Próximo número: <span className="font-mono">{s.codigo}-{s.numeroSiguiente}</span> ·{' '}
                                {s.documentos === 0 ? 'Sin documentos' : `${s.documentos} ${s.documentos === 1 ? 'documento' : 'documentos'}`}
                              </p>
                            </div>
                            {editar && (
                              <div className="flex flex-wrap gap-2">
                                {s.activa && !s.porDefecto && (
                                  <button
                                    type="button"
                                    disabled={!!ocupado}
                                    onClick={() => cambioRapido(s, { porDefecto: true }, `La serie ${s.codigo} es ahora la predeterminada.`)}
                                    aria-label={`Marcar la serie ${s.codigo} como predeterminada`}
                                    className={claseBotonSecundario}
                                  >
                                    <Star size={16} /> Predeterminada
                                  </button>
                                )}
                                {!s.porDefecto && (
                                  <button
                                    type="button"
                                    disabled={!!ocupado}
                                    onClick={() =>
                                      cambioRapido(s, { activa: !s.activa }, s.activa ? `Serie ${s.codigo} desactivada.` : `Serie ${s.codigo} activada.`)
                                    }
                                    aria-label={`${s.activa ? 'Desactivar' : 'Activar'} la serie ${s.codigo}`}
                                    className={claseBotonSecundario}
                                  >
                                    {s.activa ? 'Desactivar' : 'Activar'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={!!ocupado}
                                  onClick={() => setEditando(s.id)}
                                  aria-label={`Editar la serie ${s.codigo}`}
                                  className={claseBotonSecundario}
                                >
                                  <PencilSimple size={16} /> Editar
                                </button>
                              </div>
                            )}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                  {tipo === 'FACTURA' || tipo === 'RECTIFICATIVA' ? (
                    <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 md:px-5">
                      Siempre tiene que quedar al menos una serie activa y una predeterminada. Para desactivar la predeterminada, marca antes otra.
                    </p>
                  ) : null}
                </section>
              );
            })
          )}
        </>
      )}
    </>
  );
}

/** Alta (sin `serie`) o edicion de una serie. */
function FormularioSerie({
  tipo,
  serie,
  onCancelar,
  onGuardada,
}: {
  tipo: string;
  serie?: SerieConfig;
  onCancelar: () => void;
  onGuardada: (codigo: string) => void | Promise<void>;
}) {
  const nueva = !serie;
  const [codigo, setCodigo] = useState(serie?.codigo ?? '');
  const [descripcion, setDescripcion] = useState(serie?.descripcion ?? '');
  const [numero, setNumero] = useState(serie ? String(serie.numeroSiguiente) : '');
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const numeroEditable = nueva || serie.documentos === 0;
  const id = serie?.id ?? `nueva-${tipo}`;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Errores = {};
    const cod = codigo.trim().toUpperCase();
    if (nueva && !CODIGO_RE.test(cod)) err.codigo = 'De 1 a 10 caracteres: letras sin acentos ni ñ, números o guiones (por ejemplo, B o 2026-A).';
    if (descripcion.trim().length > 191) err.descripcion = 'Como máximo 191 caracteres.';
    const n = leerNumero(numero);
    if (n === 'mal') err.numeroInicial = `Escribe un número entero entre 1 y ${NUMERO_MAX.toLocaleString('es-ES')}.`;
    setErrores(err);
    setError('');
    if (Object.keys(err).length) return;

    const cuerpo: Record<string, unknown> = { descripcion: descripcion.trim() };
    if (nueva) {
      cuerpo.codigo = cod;
      cuerpo.tipoDocumento = tipo;
      if (n !== null) cuerpo.numeroInicial = n;
    } else if (numeroEditable && n !== null && n !== serie.numeroSiguiente) {
      cuerpo.numeroInicial = n;
    }
    setGuardando(true);
    try {
      await apiFetch(companyPath(nueva ? '/series' : `/series/${encodeURIComponent(serie.id)}`), {
        method: nueva ? 'POST' : 'PUT',
        body: JSON.stringify(cuerpo),
      });
      await onGuardada(nueva ? cod : serie.codigo);
    } catch (ex) {
      const campo = campoDelError(ex) as keyof Errores | undefined;
      if (campo && ['codigo', 'descripcion', 'numeroInicial'].includes(campo)) setErrores({ [campo]: errorMessage(ex) });
      else setError(errorMessage(ex));
    } finally {
      setGuardando(false);
    }
  };

  const ayudaError = (campo: keyof Errores) =>
    errores[campo] ? (
      <p id={`${id}-${campo}-error`} className="mt-1 text-xs text-red-700">
        {errores[campo]}
      </p>
    ) : null;

  return (
    <form onSubmit={guardar} className="space-y-3 border-b border-slate-100 bg-slate-50 px-4 py-4 md:px-5" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_10rem]">
        <div>
          <label htmlFor={`${id}-codigo`} className="block text-sm font-medium text-slate-700">
            Código
          </label>
          <input
            id={`${id}-codigo`}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            disabled={!nueva || guardando}
            maxLength={10}
            autoComplete="off"
            aria-invalid={errores.codigo ? true : undefined}
            aria-describedby={errores.codigo ? `${id}-codigo-error` : undefined}
            className={`${claseCampo} font-mono`}
          />
          {ayudaError('codigo')}
        </div>
        <div>
          <label htmlFor={`${id}-descripcion`} className="block text-sm font-medium text-slate-700">
            Descripción
          </label>
          <input
            id={`${id}-descripcion`}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            disabled={guardando}
            maxLength={191}
            placeholder="Por ejemplo: Tienda online"
            aria-invalid={errores.descripcion ? true : undefined}
            aria-describedby={errores.descripcion ? `${id}-descripcion-error` : undefined}
            className={claseCampo}
          />
          {ayudaError('descripcion')}
        </div>
        <div>
          <label htmlFor={`${id}-numero`} className="block text-sm font-medium text-slate-700">
            {nueva ? 'Número inicial' : 'Próximo número'}
          </label>
          <input
            id={`${id}-numero`}
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            disabled={!numeroEditable || guardando}
            inputMode="numeric"
            placeholder="1"
            aria-invalid={errores.numeroInicial ? true : undefined}
            aria-describedby={`${id}-numero-ayuda${errores.numeroInicial ? ` ${id}-numeroInicial-error` : ''}`}
            className={`${claseCampo} font-mono`}
          />
          {ayudaError('numeroInicial')}
        </div>
      </div>
      <p id={`${id}-numero-ayuda`} className="text-xs text-slate-600">
        {numeroEditable
          ? 'El número inicial sirve para seguir la numeración que traías de otro programa. Cuando emitas el primer documento de la serie ya no se podrá cambiar.'
          : 'Esta serie ya tiene documentos: su numeración sigue desde el último y no se puede cambiar.'}
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={guardando} className={claseBotonSecundario}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className={claseBoton}>
          {guardando ? 'Guardando…' : nueva ? 'Crear serie' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
