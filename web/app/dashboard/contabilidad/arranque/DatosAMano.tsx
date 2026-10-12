'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import { apiFetch, companyPath } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { ANIO_GESTORIA, eur, importeEnCampo, leerImporte, type AjustesCarga, type BancoComprobar, type DatosFiscales, type PuntoComprobacion } from '@/lib/arranque';
import { Bloque, boton, campo, Nota, PuntosFormulario } from './comun';

const A = ANIO_GESTORIA;
type Bancos = NonNullable<AjustesCarga['bancos']>;

interface CuentaBancaria {
  id: string;
  iban: string;
  bancoNombre?: string;
  subcuentaCodigo: string;
  estado: string;
}

interface FilaBanco {
  extracto: string;
  cuentaId: string;
  iban: string;
  bancoNombre: string;
  aceptar: boolean;
}

/**
 * Saldo del extracto a 31-12 de cada banco y enlace con su cuenta de
 * Tesorería. Lo da el banco, no la gestoría: se escribe a mano.
 */
export function DatosBancos({
  bancos,
  puedeEditar,
  ocupado,
  onGuardar,
  puntos = [],
}: {
  bancos: BancoComprobar[];
  puedeEditar: boolean;
  ocupado: boolean;
  onGuardar: (b: Bancos) => Promise<void>;
  /** Lo que la comprobación dice de los bancos (se repite debajo del formulario). */
  puntos?: PuntoComprobacion[];
}) {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [filas, setFilas] = useState<Record<string, FilaBanco>>({});
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    setFilas(
      Object.fromEntries(
        bancos.map((b) => [b.subcuenta, { extracto: importeEnCampo(b.saldoExtracto), cuentaId: '', iban: '', bancoNombre: '', aceptar: b.aceptada }]),
      ),
    );
  }, [bancos]);

  useEffect(() => {
    if (!tieneAlgunPermiso(getUser(), ['tesoreria:read', 'tesoreria:write'])) return;
    apiFetch<CuentaBancaria[]>(companyPath('/treasury/bank-accounts'))
      .then((c) => setCuentas(c ?? []))
      .catch(() => setCuentas([]));
  }, []);

  const cambiar = (codigo: string, cambios: Partial<FilaBanco>) => {
    setGuardado(false);
    setFilas((f) => ({ ...f, [codigo]: { ...f[codigo], ...cambios } }));
  };

  const guardar = async () => {
    setError('');
    setGuardado(false);
    const salida: Bancos = {};
    for (const b of bancos) {
      const f = filas[b.subcuenta];
      if (!f) continue;
      const saldo = leerImporte(f.extracto);
      if (f.extracto.trim() && saldo === null) {
        setError(`El saldo de la ${b.subcuenta} no es un importe (por ejemplo, 18.600,00).`);
        return;
      }
      salida[b.subcuenta] = {
        saldoExtracto: saldo,
        ...(f.cuentaId ? { bankAccountId: f.cuentaId } : {}),
        ...(!b.cuenta && !f.cuentaId && f.iban.trim() ? { nueva: { iban: f.iban.trim(), bancoNombre: f.bancoNombre.trim() || null } } : {}),
        ...(f.aceptar ? { aceptarDiferencia: true } : {}),
      };
    }
    try {
      await onGuardar(salida);
      setGuardado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido guardar los bancos.');
    }
  };

  if (!bancos.length) return null;
  return (
    <Bloque titulo={`Bancos a 31-12-${A}`}>
      <p className="text-sm text-slate-600">
        Escribe el saldo que dice el extracto del banco a 31 de diciembre. Si no coincide con la contabilidad (un cheque o un recibo que el banco cargó en enero), marca que lo
        aceptas o revísalo con la gestoría.
      </p>
      <ul className="mt-3 space-y-3">
        {bancos.map((b) => {
          const f = filas[b.subcuenta] ?? { extracto: '', cuentaId: '', iban: '', bancoNombre: '', aceptar: false };
          const saldo = leerImporte(f.extracto);
          const diferencia = saldo === null ? null : Math.round((b.saldoApertura - saldo) * 100) / 100;
          const suyas = cuentas.filter((c) => c.subcuentaCodigo === b.subcuenta);
          return (
            <li key={b.subcuenta} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">
                  <span className="font-mono">{b.subcuenta}</span> {b.nombre}
                </p>
                <p className="text-sm text-slate-600">
                  En la contabilidad: <span className="font-semibold tabular-nums text-slate-900">{eur.format(b.saldoApertura)}</span>
                </p>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Saldo del extracto a 31-12-{A}
                  <input
                    inputMode="decimal"
                    className={campo}
                    value={f.extracto}
                    disabled={!puedeEditar || ocupado}
                    placeholder="Por ejemplo, 18.600,00"
                    onChange={(e) => cambiar(b.subcuenta, { extracto: e.target.value })}
                  />
                </label>
                {b.cuenta ? (
                  <p className="self-end text-sm text-slate-700">
                    Cuenta de Tesorería: <span className="break-all font-mono">{b.cuenta}</span>
                  </p>
                ) : suyas.length > 0 ? (
                  <label className="block text-xs font-medium text-slate-600">
                    Cuenta de Tesorería
                    <select className={campo} value={f.cuentaId} disabled={!puedeEditar || ocupado} onChange={(e) => cambiar(b.subcuenta, { cuentaId: e.target.value })}>
                      <option value="">Elige la cuenta…</option>
                      {suyas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.bancoNombre || 'Cuenta'} · {c.iban}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-600">
                      IBAN (para darla de alta)
                      <input className={campo} value={f.iban} disabled={!puedeEditar || ocupado} placeholder="ES91 2100…" onChange={(e) => cambiar(b.subcuenta, { iban: e.target.value })} />
                    </label>
                    <label className="block text-xs font-medium text-slate-600">
                      Banco
                      <input className={campo} value={f.bancoNombre} disabled={!puedeEditar || ocupado} onChange={(e) => cambiar(b.subcuenta, { bancoNombre: e.target.value })} />
                    </label>
                  </div>
                )}
              </div>
              {diferencia !== null && Math.round(diferencia * 100) !== 0 && (
                <label className="mt-2 flex items-start gap-2 text-sm text-amber-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={f.aceptar}
                    disabled={!puedeEditar || ocupado}
                    onChange={(e) => cambiar(b.subcuenta, { aceptar: e.target.checked })}
                  />
                  <span>
                    Hay {eur.format(Math.abs(diferencia))} de diferencia. Son cobros o pagos en tránsito a 31-12-{A}: lo acepto.
                  </span>
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <PuntosFormulario puntos={puntos} />
      {error && (
        <div className="mt-3">
          <Nota tipo="error">{error}</Nota>
        </div>
      )}
      {puedeEditar && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={boton} disabled={ocupado} onClick={guardar}>
            Guardar los bancos
          </button>
          {guardado && !ocupado && (
            <span role="status" className="text-sm font-medium text-emerald-700">
              Guardado
            </span>
          )}
        </div>
      )}
    </Bloque>
  );
}

interface FiscalesTexto {
  resultado303T4: string;
  cuotasIvaACompensar: string;
  resultadoDeclarado: string;
  basesNegativas: Array<{ ejercicio: string; importe: string }>;
  deducciones: Array<{ concepto: string; importe: string }>;
}

/**
 * Cifras de 2026 que no están en los ficheros: el 303 del 4T, las cuotas de
 * IVA a compensar, las bases negativas, las deducciones y el resultado que da
 * la gestoría.
 */
export function DatosFiscalesForm({
  datos,
  resultadoDeclarado,
  conResultado,
  puedeEditar,
  ocupado,
  onGuardar,
  puntos = [],
}: {
  datos: DatosFiscales | null;
  resultadoDeclarado: number | null;
  conResultado: boolean;
  puedeEditar: boolean;
  ocupado: boolean;
  onGuardar: (d: { datosFiscales: Record<string, unknown>; resultadoDeclarado?: number | null }) => Promise<void>;
  /** Lo que la comprobación dice de estas cifras (se repite debajo del formulario). */
  puntos?: PuntoComprobacion[];
}) {
  const inicial = (): FiscalesTexto => ({
    resultado303T4: importeEnCampo(datos?.resultado303T4),
    cuotasIvaACompensar: importeEnCampo(datos?.cuotasIvaACompensar),
    resultadoDeclarado: importeEnCampo(resultadoDeclarado),
    basesNegativas: (datos?.basesNegativas ?? []).map((b) => ({ ejercicio: String(b.ejercicio), importe: importeEnCampo(b.importe) })),
    deducciones: (datos?.deducciones ?? []).map((d) => ({ concepto: d.concepto, importe: importeEnCampo(d.importe) })),
  });
  const [f, setFTexto] = useState<FiscalesTexto>(inicial);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);
  const setF = (x: FiscalesTexto) => {
    setGuardado(false);
    setFTexto(x);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setFTexto(inicial()), [datos, resultadoDeclarado]);

  const guardar = async () => {
    setError('');
    setGuardado(false);
    const num = (t: string, nombre: string): number | null | 'mal' => {
      if (!t.trim()) return null;
      const n = leerImporte(t);
      if (n === null) {
        setError(`${nombre}: escribe un importe (por ejemplo, 1.250,30).`);
        return 'mal';
      }
      return n;
    };
    const r303 = num(f.resultado303T4, 'Resultado del 303 del 4T');
    const cuotas = num(f.cuotasIvaACompensar, 'Cuotas de IVA a compensar');
    const resultado = num(f.resultadoDeclarado, `Resultado de ${A}`);
    if (r303 === 'mal' || cuotas === 'mal' || resultado === 'mal') return;
    const bases = f.basesNegativas.filter((b) => b.ejercicio.trim() || b.importe.trim()).map((b) => ({ ejercicio: Number(b.ejercicio), importe: leerImporte(b.importe) }));
    const deducciones = f.deducciones.filter((d) => d.concepto.trim() || d.importe.trim()).map((d) => ({ concepto: d.concepto.trim(), importe: leerImporte(d.importe) }));
    try {
      await onGuardar({
        datosFiscales: { resultado303T4: r303, cuotasIvaACompensar: cuotas, basesNegativas: bases, deducciones },
        ...(conResultado ? { resultadoDeclarado: resultado } : {}),
      });
      setGuardado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido guardar los datos.');
    }
  };

  const des = !puedeEditar || ocupado;
  return (
    <Bloque titulo={`Impuestos y resultado de ${A}`}>
      <p className="text-sm text-slate-600">Cifras que no vienen en los ficheros. Están en el último 303 y en lo que te pase la gestoría.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs font-medium text-slate-600">
          Resultado del 303 del 4.º trimestre
          <input inputMode="decimal" className={campo} value={f.resultado303T4} disabled={des} onChange={(e) => setF({ ...f, resultado303T4: e.target.value })} />
          <span className="mt-1 block font-normal text-slate-500">A ingresar, en positivo; a devolver o a compensar, en negativo.</span>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Cuotas de IVA que quedan por compensar
          <input inputMode="decimal" className={campo} value={f.cuotasIvaACompensar} disabled={des} onChange={(e) => setF({ ...f, cuotasIvaACompensar: e.target.value })} />
          <span className="mt-1 block font-normal text-slate-500">Saldrán solas en el 303 del 1.er trimestre de {A + 1}. 0 si pediste la devolución.</span>
        </label>
        {conResultado && (
          <label className="block text-xs font-medium text-slate-600">
            Resultado de {A} según la gestoría
            <input inputMode="decimal" className={campo} value={f.resultadoDeclarado} disabled={des} onChange={(e) => setF({ ...f, resultadoDeclarado: e.target.value })} />
            <span className="mt-1 block font-normal text-slate-500">Beneficio en positivo, pérdida en negativo. Sirve para comprobar la 129.</span>
          </label>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-slate-600">Bases imponibles negativas pendientes</p>
          {f.basesNegativas.map((b, i) => (
            <div key={i} className="mt-1 flex gap-2">
              <input
                aria-label="Año"
                inputMode="numeric"
                className={`${campo} w-24`}
                placeholder="Año"
                value={b.ejercicio}
                disabled={des}
                onChange={(e) => setF({ ...f, basesNegativas: f.basesNegativas.map((x, j) => (j === i ? { ...x, ejercicio: e.target.value } : x)) })}
              />
              <input
                aria-label="Importe"
                inputMode="decimal"
                className={campo}
                placeholder="Importe"
                value={b.importe}
                disabled={des}
                onChange={(e) => setF({ ...f, basesNegativas: f.basesNegativas.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)) })}
              />
              {!des && (
                <button type="button" aria-label="Quitar" className="mt-1 rounded p-2 text-red-600 hover:bg-red-50" onClick={() => setF({ ...f, basesNegativas: f.basesNegativas.filter((_, j) => j !== i) })}>
                  <Trash size={16} />
                </button>
              )}
            </div>
          ))}
          {!des && (
            <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline" onClick={() => setF({ ...f, basesNegativas: [...f.basesNegativas, { ejercicio: '', importe: '' }] })}>
              <Plus size={14} /> Añadir una base negativa
            </button>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-600">Deducciones pendientes</p>
          {f.deducciones.map((d, i) => (
            <div key={i} className="mt-1 flex gap-2">
              <input
                aria-label="Concepto"
                className={campo}
                placeholder="Concepto"
                value={d.concepto}
                disabled={des}
                onChange={(e) => setF({ ...f, deducciones: f.deducciones.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)) })}
              />
              <input
                aria-label="Importe"
                inputMode="decimal"
                className={`${campo} w-32`}
                placeholder="Importe"
                value={d.importe}
                disabled={des}
                onChange={(e) => setF({ ...f, deducciones: f.deducciones.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)) })}
              />
              {!des && (
                <button type="button" aria-label="Quitar" className="mt-1 rounded p-2 text-red-600 hover:bg-red-50" onClick={() => setF({ ...f, deducciones: f.deducciones.filter((_, j) => j !== i) })}>
                  <Trash size={16} />
                </button>
              )}
            </div>
          ))}
          {!des && (
            <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline" onClick={() => setF({ ...f, deducciones: [...f.deducciones, { concepto: '', importe: '' }] })}>
              <Plus size={14} /> Añadir una deducción
            </button>
          )}
        </div>
      </div>
      <PuntosFormulario puntos={puntos} />
      {error && (
        <div className="mt-3">
          <Nota tipo="error">{error}</Nota>
        </div>
      )}
      {puedeEditar && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={boton} disabled={ocupado} onClick={guardar}>
            Guardar estas cifras
          </button>
          {guardado && !ocupado && (
            <span role="status" className="text-sm font-medium text-emerald-700">
              Guardado
            </span>
          )}
        </div>
      )}
    </Bloque>
  );
}
