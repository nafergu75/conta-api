'use client';

import { useCallback, useEffect, useState } from 'react';
import { MagnifyingGlass, PencilSimple, Plus, Trash, UserMinus } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  pagina,
  Alerta,
  aNumero,
  boton,
  botonPeligro,
  botonSecundario,
  CabeceraNominas,
  campo,
  etiqueta,
  fechaEs,
  hoyIso,
  Modal,
  num,
  permisosNominas,
  SinPermiso,
  TIPOS_CONTRATO,
  type Empleado,
} from '../comun';

/**
 * Trabajadores de la empresa para las nominas: alta, edicion, baja y borrado
 * (solo si no tienen nominas). Los nuevos del Excel de la gestoria se dan de
 * alta solos al importar; aqui se completan sus datos (sobre todo para el 190).
 */

const textoContrato = (t: string) => TIPOS_CONTRATO.find(([k]) => k === t)?.[1] ?? t;

export default function EmpleadosPage() {
  const { leer, escribir } = permisosNominas();
  const [items, setItems] = useState<Empleado[]>([]);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [verBajas, setVerBajas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState<Empleado | 'nuevo' | null>(null);
  const [baja, setBaja] = useState<Empleado | null>(null);
  const [borrar, setBorrar] = useState<Empleado | null>(null);

  const cargar = useCallback(async () => {
    const p = new URLSearchParams();
    if (busqueda) p.set('q', busqueda);
    if (!verBajas) p.set('activos', 'true');
    try {
      setItems(await apiFetch<Empleado[]>(companyPath(`/empleados?${p}`)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, [busqueda, verBajas]);

  useEffect(() => {
    if (leer) cargar();
  }, [cargar, leer]);

  const hecho = (texto: string) => {
    setEditando(null);
    setBaja(null);
    setBorrar(null);
    setError('');
    setAviso(texto);
    cargar();
  };

  const reactivar = async (e: Empleado) => {
    setError('');
    try {
      await apiFetch(companyPath(`/empleados/${e.id}`), { method: 'PUT', body: JSON.stringify({ activo: true, fechaBaja: null }) });
      hecho(`${e.nombreCompleto} vuelve a estar de alta.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!leer) {
    return (
      <div className={pagina}>
        <CabeceraNominas titulo="Empleados" subtitulo="Trabajadores de la empresa." />
        <SinPermiso />
      </div>
    );
  }

  return (
    <div className={pagina}>
      <CabeceraNominas
        titulo="Empleados"
        subtitulo="Los trabajadores de la empresa. Los que llegan nuevos en el Excel de la gestoría se dan de alta solos por su NIF."
        acciones={
          escribir && (
            <button type="button" onClick={() => setEditando('nuevo')} className={boton}>
              <Plus size={16} /> Nuevo trabajador
            </button>
          )
        }
      />

      {error && <Alerta tipo="error">{error}</Alerta>}
      {aviso && <Alerta tipo="ok">{aviso}</Alerta>}

      <div className="flex flex-wrap items-end gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusqueda(q.trim());
          }}
          className="relative min-w-56 flex-1"
        >
          <label htmlFor="em-q" className={etiqueta}>
            Buscar
          </label>
          <MagnifyingGlass size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-slate-400" />
          <input id="em-q" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setBusqueda(q.trim())} placeholder="Nombre, apellidos o NIF" className={`${campo} pl-9`} />
        </form>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Ver también los de baja
        </label>
      </div>

      <div className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Trabajador</th>
              <th className="px-4 py-3 font-medium">Nº afiliación SS</th>
              <th className="px-4 py-3 font-medium">Contrato</th>
              <th className="px-4 py-3 font-medium">Alta</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">% IRPF</th>
              <th className="px-4 py-3 font-medium">Subcuenta</th>
              <th className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Cargando trabajadores...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {busqueda ? 'Ningún trabajador coincide con la búsqueda.' : 'Todavía no hay trabajadores. Dalos de alta aquí o importa el Excel de nóminas de la gestoría.'}
                </td>
              </tr>
            ) : (
              items.map((e) => (
                <tr key={e.id} className={e.activo ? '' : 'text-slate-400'}>
                  <td className="px-4 py-2">
                    <span className={`font-medium ${e.activo ? 'text-slate-900' : ''}`}>{e.nombreCompleto}</span>
                    <span className="block font-mono text-xs text-slate-500">{e.nif}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{e.naf ?? '—'}</td>
                  <td className="px-4 py-2">
                    {textoContrato(e.tipoContrato)}
                    {e.jornadaParcial && <span className="block text-xs text-slate-500">jornada parcial</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">{fechaEs(e.fechaAlta) || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {e.activo ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">De alta</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">Baja{e.fechaBaja ? ` el ${fechaEs(e.fechaBaja)}` : ''}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{e.porcentajeIrpfActual === null ? '—' : `${num.format(e.porcentajeIrpfActual)} %`}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{e.subcuenta465 ?? <span className="font-sans text-slate-400">al contabilizar</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {escribir && (
                      <span className="flex justify-end gap-1">
                        <button type="button" onClick={() => setEditando(e)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600" title="Editar" aria-label={`Editar a ${e.nombreCompleto}`}>
                          <PencilSimple size={16} />
                        </button>
                        {e.activo ? (
                          <button type="button" onClick={() => setBaja(e)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Dar de baja" aria-label={`Dar de baja a ${e.nombreCompleto}`}>
                            <UserMinus size={16} />
                          </button>
                        ) : (
                          <button type="button" onClick={() => reactivar(e)} className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-slate-100">
                            Reactivar
                          </button>
                        )}
                        <button type="button" onClick={() => setBorrar(e)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Borrar" aria-label={`Borrar a ${e.nombreCompleto}`}>
                          <Trash size={16} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editando && <EmpleadoModal empleado={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} onGuardado={hecho} />}
      {baja && <BajaModal empleado={baja} onCerrar={() => setBaja(null)} onHecho={hecho} />}
      {borrar && <BorrarModal empleado={borrar} onCerrar={() => setBorrar(null)} onHecho={hecho} onBaja={() => {
        setBaja(borrar);
        setBorrar(null);
      }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alta y edicion
// ---------------------------------------------------------------------------

const opc = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function EmpleadoModal({ empleado, onCerrar, onGuardado }: { empleado: Empleado | null; onCerrar: () => void; onGuardado: (t: string) => void }) {
  const [f, setF] = useState({
    nif: empleado?.nif ?? '',
    nombre: empleado?.nombre ?? '',
    apellidos: empleado?.apellidos ?? '',
    naf: empleado?.naf ?? '',
    fechaAlta: empleado?.fechaAlta ?? '',
    tipoContrato: empleado?.tipoContrato ?? 'INDEFINIDO',
    jornadaParcial: empleado?.jornadaParcial ?? false,
    grupoCotizacion: opc(empleado?.grupoCotizacion),
    porcentajeIrpfActual: empleado?.porcentajeIrpfActual === null || empleado?.porcentajeIrpfActual === undefined ? '' : String(empleado.porcentajeIrpfActual).replace('.', ','),
    clave190: empleado?.clave190 ?? 'A',
    subclave190: empleado?.subclave190 ?? '',
    provincia: empleado?.provincia ?? '',
    anioNacimiento: opc(empleado?.anioNacimiento),
    situacionFamiliar: opc(empleado?.situacionFamiliar),
    nifConyuge: empleado?.nifConyuge ?? '',
    discapacidad: opc(empleado?.discapacidad),
    movilidadGeografica: empleado?.movilidadGeografica ?? false,
    observaciones: empleado?.observaciones ?? '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const entero = (v: string) => (v.trim() === '' ? null : Number(v));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const pct = f.porcentajeIrpfActual.trim() === '' ? null : aNumero(f.porcentajeIrpfActual);
    if (pct !== null && !(pct >= 0 && pct <= 100)) return setError('El % de IRPF tiene que estar entre 0 y 100.');
    const cuerpo = {
      nif: f.nif.trim(),
      nombre: f.nombre.trim(),
      apellidos: f.apellidos.trim(),
      naf: f.naf.trim() || null,
      fechaAlta: f.fechaAlta || null,
      tipoContrato: f.tipoContrato,
      jornadaParcial: f.jornadaParcial,
      grupoCotizacion: entero(f.grupoCotizacion),
      porcentajeIrpfActual: pct,
      clave190: f.clave190.trim().toUpperCase() || 'A',
      subclave190: f.subclave190.trim() || null,
      provincia: f.provincia.trim() ? f.provincia.trim().padStart(2, '0') : null,
      anioNacimiento: entero(f.anioNacimiento),
      situacionFamiliar: entero(f.situacionFamiliar),
      nifConyuge: f.nifConyuge.trim() || null,
      discapacidad: entero(f.discapacidad),
      movilidadGeografica: f.movilidadGeografica,
      observaciones: f.observaciones.trim() || null,
    };
    setGuardando(true);
    try {
      const r = await apiFetch<Empleado>(companyPath(empleado ? `/empleados/${empleado.id}` : '/empleados'), { method: empleado ? 'PUT' : 'POST', body: JSON.stringify(cuerpo) });
      onGuardado(`${r.nombreCompleto} ${empleado ? 'guardado' : 'dado de alta'}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={empleado ? empleado.nombreCompleto : 'Nuevo trabajador'} onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={guardar} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label htmlFor="em-nif" className={etiqueta}>
              NIF / NIE
            </label>
            <input id="em-nif" value={f.nif} onChange={s('nif')} className={`${campo} font-mono uppercase`} required autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="em-nombre" className={etiqueta}>
              Nombre
            </label>
            <input id="em-nombre" value={f.nombre} onChange={s('nombre')} className={campo} required autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="em-apellidos" className={etiqueta}>
              Apellidos
            </label>
            <input id="em-apellidos" value={f.apellidos} onChange={s('apellidos')} className={campo} autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="em-naf" className={etiqueta}>
              Nº afiliación a la SS
            </label>
            <input id="em-naf" value={f.naf} onChange={s('naf')} inputMode="numeric" className={`${campo} font-mono`} placeholder="12 dígitos" autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="em-alta" className={etiqueta}>
              Fecha de alta
            </label>
            <input id="em-alta" type="date" value={f.fechaAlta} onChange={s('fechaAlta')} className={campo} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="em-contrato" className={etiqueta}>
              Contrato
            </label>
            <select id="em-contrato" value={f.tipoContrato} onChange={s('tipoContrato')} className={campo}>
              {TIPOS_CONTRATO.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="em-grupo" className={etiqueta}>
              Grupo de cotización
            </label>
            <select id="em-grupo" value={f.grupoCotizacion} onChange={s('grupoCotizacion')} className={campo}>
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="em-irpf" className={etiqueta}>
              % de IRPF actual
            </label>
            <input id="em-irpf" inputMode="decimal" value={f.porcentajeIrpfActual} onChange={s('porcentajeIrpfActual')} className={`${campo} text-right`} placeholder="Informativo" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 sm:pt-5">
            <input type="checkbox" checked={f.jornadaParcial} onChange={(e) => setF({ ...f, jornadaParcial: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Jornada parcial
          </label>
        </div>

        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm text-slate-700">Datos para el modelo 190</summary>
          <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-4">
            <div>
              <label htmlFor="em-clave" className={etiqueta}>
                Clave
              </label>
              <input id="em-clave" value={f.clave190} onChange={s('clave190')} maxLength={1} className={`${campo} uppercase`} />
            </div>
            <div>
              <label htmlFor="em-subclave" className={etiqueta}>
                Subclave
              </label>
              <input id="em-subclave" value={f.subclave190} onChange={s('subclave190')} maxLength={2} inputMode="numeric" className={campo} />
            </div>
            <div>
              <label htmlFor="em-prov" className={etiqueta}>
                Provincia (código)
              </label>
              <input id="em-prov" value={f.provincia} onChange={s('provincia')} maxLength={2} inputMode="numeric" className={campo} placeholder="46" />
            </div>
            <div>
              <label htmlFor="em-anio" className={etiqueta}>
                Año de nacimiento
              </label>
              <input id="em-anio" value={f.anioNacimiento} onChange={s('anioNacimiento')} maxLength={4} inputMode="numeric" className={campo} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="em-sitfam" className={etiqueta}>
                Situación familiar
              </label>
              <select id="em-sitfam" value={f.situacionFamiliar} onChange={s('situacionFamiliar')} className={campo}>
                <option value="">—</option>
                <option value="1">1 · Monoparental con hijos</option>
                <option value="2">2 · Cónyuge a cargo</option>
                <option value="3">3 · Otras situaciones</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="em-conyuge" className={etiqueta}>
                NIF del cónyuge
              </label>
              <input id="em-conyuge" value={f.nifConyuge} onChange={s('nifConyuge')} className={`${campo} font-mono uppercase`} autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="em-disc" className={etiqueta}>
                Discapacidad
              </label>
              <select id="em-disc" value={f.discapacidad} onChange={s('discapacidad')} className={campo}>
                <option value="">—</option>
                <option value="0">0 · Sin discapacidad</option>
                <option value="1">1 · Del 33 % al 65 %</option>
                <option value="2">2 · Del 33 % al 65 %, con ayuda de terceros</option>
                <option value="3">3 · Igual o superior al 65 %</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 sm:pt-5">
              <input type="checkbox" checked={f.movilidadGeografica} onChange={(e) => setF({ ...f, movilidadGeografica: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Movilidad geográfica
            </label>
            <p className="text-xs text-slate-500 sm:col-span-4">La discapacidad es un dato de salud: solo se usa para el modelo 190 y solo la ven el administrador y el contable.</p>
          </div>
        </details>

        <div>
          <label htmlFor="em-obs" className={etiqueta}>
            Observaciones
          </label>
          <textarea id="em-obs" rows={2} value={f.observaciones} onChange={s('observaciones')} className={campo} />
        </div>

        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={guardando} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={boton}>
            {guardando ? 'Guardando...' : empleado ? 'Guardar' : 'Dar de alta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BajaModal({ empleado, onCerrar, onHecho }: { empleado: Empleado; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [fecha, setFecha] = useState(hoyIso());
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const dar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      await apiFetch(companyPath(`/empleados/${empleado.id}/baja`), { method: 'POST', body: JSON.stringify({ fechaBaja: fecha }) });
      onHecho(`${empleado.nombreCompleto} dado de baja el ${fechaEs(fecha)}. Sus nóminas se conservan.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal titulo={`Dar de baja a ${empleado.nombreCompleto}`} onCerrar={onCerrar}>
      <form onSubmit={dar} className="space-y-4">
        <p className="text-sm text-slate-700">Deja de salir entre los trabajadores de alta. Sus nóminas, asientos y datos para el 190 se conservan.</p>
        <div>
          <label htmlFor="baja-fecha" className={etiqueta}>
            Fecha de baja
          </label>
          <input id="baja-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} required />
        </div>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado} className={boton}>
            {ocupado ? 'Guardando...' : 'Dar de baja'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BorrarModal({ empleado, onCerrar, onHecho, onBaja }: { empleado: Empleado; onCerrar: () => void; onHecho: (t: string) => void; onBaja: () => void }) {
  const [error, setError] = useState('');
  const [conNominas, setConNominas] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const borrar = async () => {
    setOcupado(true);
    setError('');
    try {
      await apiFetch(companyPath(`/empleados/${empleado.id}`), { method: 'DELETE' });
      onHecho(`${empleado.nombreCompleto} borrado.`);
    } catch (e) {
      setError(errorMessage(e));
      setConNominas((e as { status?: number }).status === 409);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal titulo={`Borrar a ${empleado.nombreCompleto}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">Solo se puede borrar un trabajador sin nóminas (por ejemplo, uno dado de alta por error). Si ya tiene nóminas, dale de baja.</p>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          {conNominas && empleado.activo ? (
            <button type="button" onClick={onBaja} className={boton}>
              Dar de baja
            </button>
          ) : (
            <button type="button" onClick={borrar} disabled={ocupado || conNominas} className={botonPeligro}>
              {ocupado ? 'Borrando...' : 'Borrar'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
