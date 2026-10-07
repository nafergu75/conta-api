'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Buildings, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { LogoEmpresa } from '../registro-mercantil/LogoEmpresa';
import { PAISES, PAISES_UE } from '@/lib/fiscal';
import { NOMBRE_MONEDA } from '@/lib/moneda';

/**
 * Datos de la empresa: los que salen en las facturas (emisor, contacto e
 * inscripcion en el Registro Mercantil). Al entrar en una empresa sin ellos,
 * la app trae aqui primero (?primera=1).
 */

interface Datos {
  denominacion: string;
  tipoSociedad: string;
  nif: string;
  domicilioSocial: string;
  codigoPostal: string;
  municipio: string;
  provincia: string;
  telefono: string;
  email: string;
  web: string;
  registroMercantilProvincia: string;
  registroTomo: string;
  registroFolio: string;
  registroHoja: string;
  registroInscripcion: string;
  pais: string;
  datosRegistrales: string;
  /** Moneda de la contabilidad: EUR en Espana; USD en EE. UU. y Hong Kong. */
  monedaCuenta: string;
}

const VACIO: Datos = {
  denominacion: '',
  tipoSociedad: 'SL',
  nif: '',
  domicilioSocial: '',
  codigoPostal: '',
  municipio: '',
  provincia: '',
  telefono: '',
  email: '',
  web: '',
  registroMercantilProvincia: '',
  registroTomo: '',
  registroFolio: '',
  registroHoja: '',
  registroInscripcion: '',
  pais: 'ES',
  datosRegistrales: '',
  monedaCuenta: 'EUR',
};

/** Moneda de la contabilidad que corresponde a un pais: euros en Espana y en la UE; dolares en el resto. */
const monedaDelPais = (pais: string) => (pais === 'ES' || PAISES_UE.has(pais) ? 'EUR' : 'USD');

const FORMAS = [
  ['SL', 'Sociedad limitada (S.L.)'],
  ['SLU', 'Sociedad limitada unipersonal (S.L.U.)'],
  ['SA', 'Sociedad anónima (S.A.)'],
  ['AUTONOMO', 'Autónomo (empresario individual)'],
  ['SCP', 'Sociedad civil'],
  ['OTRA', 'Otra'],
] as const;
const INSCRIBIBLES = ['SL', 'SLU', 'SA'];

const campo =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50';

function Campo({
  id,
  label,
  valor,
  onChange,
  obligatorio,
  ayuda,
  tipo = 'text',
  className = '',
  disabled,
}: {
  id: keyof Datos;
  label: string;
  valor: string;
  onChange: (v: string) => void;
  obligatorio?: boolean;
  ayuda?: string;
  tipo?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {obligatorio && <span className="text-red-600"> *</span>}
      </label>
      <input id={id} type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} className={campo} disabled={disabled} />
      {ayuda && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>}
    </div>
  );
}

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

  useEffect(() => {
    apiFetch<Record<string, unknown>>(companyPath('/legal-config'))
      .then((cfg) => {
        setDatos(
          Object.fromEntries(
            Object.keys(VACIO).map((k) => [k, cfg[k] == null ? VACIO[k as keyof Datos] : String(cfg[k])]),
          ) as unknown as Datos,
        );
        setPendientes((cfg.pendientes as string[]) ?? []);
        setMonedaEditable(cfg.monedaCuentaEditable !== false);
        setPaisGuardado(String(cfg.pais ?? 'ES'));
      })
      .catch((e) => setMensaje({ ok: false, texto: errorMessage(e) }))
      .finally(() => setCargando(false));
  }, []);

  const s = (k: keyof Datos) => (v: string) => setDatos((d) => ({ ...d, [k]: v }));
  // Al cambiar de pais, la moneda de la contabilidad que le toca (si aun se puede cambiar).
  const cambiarPais = (pais: string) =>
    setDatos((d) => ({ ...d, pais, ...(monedaEditable && /^[A-Z]{2}$/.test(pais) ? { monedaCuenta: monedaDelPais(pais) } : {}) }));
  const espana = datos.pais === 'ES';
  const inscribible = espana && INSCRIBIBLES.includes(datos.tipoSociedad);
  const paisEnLista = PAISES.some(([c]) => c === datos.pais);
  const off = !puedeEditar || guardando;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (datos.pais !== paisGuardado) {
      const aviso =
        datos.pais === 'ES'
          ? 'La empresa pasa a estar establecida en España: sus facturas llevarán IVA y tendrás que elegir el tipo de operación de cada una.'
          : 'La empresa deja de estar establecida en España: sus facturas saldrán sin IVA ni IRPF y en inglés, y no se usan los modelos 303, 349, 390 ni 347. Las facturas ya emitidas no cambian.';
      if (!window.confirm(`${aviso}\n\n¿Guardar el cambio de país?`)) return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      // La moneda de la contabilidad solo se envia mientras se puede cambiar.
      const cfg = await apiFetch<{ completo: boolean; pendientes: string[]; monedaCuenta?: string; monedaCuentaEditable?: boolean }>(
        companyPath('/legal-config'),
        { method: 'PUT', body: JSON.stringify(monedaEditable ? datos : { ...datos, monedaCuenta: undefined }) },
      );
      if (cfg.monedaCuenta) setDatos((d) => ({ ...d, monedaCuenta: cfg.monedaCuenta as string }));
      setMonedaEditable(cfg.monedaCuentaEditable !== false);
      setPendientes(cfg.pendientes ?? []);
      setPaisGuardado(datos.pais);
      if (cfg.completo) {
        setMensaje({ ok: true, texto: 'Datos guardados. Ya salen en tus facturas.' });
        if (primera) router.push('/dashboard');
      } else {
        setMensaje({ ok: false, texto: `Guardado, pero aún faltan: ${cfg.pendientes.join(', ')}.` });
      }
    } catch (err) {
      setMensaje({ ok: false, texto: errorMessage(err) });
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

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Identificación</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <Campo id="denominacion" label="Denominación o nombre completo" valor={datos.denominacion} onChange={s('denominacion')} obligatorio className="md:col-span-4" disabled={off} ayuda="Razón social tal como figura en el Registro (p. ej. Ifeval Sport, S.L.) o nombre y apellidos si eres autónomo." />
          <div className="md:col-span-2">
            <label htmlFor="tipoSociedad" className="block text-sm font-medium text-slate-700">
              Forma jurídica<span className="text-red-600"> *</span>
            </label>
            <select id="tipoSociedad" value={datos.tipoSociedad} onChange={(e) => s('tipoSociedad')(e.target.value)} className={campo} disabled={off}>
              {FORMAS.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="pais" className="block text-sm font-medium text-slate-700">
              País<span className="text-red-600"> *</span>
            </label>
            <select
              id="pais"
              value={paisEnLista ? datos.pais : 'OTRO'}
              onChange={(e) => cambiarPais(e.target.value === 'OTRO' ? '' : e.target.value)}
              className={campo}
              disabled={off}
            >
              {PAISES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
              <option value="OTRO">Otro país…</option>
            </select>
            {!paisEnLista && (
              <input
                aria-label="Código del país"
                placeholder="Código de 2 letras (p. ej. BE)"
                maxLength={2}
                value={datos.pais}
                onChange={(e) => cambiarPais(e.target.value.toUpperCase())}
                className={campo}
                disabled={off}
              />
            )}
          </div>
          <Campo id="nif" label={espana ? 'NIF' : 'Identificación fiscal'} valor={datos.nif} onChange={s('nif')} obligatorio className="md:col-span-2" disabled={off} ayuda={espana ? undefined : 'El número fiscal de tu país (p. ej. ICE o IF en Marruecos, EIN en EE. UU.).'} />
          <Campo id="domicilioSocial" label="Domicilio" valor={datos.domicilioSocial} onChange={s('domicilioSocial')} obligatorio className="md:col-span-4" disabled={off} ayuda="Calle, número, piso y puerta." />
          <Campo id="codigoPostal" label="Código postal" valor={datos.codigoPostal} onChange={s('codigoPostal')} obligatorio className="md:col-span-2" disabled={off} />
          <Campo id="municipio" label="Municipio" valor={datos.municipio} onChange={s('municipio')} obligatorio className="md:col-span-2" disabled={off} />
          <Campo id="provincia" label={espana ? 'Provincia' : 'Región o estado'} valor={datos.provincia} onChange={s('provincia')} obligatorio={espana} className="md:col-span-2" disabled={off} />
        </div>
      </section>

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
              onChange={(e) => s('monedaCuenta')(e.target.value)}
              className={campo}
              disabled={off || espana || !monedaEditable}
            >
              {(espana ? ['EUR'] : ['EUR', 'USD']).map((m) => (
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
        {!espana && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Tus facturas saldrán sin IVA ni IRPF, en inglés y con el formato de fecha de tu país, y no se usan los modelos 303, 349, 390 ni 347. Si tienes
            establecimiento permanente en España, elige España.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Contacto</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo id="telefono" label="Teléfono" tipo="tel" valor={datos.telefono} onChange={s('telefono')} disabled={off} />
          <Campo id="email" label="Email" tipo="email" valor={datos.email} onChange={s('email')} disabled={off} />
          <Campo id="web" label="Web" valor={datos.web} onChange={s('web')} disabled={off} />
        </div>
      </section>

      {inscribible && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="font-semibold text-slate-900">Inscripción en el Registro Mercantil</h2>
            <p className="mt-1 text-xs text-slate-500">
              Obligatoria en las sociedades. Sale al pie de las facturas en letra pequeña. La encontrarás en la escritura de constitución o en una nota simple del Registro.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Campo id="registroMercantilProvincia" label="Registro Mercantil de" valor={datos.registroMercantilProvincia} onChange={s('registroMercantilProvincia')} obligatorio className="col-span-2 md:col-span-1" disabled={off} ayuda="Provincia, p. ej. Valencia" />
            <Campo id="registroTomo" label="Tomo" valor={datos.registroTomo} onChange={s('registroTomo')} obligatorio disabled={off} />
            <Campo id="registroFolio" label="Folio" valor={datos.registroFolio} onChange={s('registroFolio')} obligatorio disabled={off} />
            <Campo id="registroHoja" label="Hoja" valor={datos.registroHoja} onChange={s('registroHoja')} obligatorio disabled={off} ayuda="p. ej. V-123456" />
            <Campo id="registroInscripcion" label="Inscripción" valor={datos.registroInscripcion} onChange={s('registroInscripcion')} obligatorio disabled={off} ayuda="p. ej. 1ª" />
          </div>
          {datos.registroTomo && datos.registroHoja && (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              En la factura: Inscrita en el Registro Mercantil{datos.registroMercantilProvincia ? ` de ${datos.registroMercantilProvincia}` : ''}, Tomo {datos.registroTomo}
              {datos.registroFolio && `, Folio ${datos.registroFolio}`}, Hoja {datos.registroHoja}
              {datos.registroInscripcion && `, Inscripción ${datos.registroInscripcion}`}.
            </p>
          )}
        </section>
      )}

      {!espana && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Datos registrales</h2>
          <p className="text-xs text-slate-500">
            Si en tu país las facturas deben llevar datos de registro (p. ej. RC e ICE en Marruecos), escríbelos tal como tienen que aparecer. Saldrán al pie de la factura.
          </p>
          <textarea
            id="datosRegistrales"
            rows={2}
            value={datos.datosRegistrales}
            onChange={(e) => s('datosRegistrales')(e.target.value)}
            className={campo}
            disabled={off}
          />
        </section>
      )}

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
