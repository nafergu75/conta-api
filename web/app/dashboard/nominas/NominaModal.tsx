'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  Alerta,
  aNumero,
  boton,
  botonSecundario,
  campo,
  cuadreLocal,
  etiqueta,
  eur,
  mesCapital,
  MESES,
  Modal,
  TIPOS_NOMINA,
  type Empleado,
  type Importes,
  type Nomina,
} from './comun';

/**
 * Alta o edicion a mano de una nomina (la gestoria la calcula; aqui se copian
 * sus importes). El cuadre se ve mientras se escribe, igual que lo comprueba
 * el servidor: devengado menos deducciones tiene que dar el liquido.
 */

type CampoImporte = Exclude<keyof Importes, 'ingresoACuentaRepercutido'>;

const PRINCIPALES: Array<[CampoImporte, string, string?]> = [
  ['brutoDinerario', 'Bruto dinerario', 'Devengos en dinero sujetos a retención'],
  ['ssTrabajador', 'SS del trabajador'],
  ['irpf', 'Retención de IRPF'],
  ['liquido', 'Líquido a percibir'],
  ['ssEmpresa', 'SS a cargo de la empresa'],
];

const OTROS: Array<[CampoImporte, string, string?]> = [
  ['dietasExentas', 'Dietas exentas'],
  ['especieValoracion', 'Retribución en especie', 'Valoración (seguro médico, coche...)'],
  ['ingresoACuenta', 'Ingreso a cuenta de la especie'],
  ['indemnizacionExenta', 'Indemnización exenta'],
  ['indemnizacionSujeta', 'Indemnización sujeta'],
  ['anticipos', 'Anticipos descontados'],
  ['embargos', 'Embargos'],
  ['otrasDeducciones', 'Otras deducciones', 'Cuota sindical, préstamos...'],
];

const TODOS: CampoImporte[] = [...PRINCIPALES, ...OTROS].map(([k]) => k);

const texto = (v: number | null | undefined) => (v ? String(v).replace('.', ',') : '');

export function NominaModal({
  nomina,
  ejercicio,
  mes,
  onCerrar,
  onGuardado,
}: {
  /** null = nomina nueva del mes indicado. */
  nomina: Nomina | null;
  ejercicio: number;
  mes: number;
  onCerrar: () => void;
  onGuardado: (mensaje: string, avisos: string[]) => void;
}) {
  const [empleados, setEmpleados] = useState<Empleado[] | null>(null);
  const [empleadoId, setEmpleadoId] = useState(nomina?.empleadoId ?? '');
  const [periodo, setPeriodo] = useState({ ejercicio: nomina?.ejercicio ?? ejercicio, mes: nomina?.mes ?? mes });
  const [tipo, setTipo] = useState(nomina?.tipo ?? 'ORDINARIA');
  // Atrasos de otro año: el ejercicio al que corresponden (el 190 los declara aparte).
  const [ejercicioDevengo, setEjercicioDevengo] = useState(nomina?.ejercicioDevengo ? String(nomina.ejercicioDevengo) : '');
  // Fecha de pago: vacia = el ultimo dia del mes (la pone el servidor).
  const [fechaPago, setFechaPago] = useState(nomina && nomina.fechaPago !== nomina.fechaDevengo ? nomina.fechaPago : '');
  const [importes, setImportes] = useState<Record<CampoImporte, string>>(
    () => Object.fromEntries(TODOS.map((k) => [k, texto(nomina?.[k])])) as Record<CampoImporte, string>,
  );
  const [repercutido, setRepercutido] = useState(nomina?.ingresoACuentaRepercutido ?? false);
  const [porcentaje, setPorcentaje] = useState(texto(nomina?.porcentajeIrpf));
  const [observaciones, setObservaciones] = useState(nomina?.observaciones ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Abierto de entrada si la nomina ya trae alguno de estos conceptos (no se cierra al borrar uno).
  const [hayOtros] = useState(() => OTROS.some(([k]) => !!nomina?.[k]));

  useEffect(() => {
    if (nomina) return;
    apiFetch<Empleado[]>(companyPath('/empleados?activos=true'))
      .then(setEmpleados)
      .catch((e) => {
        setEmpleados([]);
        setError(errorMessage(e));
      });
  }, [nomina]);

  const valores = useMemo(() => {
    const v = Object.fromEntries(TODOS.map((k) => [k, aNumero(importes[k])])) as Record<CampoImporte, number>;
    return { ...v, ingresoACuentaRepercutido: repercutido } as Importes;
  }, [importes, repercutido]);
  const invalidos = TODOS.filter((k) => !Number.isFinite(valores[k]) || valores[k] < 0);
  const cuadre = cuadreLocal(valores);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!nomina && !empleadoId) return setError('Elige el trabajador.');
    if (invalidos.length) return setError('Hay importes que no son números positivos: revísalos.');
    if (!cuadre.cuadra) return setError(`La nómina no cuadra: el líquido calculado es ${eur.format(cuadre.liquidoCalculado)}.`);
    const pct = porcentaje.trim() === '' ? null : aNumero(porcentaje);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return setError('El % de IRPF tiene que estar entre 0 y 100.');
    const devengo = conDevengo && ejercicioDevengo.trim() ? Number(ejercicioDevengo) : null;
    if (devengo !== null && !(Number.isInteger(devengo) && devengo >= 2000 && devengo <= periodo.ejercicio)) {
      return setError(`El ejercicio de devengo tiene que ser un año entre 2000 y ${periodo.ejercicio} (el de la nómina).`);
    }
    const cuerpo: Record<string, unknown> = {
      ejercicio: periodo.ejercicio,
      mes: periodo.mes,
      tipo,
      ejercicioDevengo: devengo,
      porcentajeIrpf: pct,
      observaciones: observaciones.trim() || null,
      ...Object.fromEntries(TODOS.map((k) => [k, Math.round(valores[k] * 100) / 100])),
      ingresoACuentaRepercutido: repercutido,
    };
    if (fechaPago) cuerpo.fechaPago = fechaPago;
    if (!nomina) cuerpo.empleadoId = empleadoId;
    setGuardando(true);
    try {
      const r = await apiFetch<Nomina & { avisos?: string[] }>(companyPath(nomina ? `/nominas/${nomina.id}` : '/nominas'), {
        method: nomina ? 'PUT' : 'POST',
        body: JSON.stringify(cuerpo),
      });
      onGuardado(`Nómina de ${r.empleado?.nombreCompleto ?? 'el trabajador'} guardada en borrador.`, r.avisos ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const campoImporte = ([k, t, ayuda]: [CampoImporte, string, string?]) => (
    <div key={k}>
      <label htmlFor={`nm-${k}`} className={etiqueta}>
        {t}
      </label>
      <input
        id={`nm-${k}`}
        inputMode="decimal"
        value={importes[k]}
        onChange={(e) => setImportes((x) => ({ ...x, [k]: e.target.value }))}
        placeholder="0,00"
        aria-invalid={invalidos.includes(k)}
        className={`${campo} text-right tabular-nums ${invalidos.includes(k) ? 'border-red-200 bg-red-50' : ''}`}
      />
      {ayuda && <p className="mt-0.5 text-[11px] text-slate-500">{ayuda}</p>}
    </div>
  );

  const anio = new Date().getFullYear();
  const conDevengo = tipo === 'ATRASOS' || !!nomina?.ejercicioDevengo;
  const devengoMal = conDevengo && ejercicioDevengo.trim() !== '' && !(/^\d{4}$/.test(ejercicioDevengo.trim()) && Number(ejercicioDevengo) <= periodo.ejercicio);

  return (
    <Modal titulo={nomina ? `Nómina de ${nomina.empleado?.nombreCompleto ?? ''}` : 'Añadir nómina'} onCerrar={onCerrar} ancho="max-w-3xl">
      <form onSubmit={guardar} className="space-y-5">
        {!nomina && empleados && empleados.length === 0 && !error && (
          <Alerta tipo="aviso">
            No hay trabajadores dados de alta. Créalos en{' '}
            <Link href="/dashboard/nominas/empleados" className="font-medium underline">
              Empleados
            </Link>{' '}
            o importa el Excel de la gestoría, que los da de alta solo.
          </Alerta>
        )}

        <div className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label htmlFor="nm-empleado" className={etiqueta}>
              Trabajador
            </label>
            {nomina ? (
              <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {nomina.empleado?.nombreCompleto} <span className="font-mono text-xs text-slate-500">{nomina.empleado?.nif}</span>
              </p>
            ) : (
              <select id="nm-empleado" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={campo} required>
                <option value="">{empleados === null ? 'Cargando...' : 'Elige el trabajador'}</option>
                {(empleados ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombreCompleto} · {x.nif}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="sm:col-span-3">
            <span className={etiqueta}>Mes de devengo</span>
            <div className="mt-1 flex gap-2">
              <select aria-label="Mes" value={periodo.mes} onChange={(e) => setPeriodo({ ...periodo, mes: Number(e.target.value) })} className={`${campo} mt-0`}>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {mesCapital(i + 1)}
                  </option>
                ))}
              </select>
              <input
                aria-label="Ejercicio"
                type="number"
                min={2000}
                max={anio + 1}
                value={periodo.ejercicio}
                onChange={(e) => setPeriodo({ ...periodo, ejercicio: Number(e.target.value) })}
                className={`${campo} mt-0 w-28`}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="nm-tipo" className={etiqueta}>
              Tipo
            </label>
            <select id="nm-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
              {TIPOS_NOMINA.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="nm-fecha" className={etiqueta}>
              Fecha de pago
            </label>
            <input id="nm-fecha" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={campo} />
            <p className="mt-0.5 text-[11px] text-slate-500">Vacía: el último día del mes. Al pagar se pone la real.</p>
          </div>
          {conDevengo && (
            <div className="sm:col-span-2">
              <label htmlFor="nm-devengo" className={etiqueta}>
                Ejercicio de devengo
              </label>
              <input
                id="nm-devengo"
                inputMode="numeric"
                maxLength={4}
                value={ejercicioDevengo}
                onChange={(e) => setEjercicioDevengo(e.target.value.replace(/\D/g, ''))}
                placeholder={String(periodo.ejercicio)}
                aria-invalid={devengoMal}
                className={`${campo} ${devengoMal ? 'border-red-200 bg-red-50' : ''}`}
              />
              <p className="mt-0.5 text-[11px] text-slate-500">Si los atrasos son de un año anterior: el 190 los declara aparte, con ese año.</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="nm-pct" className={etiqueta}>
              % de IRPF
            </label>
            <input id="nm-pct" inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} placeholder="Opcional" className={`${campo} text-right`} />
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Importes del recibo</legend>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{PRINCIPALES.map(campoImporte)}</div>
          <details open={hayOtros} className="rounded-lg border border-slate-200 bg-white">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm text-slate-700">Dietas, especie, indemnizaciones, anticipos y embargos</summary>
            <div className="space-y-3 border-t border-slate-100 p-3">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{OTROS.map(campoImporte)}</div>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={repercutido} onChange={(e) => setRepercutido(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                El ingreso a cuenta de la especie se descuenta al trabajador (si no, lo asume la empresa)
              </label>
            </div>
          </details>
        </fieldset>

        <div className={`rounded-lg border p-3 text-sm ${cuadre.cuadra ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`} aria-live="polite">
          <p className="tabular-nums">
            Devengado {eur.format(cuadre.devengado)} − deducciones {eur.format(cuadre.deducido)} = <strong>{eur.format(cuadre.liquidoCalculado)}</strong>
          </p>
          {cuadre.cuadra ? (
            <p className="mt-1">Cuadra con el líquido del recibo.{cuadre.diferencia !== 0 && ' El céntimo de diferencia por redondeo va a la 640.'}</p>
          ) : (
            <p className="mt-1 flex flex-wrap items-center gap-2">
              No cuadra: diferencia de {eur.format(cuadre.diferencia)} con el líquido.
              <button
                type="button"
                onClick={() => setImportes((x) => ({ ...x, liquido: String(cuadre.liquidoCalculado).replace('.', ',') }))}
                className="rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Poner {eur.format(cuadre.liquidoCalculado)} como líquido
              </button>
            </p>
          )}
          <p className="mt-1 text-xs opacity-80">Coste para la empresa: {eur.format(cuadre.costeEmpresa)}</p>
        </div>

        <div>
          <label htmlFor="nm-obs" className={etiqueta}>
            Observaciones
          </label>
          <textarea id="nm-obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={campo} />
        </div>

        {error && <Alerta tipo="error">{error}</Alerta>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={guardando} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={boton}>
            {guardando ? 'Guardando...' : nomina ? 'Guardar cambios' : 'Añadir en borrador'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
