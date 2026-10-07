'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Buildings, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import {
  CamposEmpresa,
  DATOS_EMPRESA_VACIOS,
  type CampoEmpresa,
  type DatosEmpresa,
  type ErroresEmpresa,
} from '@/components/empresa/CamposEmpresa';
import { LogoEmpresa } from '../registro-mercantil/LogoEmpresa';
import { EVENTO_DATOS_EMPRESA, PAISES_UE } from '@/lib/fiscal';
import { NOMBRE_MONEDA } from '@/lib/moneda';

/**
 * Datos de la empresa: los que salen en las facturas (emisor, contacto e
 * inscripcion en el Registro Mercantil). Al entrar en una empresa sin ellos,
 * la app trae aqui primero (?primera=1). Los campos son los mismos que pide el
 * alta de una empresa en Administracion (components/empresa/CamposEmpresa).
 */

/** Los datos de CamposEmpresa mas la moneda de la contabilidad (EUR en Espana; USD en EE. UU. y Hong Kong). */
type Datos = DatosEmpresa & { monedaCuenta: string };

const VACIO: Datos = { ...DATOS_EMPRESA_VACIOS, monedaCuenta: 'EUR' };

/** Moneda de la contabilidad que corresponde a un pais: euros en Espana y en la UE; dolares en el resto. */
const monedaDelPais = (pais: string) => (pais === 'ES' || PAISES_UE.has(pais) ? 'EUR' : 'USD');

/**
 * Monedas de la contabilidad que admite el pais (las mismas que el servidor):
 * Espana y la UE, solo EUR; EE. UU. y Hong Kong, solo USD; el resto, las dos.
 */
const monedasDelPais = (pais: string): string[] =>
  pais === 'ES' || PAISES_UE.has(pais) ? ['EUR'] : pais === 'US' || pais === 'HK' ? ['USD'] : ['EUR', 'USD'];

const claseSelect =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50';

export default function DatosEmpresaPage() {
  return (
    <Suspense fallback={<p className="p-6 text-slate-500">Cargando…</p>}>
      <DatosEmpresa />
    </Suspense>
  );
}

function DatosEmpresa() {
  const router = useRouter();
  const primera = useSearchParams().get('primera') === '1';
  const puedeEditar = tieneAlgunPermiso(getUser(), ['contabilidad:write']);
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [pendientes, setPendientes] = useState<string[]>([]);
  // false: ya hay facturas o asientos y la moneda de la contabilidad no se puede cambiar.
  const [monedaEditable, setMonedaEditable] = useState(true);
  const [paisGuardado, setPaisGuardado] = useState('ES');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [errores, setErrores] = useState<ErroresEmpresa>({});
  // Moneda guardada que no admite el pais y que se corrige al guardar (ver la carga).
  const [monedaCorregida, setMonedaCorregida] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Record<string, unknown>>(companyPath('/legal-config'))
      .then((cfg) => {
        const leidos = Object.fromEntries(
          Object.keys(VACIO).map((k) => [k, cfg[k] == null ? VACIO[k as keyof Datos] : String(cfg[k])]),
        ) as unknown as Datos;
        const editable = cfg.monedaCuentaEditable !== false;
        // Una empresa de EE. UU. o Hong Kong anterior a las divisas (o dada de alta
        // antes de que el alta fijara la moneda) puede tener la contabilidad en EUR,
        // el valor por defecto de la columna. Mientras no tenga facturas ni asientos,
        // se le pone la de su pais; si no, el servidor rechazaria cualquier guardado
        // y el selector, con una sola opcion, no dejaria corregirla.
        if (editable && !monedasDelPais(leidos.pais).includes(leidos.monedaCuenta)) {
          setMonedaCorregida(leidos.monedaCuenta);
          leidos.monedaCuenta = monedaDelPais(leidos.pais);
        }
        setDatos(leidos);
        setPendientes((cfg.pendientes as string[]) ?? []);
        setMonedaEditable(editable);
        setPaisGuardado(String(cfg.pais ?? 'ES'));
      })
      .catch((e) => setMensaje({ ok: false, texto: errorMessage(e) }))
      .finally(() => setCargando(false));
  }, []);

  const cambiar = (k: CampoEmpresa, v: string) => {
    setDatos((d) => ({
      ...d,
      [k]: v,
      // Al cambiar de pais, la moneda de la contabilidad que le toca (si aun se puede cambiar).
      ...(k === 'pais' && monedaEditable && /^[A-Z]{2}$/.test(v) ? { monedaCuenta: monedaDelPais(v) } : {}),
    }));
    setErrores((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  const espana = datos.pais === 'ES';
  const off = !puedeEditar || guardando;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    // Con facturas o asientos no se pasa de Espana a otro pais ni al reves (el servidor tambien lo impide).
    if (!monedaEditable && (datos.pais === 'ES') !== (paisGuardado === 'ES')) {
      setMensaje({
        ok: false,
        texto:
          paisGuardado === 'ES'
            ? 'La empresa ya tiene facturas o asientos como empresa establecida en España: no se puede cambiar a otro país. Si va a operar desde otro país, dala de alta como empresa nueva.'
            : 'La empresa ya tiene facturas o asientos como empresa no establecida en España: no se puede cambiar a España. Si tiene establecimiento permanente en España, dala de alta como empresa nueva con país España.',
      });
      return;
    }
    if (datos.pais !== paisGuardado) {
      const aviso =
        datos.pais === 'ES'
          ? 'La empresa pasa a estar establecida en España: sus facturas llevarán IVA y tendrás que elegir el tipo de operación de cada una.'
          : 'La empresa deja de estar establecida en España: sus facturas saldrán sin IVA ni IRPF y en inglés, y no se usan los modelos 303, 349, 390 ni 347. Las facturas ya emitidas no cambian.';
      if (!window.confirm(`${aviso}\n\n¿Guardar el cambio de país?`)) return;
    }
    setGuardando(true);
    setMensaje(null);
    setErrores({});
    try {
      // La moneda de la contabilidad solo se envia mientras se puede cambiar.
      const cfg = await apiFetch<{ completo: boolean; pendientes: string[]; monedaCuenta?: string; monedaCuentaEditable?: boolean }>(
        companyPath('/legal-config'),
        { method: 'PUT', body: JSON.stringify(monedaEditable ? datos : { ...datos, monedaCuenta: undefined }) },
      );
      if (cfg.monedaCuenta) setDatos((d) => ({ ...d, monedaCuenta: cfg.monedaCuenta as string }));
      setMonedaEditable(cfg.monedaCuentaEditable !== false);
      setMonedaCorregida(null);
      setPendientes(cfg.pendientes ?? []);
      setPaisGuardado(datos.pais);
      // El menu oculta o enseña lo fiscal y las nominas segun el pais.
      if (datos.pais !== paisGuardado) window.dispatchEvent(new Event(EVENTO_DATOS_EMPRESA));
      if (cfg.completo) {
        setMensaje({ ok: true, texto: 'Datos guardados. Ya salen en tus facturas.' });
        if (primera) router.push('/dashboard');
      } else {
        setMensaje({ ok: false, texto: `Guardado, pero aún faltan: ${cfg.pendientes.join(', ')}.` });
      }
    } catch (err) {
      setMensaje({ ok: false, texto: errorMessage(err) });
      const campo = campoDelError(err) as CampoEmpresa | undefined;
      if (campo && campo in DATOS_EMPRESA_VACIOS) setErrores({ [campo]: errorMessage(err) });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <p className="p-6 text-slate-500">Cargando datos de la empresa…</p>;

  return (
    <form onSubmit={guardar} className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <Buildings size={28} className="mt-1 text-emerald-700" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Datos de la empresa</h1>
          <p className="mt-1 text-sm text-slate-600">
            Son los que aparecen en tus facturas como emisor. Los marcados con * son obligatorios.
          </p>
        </div>
      </div>

      {primera && pendientes.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Antes de empezar, completa los datos de tu empresa. Sin ellos no se pueden emitir facturas.
        </p>
      )}
      {!puedeEditar && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Solo puede cambiar estos datos un usuario con permiso de contabilidad.
        </p>
      )}

      <CamposEmpresa datos={datos} onCambio={cambiar} errores={errores} disabled={off} />

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Moneda e impuestos</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="monedaCuenta" className="block text-sm font-medium text-slate-700">
              Moneda de la contabilidad
            </label>
            <select
              id="monedaCuenta"
              value={datos.monedaCuenta}
              onChange={(e) => setDatos((d) => ({ ...d, monedaCuenta: e.target.value }))}
              className={claseSelect}
              disabled={off || !monedaEditable || monedasDelPais(datos.pais).length < 2}
            >
              {/* La actual se muestra aunque el pais ya no la admita (empresa antigua con facturas): el selector enseña lo que se envia. */}
              {monedasDelPais(datos.pais)
                .concat(!monedasDelPais(datos.pais).includes(datos.monedaCuenta) ? [datos.monedaCuenta] : [])
                .map((m) => (
                  <option key={m} value={m}>
                    {m} — {NOMBRE_MONEDA[m] ?? m}
                  </option>
                ))}
            </select>
          </div>
          <p className="text-xs text-slate-500 md:col-span-2 md:self-end">
            {espana
              ? 'En España la contabilidad va en euros. Puedes emitir facturas en euros o en dólares: cada una lleva su tipo de cambio.'
              : 'Las empresas de EE. UU. y Hong Kong llevan la contabilidad y facturan en dólares (USD).'}{' '}
            {!monedaEditable && 'Ya hay facturas o asientos: la moneda de la contabilidad no se puede cambiar.'}
          </p>
        </div>
        {monedaCorregida && monedaCorregida !== datos.monedaCuenta && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            La contabilidad estaba en {monedaCorregida}, que no corresponde a este país. Como aún no hay facturas ni asientos, al guardar pasará a{' '}
            {datos.monedaCuenta}.
          </p>
        )}
        {!espana && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Tus facturas saldrán sin IVA ni IRPF, en inglés y con el formato de fecha de tu país, y no se usan los modelos 303, 349, 390 ni 347. Si tienes
            establecimiento permanente en España, elige España.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Logo</h2>
        <LogoEmpresa puedeEditar={puedeEditar} />
      </section>

      {mensaje && (
        <p
          role={mensaje.ok ? 'status' : 'alert'}
          className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${mensaje.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
        >
          {mensaje.ok ? <CheckCircle size={18} /> : <WarningCircle size={18} />} {mensaje.texto}
        </p>
      )}

      {puedeEditar && (
        <div className="flex justify-end">
          <button type="submit" disabled={guardando} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar datos'}
          </button>
        </div>
      )}
    </form>
  );
}
