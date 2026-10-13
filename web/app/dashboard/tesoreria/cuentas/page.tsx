'use client';

import { useEffect, useState } from 'react';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { EVENTO_SESION, getUser, tieneAlgunPermiso, type SessionUser } from '@/lib/auth';
import { parseImporte } from '@/lib/moneda';
import { CuentaBancariaCard } from '../components/CuentaBancariaCard';
import { Info, Plus } from '@phosphor-icons/react';

/** Quien no puede dar de alta cuentas (el servidor pide tesoreria:write). */
const PIDE_AL_ADMIN = 'Pide al administrador de la empresa que dé de alta la cuenta bancaria.';

/** GET /treasury/bank-accounts/subcuenta-propuesta */
interface SubcuentaPropuesta {
  /** La siguiente 572 libre (la que se pone si no se cambia). */
  subcuentaCodigo: string;
  longitud: number;
  /** 572 del plan que aún no son de ninguna cuenta (las trae el plan de la gestoría). */
  sinCuenta: Array<{ codigo: string; nombre: string }>;
}

/** Campos del formulario que pueden llevar un error al lado. */
type CampoCuenta = 'iban' | 'subcuentaCodigo' | 'saldoInicial';

const FORMULARIO_VACIO = {
  iban: '',
  bic: '',
  bancoNombre: '',
  entidad: '',
  subcuentaCodigo: '',
  saldoInicial: '',
  observaciones: '',
};

interface CuentaBancaria {
  id: string;
  iban: string;
  bic?: string;
  bancoNombre?: string;
  entidad?: string;
  saldoInicial: number;
  estado: string;
  movimientos: any[];
}

export default function CuentasPage() {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(FORMULARIO_VACIO);
  const [propuesta, setPropuesta] = useState<SubcuentaPropuesta | null>(null);
  const [erroresCampo, setErroresCampo] = useState<Partial<Record<CampoCuenta, string>>>({});
  const [errorFormulario, setErrorFormulario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // La sesion vive en localStorage: se lee tras montar (igual que el menu).
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetchCuentas();
    setUser(getUser());
    const alActualizar = () => setUser(getUser());
    window.addEventListener(EVENTO_SESION, alActualizar);
    return () => window.removeEventListener(EVENTO_SESION, alActualizar);
  }, []);

  // El administrador (global o de la empresa) siempre puede: su permiso es '*'.
  const puedeCrear = tieneAlgunPermiso(user, ['tesoreria:write']);

  // Al abrir el formulario se propone la subcuenta: la siguiente 572 libre (se puede cambiar).
  useEffect(() => {
    if (!showForm) return;
    let vivo = true;
    apiFetch<SubcuentaPropuesta>(companyPath('/treasury/bank-accounts/subcuenta-propuesta'))
      .then((p) => {
        if (!vivo) return;
        setPropuesta(p);
        setFormData((f) => (f.subcuentaCodigo ? f : { ...f, subcuentaCodigo: p.subcuentaCodigo }));
      })
      .catch(() => vivo && setPropuesta(null));
    return () => {
      vivo = false;
    };
  }, [showForm]);

  const cambiar = (campo: keyof typeof FORMULARIO_VACIO, valor: string) => {
    setFormData((f) => ({ ...f, [campo]: valor }));
    if (campo in erroresCampo) setErroresCampo((e) => ({ ...e, [campo]: undefined }));
  };

  const fetchCuentas = async () => {
    try {
      setCuentas((await apiFetch<CuentaBancaria[]>(companyPath('/treasury/bank-accounts'))) || []);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setErrorFormulario('');

    // Comprobaciones aquí, con el aviso junto al campo (el navegador no bloquea el envío sin decir por qué).
    const errores: Partial<Record<CampoCuenta, string>> = {};
    if (!formData.iban.trim()) errores.iban = 'Escribe el IBAN de la cuenta.';
    if (!formData.subcuentaCodigo.trim()) errores.subcuentaCodigo = 'Indica la subcuenta 572 de la cuenta.';
    const saldo = formData.saldoInicial.trim() ? parseImporte(formData.saldoInicial) : 0;
    if (!Number.isFinite(saldo)) errores.saldoInicial = 'Escribe el saldo como un importe, por ejemplo 1.250,50.';
    setErroresCampo(errores);
    if (Object.keys(errores).length) return;

    setEnviando(true);
    try {
      const payload = {
        iban: formData.iban,
        bic: formData.bic || undefined,
        bancoNombre: formData.bancoNombre || undefined,
        entidad: formData.entidad || undefined,
        subcuentaCodigo: formData.subcuentaCodigo.trim(),
        saldoInicial: saldo,
        observaciones: formData.observaciones || undefined,
      };

      const creada = await apiFetch<{ subcuentaCodigo: string }>(companyPath('/treasury/bank-accounts'), {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccess(`Cuenta bancaria dada de alta con la subcuenta ${creada.subcuentaCodigo}.`);
      setFormData(FORMULARIO_VACIO);
      setPropuesta(null);
      setShowForm(false);
      fetchCuentas();
    } catch (err) {
      const campo = campoDelError(err);
      if (campo === 'iban' || campo === 'subcuentaCodigo' || campo === 'saldoInicial') setErroresCampo({ [campo]: errorMessage(err) });
      else setErrorFormulario(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  const claseCampo = (campo: CampoCuenta) =>
    `mt-1 block w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${erroresCampo[campo] ? 'border-red-400' : 'border-slate-300'}`;
  const errorDe = (campo: CampoCuenta) =>
    erroresCampo[campo] ? (
      <p id={`cuenta-${campo}-error`} className="mt-1 text-xs text-red-700">
        {erroresCampo[campo]}
      </p>
    ) : null;
  const describe = (campo: CampoCuenta, ayuda?: string) =>
    [erroresCampo[campo] ? `cuenta-${campo}-error` : '', ayuda ?? ''].filter(Boolean).join(' ') || undefined;

  if (loading) {
    return <div className="text-center text-slate-500">Cargando cuentas...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas Bancarias</h1>
          <p className="mt-2 text-slate-600">Gestión de cuentas bancarias de la empresa</p>
        </div>
        {puedeCrear && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
          >
            <Plus size={20} />
            Nueva cuenta
          </button>
        )}
      </div>

      {user && !puedeCrear && cuentas.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <Info size={18} className="mt-0.5 shrink-0 text-slate-500" />
          <span>¿Falta alguna cuenta? {PIDE_AL_ADMIN}</span>
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {showForm && puedeCrear && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-lg border border-slate-200 bg-white p-4 space-y-4 sm:p-6"
        >
          <h3 className="font-semibold text-slate-900">Nueva cuenta bancaria</h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="cuenta-iban" className="block text-sm font-medium text-slate-700">IBAN *</label>
              <input
                id="cuenta-iban"
                type="text"
                placeholder="ES91 2100 0418 4502 0005 1332"
                value={formData.iban}
                onChange={(e) => cambiar('iban', e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-required="true"
                aria-invalid={erroresCampo.iban ? true : undefined}
                aria-describedby={describe('iban')}
                className={`${claseCampo('iban')} font-mono`}
              />
              {errorDe('iban')}
            </div>

            <div>
              <label htmlFor="cuenta-bic" className="block text-sm font-medium text-slate-700">BIC</label>
              <input
                id="cuenta-bic"
                type="text"
                placeholder="BBVAESMM"
                value={formData.bic}
                onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="cuenta-banco" className="block text-sm font-medium text-slate-700">Banco</label>
              <input
                id="cuenta-banco"
                type="text"
                placeholder="BBVA"
                value={formData.bancoNombre}
                onChange={(e) => setFormData({ ...formData, bancoNombre: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="cuenta-entidad" className="block text-sm font-medium text-slate-700">Entidad</label>
              <input
                id="cuenta-entidad"
                type="text"
                placeholder="0182"
                value={formData.entidad}
                onChange={(e) => setFormData({ ...formData, entidad: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="cuenta-subcuentaCodigo" className="block text-sm font-medium text-slate-700">Subcuenta contable *</label>
              <input
                id="cuenta-subcuentaCodigo"
                type="text"
                inputMode="numeric"
                placeholder={propuesta?.subcuentaCodigo ?? '57200001'}
                value={formData.subcuentaCodigo}
                onChange={(e) => cambiar('subcuentaCodigo', e.target.value)}
                autoComplete="off"
                aria-required="true"
                aria-invalid={erroresCampo.subcuentaCodigo ? true : undefined}
                aria-describedby={describe('subcuentaCodigo', 'cuenta-subcuenta-ayuda')}
                className={`${claseCampo('subcuentaCodigo')} font-mono`}
              />
              {errorDe('subcuentaCodigo')}
              <p id="cuenta-subcuenta-ayuda" className="mt-1 text-xs text-slate-500">
                {propuesta
                  ? `Se propone la siguiente 572 libre de tu plan (${propuesta.subcuentaCodigo}). Puedes cambiarla; si no existe, se da de alta en el plan.`
                  : 'Una subcuenta de la 572, por ejemplo 57200001. Si no existe, se da de alta en el plan.'}
              </p>
            </div>

            <div>
              <label htmlFor="cuenta-saldoInicial" className="block text-sm font-medium text-slate-700">Saldo inicial</label>
              <input
                id="cuenta-saldoInicial"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={formData.saldoInicial}
                onChange={(e) => cambiar('saldoInicial', e.target.value)}
                autoComplete="off"
                aria-invalid={erroresCampo.saldoInicial ? true : undefined}
                aria-describedby={describe('saldoInicial', 'cuenta-saldo-ayuda')}
                className={`${claseCampo('saldoInicial')} text-right font-mono`}
              />
              {errorDe('saldoInicial')}
              <p id="cuenta-saldo-ayuda" className="mt-1 text-xs text-slate-500">
                Escríbelo como siempre, por ejemplo 1.250,50. Vacío es 0.
              </p>
            </div>
          </div>

          {propuesta && propuesta.sinCuenta.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                Tu plan contable ya tiene {propuesta.sinCuenta.length === 1 ? 'una subcuenta de bancos' : 'subcuentas de bancos'} sin cuenta
                asociada. Si esta cuenta es una de ellas, elígela para que el saldo traído y los movimientos vayan a la misma:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {propuesta.sinCuenta.map((c) => (
                  <button
                    key={c.codigo}
                    type="button"
                    onClick={() => cambiar('subcuentaCodigo', c.codigo)}
                    aria-pressed={formData.subcuentaCodigo === c.codigo}
                    className={`rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition ${
                      formData.subcuentaCodigo === c.codigo ? 'border-amber-600 bg-amber-100' : 'border-amber-300 bg-white hover:bg-amber-100'
                    }`}
                  >
                    <span className="font-mono">{c.codigo}</span> · {c.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="cuenta-observaciones" className="block text-sm font-medium text-slate-700">Observaciones</label>
            <textarea
              id="cuenta-observaciones"
              value={formData.observaciones}
              onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={3}
            />
          </div>

          {errorFormulario && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {errorFormulario}
            </p>
          )}
          {Object.values(erroresCampo).some(Boolean) && (
            <p role="alert" className="text-sm text-red-700">
              Revisa los avisos que hay junto a los campos.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {enviando ? 'Creando…' : 'Crear cuenta'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setErroresCampo({});
                setErrorFormulario('');
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cuentas.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">No hay cuentas bancarias configuradas</p>
          {puedeCrear ? (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
            >
              Crear primera cuenta
            </button>
          ) : (
            user && <p className="mt-3 text-sm text-slate-600">{PIDE_AL_ADMIN}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((cuenta) => (
            <CuentaBancariaCard
              key={cuenta.id}
              id={cuenta.id}
              iban={cuenta.iban}
              bancoNombre={cuenta.bancoNombre}
              entidad={cuenta.entidad}
              saldoInicial={cuenta.saldoInicial || 0}
              estado={cuenta.estado || 'activa'}
              pendientes={cuenta.movimientos?.filter((m) => m.estado === 'pendiente').length || 0}
              conciliados={cuenta.movimientos?.filter((m) => m.estado === 'conciliado').length || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
