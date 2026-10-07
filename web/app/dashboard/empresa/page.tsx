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

/**
 * Datos de la empresa: los que salen en las facturas (emisor, contacto e
 * inscripcion en el Registro Mercantil). Al entrar en una empresa sin ellos,
 * la app trae aqui primero (?primera=1). Los campos son los mismos que pide el
 * alta de una empresa en Administracion (components/empresa/CamposEmpresa).
 */

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
  const [datos, setDatos] = useState<DatosEmpresa>(DATOS_EMPRESA_VACIOS);
  const [pendientes, setPendientes] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [errores, setErrores] = useState<ErroresEmpresa>({});

  useEffect(() => {
    apiFetch<Record<string, unknown>>(companyPath('/legal-config'))
      .then((cfg) => {
        setDatos(
          Object.fromEntries(
            Object.keys(DATOS_EMPRESA_VACIOS).map((k) => [k, cfg[k] == null ? DATOS_EMPRESA_VACIOS[k as CampoEmpresa] : String(cfg[k])]),
          ) as unknown as DatosEmpresa,
        );
        setPendientes((cfg.pendientes as string[]) ?? []);
      })
      .catch((e) => setMensaje({ ok: false, texto: errorMessage(e) }))
      .finally(() => setCargando(false));
  }, []);

  const cambiar = (k: CampoEmpresa, v: string) => {
    setDatos((d) => ({ ...d, [k]: v }));
    setErrores((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  const off = !puedeEditar || guardando;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    setErrores({});
    try {
      const cfg = await apiFetch<{ completo: boolean; pendientes: string[] }>(companyPath('/legal-config'), {
        method: 'PUT',
        body: JSON.stringify(datos),
      });
      setPendientes(cfg.pendientes ?? []);
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
