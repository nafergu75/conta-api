'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MagnifyingGlass, PencilSimple, Plus, X } from '@phosphor-icons/react';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import {
  sinTildes,
  type CatalogoCuentas,
  type CuentaElegible,
  type PropuestaSubcuenta,
  type SubcuentaCreada,
  type TipoCuentaLinea,
} from '@/lib/subcuentas';

/**
 * Cuenta de gasto o de ingreso de una linea de factura.
 *
 * Plegado: «Cuenta: 628 Suministros (la del tipo de gasto) · Cambiar cuenta».
 * Desplegado: buscador con las cuentas del plan de ese tipo (grupo 6 en gastos,
 * 70x en ventas) y «Crear subcuenta nueva», que propone el siguiente codigo libre
 * bajo la cuenta elegida y solo pide el nombre. La subcuenta queda en el plan
 * para las facturas siguientes. Todo sin salir de la factura.
 *
 * Debajo, aparte, «Otras cuentas (uso contable)»: descuentos, devoluciones,
 * sueldos, amortizaciones... El servidor solo las manda a quien tiene
 * Contabilidad «Modificar» y al administrador; a los demas no les sale el bloque.
 */

interface Props {
  tipo: TipoCuentaLinea;
  catalogo: CatalogoCuentas;
  /** Cuenta elegida para la linea (vacio = la de por defecto). */
  valor: string | null | undefined;
  onCambiar: (codigo: string | null) => void;
  /** La que se usa si la linea no dice otra, y por que («la del tipo de gasto»). */
  porDefecto: { codigo: string; texto: string };
  /** Numero de la linea (1, 2...), para las etiquetas. */
  linea: number;
  /** id del boton «Cambiar cuenta» (para llevar el foco tras un error). */
  id?: string;
  puedeCrear: boolean;
  /** El servidor ha rechazado esta cuenta. */
  invalido?: boolean;
  disabled?: boolean;
}

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

export function CuentaLinea({ tipo, catalogo, valor, onCambiar, porDefecto, linea, id, puedeCrear, invalido, disabled }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [q, setQ] = useState('');
  const buscador = useRef<HTMLInputElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const elegida = valor || null;
  const nombreElegida = catalogo.nombreDe(elegida ?? porDefecto.codigo);

  useEffect(() => {
    if (abierto && !creando) buscador.current?.focus();
  }, [abierto, creando]);

  // Las de uso contable (descuentos, sueldos, amortizaciones...) van aparte y solo
  // llegan a quien tiene Contabilidad «Modificar» o es administrador.
  const [cuentas, otras] = useMemo(() => {
    const t = sinTildes(q.trim());
    const filtrar = (lista: CuentaElegible[]) => (t ? lista.filter((c) => sinTildes(`${c.codigo} ${c.nombre}`).includes(t)) : lista);
    return [filtrar(catalogo.listado?.cuentas ?? []), filtrar(catalogo.listado?.otras ?? [])];
  }, [catalogo.listado, q]);
  const hayOtras = (catalogo.listado?.otras?.length ?? 0) > 0;

  // Al cerrar, el foco vuelve a «Cambiar cuenta» de esta linea (si no, se pierde en la pagina).
  const cerrar = () => {
    setAbierto(false);
    setCreando(false);
    setQ('');
    requestAnimationFrame(() => boton.current?.focus());
  };

  const elegir = (codigo: string | null) => {
    onCambiar(codigo);
    cerrar();
  };

  return (
    <div className="min-w-0 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-slate-500">{tipo === 'gasto' ? 'Cuenta de gasto:' : 'Cuenta de ingreso:'}</span>
        <span className={`min-w-0 ${invalido ? 'text-red-700' : 'text-slate-800'}`}>
          <span className="font-mono">{elegida ?? porDefecto.codigo}</span>
          {nombreElegida && <span> {nombreElegida}</span>}
          {!elegida && <span className="text-slate-500"> ({porDefecto.texto})</span>}
        </span>
        <button
          ref={boton}
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={abierto}
          aria-invalid={invalido || undefined}
          onClick={() => (abierto ? cerrar() : setAbierto(true))}
          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline disabled:opacity-50"
        >
          <PencilSimple size={14} /> {abierto ? 'Cerrar' : 'Cambiar cuenta'}
          <span className="sr-only"> de la línea {linea}</span>
        </button>
      </div>

      {abierto && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {creando ? (
            <NuevaSubcuenta
              tipo={tipo}
              catalogo={catalogo}
              madreInicial={madreDe(elegida, catalogo) ?? porDefecto.codigo}
              linea={linea}
              onCreada={(c) => {
                catalogo.anadir(c);
                elegir(c.codigo);
              }}
              onCancelar={() => setCreando(false)}
            />
          ) : (
            <>
              <label htmlFor={`cl-q-${tipo}-${linea}`} className="sr-only">
                Buscar cuenta para la línea {linea}
              </label>
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id={`cl-q-${tipo}-${linea}`}
                  ref={buscador}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cerrar();
                    // Intro no envia la factura. Solo elige si lo escrito apunta a una cuenta
                    // (el codigo exacto o la unica que coincide); con el buscador vacio no cambia nada.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const unica = cuentaDeIntro(q, [...cuentas, ...otras]);
                      if (unica) elegir(unica);
                    }
                  }}
                  placeholder={tipo === 'gasto' ? 'Código o nombre (628, luz…)' : 'Código o nombre (705, cursos…)'}
                  className={`${campo} pl-9`}
                  autoComplete="off"
                />
              </div>

              {catalogo.error ? (
                <p className="mt-2 text-red-700">No se han podido cargar las cuentas: {catalogo.error}</p>
              ) : catalogo.cargando && !catalogo.listado ? (
                <p className="mt-2 text-slate-500">Cargando cuentas…</p>
              ) : (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  <ul aria-label={`Cuentas para la línea ${linea}`}>
                    {elegida && (
                      <li>
                        <button type="button" onClick={() => elegir(null)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50">
                          <span className="w-5 shrink-0" />
                          <span className="min-w-0">
                            Volver a la de por defecto: <span className="font-mono">{porDefecto.codigo}</span>{' '}
                            <span className="text-slate-500">({porDefecto.texto})</span>
                          </span>
                        </button>
                      </li>
                    )}
                    {cuentas.length === 0 && otras.length === 0 && <li className="px-3 py-2 text-slate-500">Ninguna cuenta coincide con «{q}».</li>}
                    {cuentas.map((c) => (
                      <FilaCuenta key={c.codigo} cuenta={c} actual={c.codigo === elegida} onElegir={elegir} />
                    ))}
                  </ul>
                  {hayOtras && otras.length > 0 && (
                    <div role="group" aria-labelledby={`cl-otras-${tipo}-${linea}`} className="border-t-4 border-slate-100">
                      <p id={`cl-otras-${tipo}-${linea}`} className="px-3 pt-3 font-medium text-slate-900">
                        Otras cuentas (uso contable)
                      </p>
                      <p className="px-3 pb-2 pt-0.5 text-xs text-slate-600">{TEXTO_OTRAS[tipo]}</p>
                      <ul aria-label={`Otras cuentas (uso contable) para la línea ${linea}`}>
                        {otras.map((c) => (
                          <FilaCuenta key={c.codigo} cuenta={c} actual={c.codigo === elegida} onElegir={elegir} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {puedeCrear ? (
                  <button
                    type="button"
                    onClick={() => setCreando(true)}
                    disabled={!catalogo.listado}
                    className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline disabled:opacity-50"
                  >
                    <Plus size={14} /> Crear subcuenta nueva
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">Para crear subcuentas nuevas pide permiso al administrador.</span>
                )}
                <button type="button" onClick={cerrar} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
                  <X size={14} /> Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Cuando se usan las cuentas de uso contable de cada tipo (solo las ve quien lleva la contabilidad). */
const TEXTO_OTRAS: Record<TipoCuentaLinea, string> = {
  gasto:
    'Descuentos y devoluciones de compras, existencias, impuesto de sociedades, sueldos y Seguridad Social, amortizaciones y deterioros. Una factura normal no va a ninguna de ellas: elígelas solo para un apunte que sepas que va ahí, como un descuento o un abono del proveedor.',
  venta:
    'Devoluciones, descuentos y rappels sobre ventas. Una factura normal no va a ninguna de ellas: elígelas solo para un apunte que sepas que va ahí, como un abono o un descuento por pronto pago al cliente.',
  servicio: '',
};

function FilaCuenta({ cuenta: c, actual, onElegir }: { cuenta: CuentaElegible; actual: boolean; onElegir: (codigo: string) => void }) {
  return (
    <li>
      <button
        type="button"
        aria-current={actual || undefined}
        onClick={() => onElegir(c.codigo)}
        className={`flex w-full items-start gap-2 border-t border-slate-100 px-3 py-2 text-left hover:bg-slate-50 ${actual ? 'bg-emerald-50' : ''}`}
      >
        <span className="w-5 shrink-0 text-emerald-700">{actual && <Check size={16} />}</span>
        <span className="shrink-0 font-mono text-slate-600" style={{ paddingLeft: Math.max(0, c.codigo.length - 3) * 2 }}>
          {c.codigo}
        </span>
        <span className="min-w-0 flex-1 text-slate-800">
          {c.nombre}
          {c.propia && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">propia</span>}
        </span>
      </button>
    </li>
  );
}

/**
 * Cuenta que elige Intro en el buscador: la de codigo igual a lo escrito o, si no,
 * la unica que coincide. Con el buscador vacio o con varias coincidencias, ninguna.
 */
function cuentaDeIntro(q: string, cuentas: Array<{ codigo: string }>): string | null {
  const t = q.trim();
  if (!t) return null;
  const exacta = cuentas.find((c) => c.codigo === t);
  if (exacta) return exacta.codigo;
  return cuentas.length === 1 ? cuentas[0].codigo : null;
}

/** Cuenta madre de la elegida (62800001 -> 628), si esta en el catalogo. */
function madreDe(codigo: string | null, catalogo: CatalogoCuentas): string | null {
  if (!codigo) return null;
  const c = [...(catalogo.listado?.cuentas ?? []), ...(catalogo.listado?.otras ?? [])].find((x) => x.codigo === codigo);
  if (!c) return null;
  return c.madre && c.madre.length >= 3 ? c.madre : c.codigo;
}

function NuevaSubcuenta({
  tipo,
  catalogo,
  madreInicial,
  linea,
  onCreada,
  onCancelar,
}: {
  tipo: TipoCuentaLinea;
  catalogo: CatalogoCuentas;
  madreInicial: string;
  linea: number;
  onCreada: (c: SubcuentaCreada) => void;
  onCancelar: () => void;
}) {
  const longitud = catalogo.listado?.longitud ?? 8;
  // Cuentas de las que puede colgar una subcuenta: las mas cortas que la longitud de la empresa.
  const madres = useMemo(() => (catalogo.listado?.cuentas ?? []).filter((c) => c.codigo.length < longitud), [catalogo.listado, longitud]);
  const [madre, setMadre] = useState(madres.some((m) => m.codigo === madreInicial) ? madreInicial : (madres[0]?.codigo ?? madreInicial));
  const [propuesta, setPropuesta] = useState<PropuestaSubcuenta | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [campoMal, setCampoMal] = useState<string | undefined>();
  const [guardando, setGuardando] = useState(false);
  const nombreRef = useRef<HTMLInputElement>(null);
  const codigoRef = useRef<HTMLInputElement>(null);
  const madreRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    nombreRef.current?.focus();
  }, []);

  // Siguiente codigo libre bajo la madre elegida.
  useEffect(() => {
    let vigente = true;
    setPropuesta(null);
    setError('');
    apiFetch<PropuestaSubcuenta>(companyPath(`/cuentas-linea/siguiente?tipo=${tipo}&madre=${encodeURIComponent(madre)}`))
      .then((p) => {
        if (!vigente) return;
        setPropuesta(p);
        setCodigo(p.codigo);
      })
      .catch((e) => {
        if (!vigente) return;
        setCodigo('');
        setError(errorMessage(e));
        setCampoMal('madre');
      });
    return () => {
      vigente = false;
    };
  }, [tipo, madre]);

  const crear = async () => {
    setError('');
    setCampoMal(undefined);
    if (!nombre.trim()) {
      setError('Escribe el nombre de la subcuenta (por ejemplo, «Luz de la oficina»).');
      setCampoMal('nombre');
      nombreRef.current?.focus();
      return;
    }
    setGuardando(true);
    try {
      // Si el codigo es el propuesto, no se manda: el servidor da el siguiente libre aunque otro se adelante.
      const cuerpo = { tipo, madre, nombre: nombre.trim(), ...(codigo && codigo !== propuesta?.codigo ? { codigo } : {}) };
      onCreada(await apiFetch<SubcuentaCreada>(companyPath('/cuentas-linea'), { method: 'POST', body: JSON.stringify(cuerpo) }));
    } catch (e) {
      setError(errorMessage(e));
      const mal = campoDelError(e);
      setCampoMal(mal);
      // El foco va al campo que hay que corregir (p. ej. el codigo repetido).
      const destino = mal === 'codigo' ? codigoRef.current : mal === 'madre' ? madreRef.current : mal === 'nombre' ? nombreRef.current : null;
      destino?.focus();
    } finally {
      setGuardando(false);
    }
  };

  const ids = `cl-nueva-${tipo}-${linea}`;
  return (
    <div className="space-y-3" role="group" aria-label={`Crear subcuenta nueva para la línea ${linea}`}>
      <p className="font-medium text-slate-900">Crear subcuenta nueva</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${ids}-madre`} className="mb-1 block text-xs font-medium text-slate-600">
            Cuelga de
          </label>
          <select ref={madreRef} id={`${ids}-madre`} value={madre} onChange={(e) => setMadre(e.target.value)} aria-invalid={campoMal === 'madre'} className={campo}>
            {madres.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo} {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-codigo`} className="mb-1 block text-xs font-medium text-slate-600">
            Código
          </label>
          <input
            id={`${ids}-codigo`}
            ref={codigoRef}
            inputMode="numeric"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            placeholder={propuesta ? propuesta.codigo : 'Calculando…'}
            aria-invalid={campoMal === 'codigo'}
            className={`${campo} font-mono`}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-nombre`} className="mb-1 block text-xs font-medium text-slate-600">
            Nombre
          </label>
          <input
            id={`${ids}-nombre`}
            ref={nombreRef}
            value={nombre}
            maxLength={190}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                crear();
              }
            }}
            placeholder={tipo === 'gasto' ? 'Luz de la oficina' : 'Cursos de formación'}
            aria-invalid={campoMal === 'nombre'}
            className={campo}
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Te proponemos el siguiente código libre ({longitud} dígitos). La subcuenta queda en tu plan contable para las próximas facturas.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={guardando} className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50">
          Volver a la lista
        </button>
        <button
          type="button"
          onClick={crear}
          disabled={guardando || !codigo}
          className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {guardando ? 'Creando…' : 'Crear y usar en esta línea'}
        </button>
      </div>
    </div>
  );
}
