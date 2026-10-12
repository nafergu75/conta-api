'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import FormFacturaGasto, { type FormInicial } from '@/components/compras/FormFacturaGasto';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { type DatosParaRectificar, hoyIso } from '@/lib/compras';
import { estadoDesdeDatos, estadoVacio, guardarAvisosGasto } from '@/lib/rectificativasGasto';

/**
 * Alta de una factura de gasto o de un abono o rectificativa del proveedor:
 * se guarda con su asiento en firme y su anotación en el libro de IVA.
 *
 * ?tipo=rectificativa abre el abono; con &original=ID llega rellenado con
 * los datos de esa factura (GET /expense-invoices/:id/rectificar).
 */

type Que = 'factura' | 'rectificativa';

/** El abono de una factura de la app, en la forma del formulario (líneas en positivo, con su cuenta). */
function inicialDeOriginal(d: DatosParaRectificar, hoy: string): FormInicial {
  return {
    proveedor: { tipo: 'existente', id: d.proveedor.id, nombre: d.proveedor.nombreFiscal, nif: d.proveedor.nifCif, pais: d.proveedor.pais || 'ES' },
    fechaEmision: hoy,
    tipoGasto: d.tipoGasto,
    lineas: d.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: Math.abs(l.precioUnitario),
      descuentoPorcentaje: l.descuentoPorcentaje,
      tipoIva: l.tipoIva,
      tipoRetencion: l.tipoRetencion,
      cuentaOriginal: l.cuenta,
    })),
    rectificativa: estadoDesdeDatos(d),
    datosOriginal: d,
  };
}

const opcion = (activa: boolean) =>
  `flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${activa ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`;

export default function NuevaFacturaGastoPage() {
  const router = useRouter();
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);
  const hoy = hoyIso();

  // Hasta leer la URL no se pinta el formulario (podría llegar ya rellenado).
  const [urlLeida, setUrlLeida] = useState(false);
  const [que, setQue] = useState<Que>('factura');
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [inicialAbono, setInicialAbono] = useState<FormInicial | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('tipo') === 'rectificativa') setQue('rectificativa');
    setOriginalId(p.get('original'));
    setUrlLeida(true);
  }, []);

  useEffect(() => {
    if (!originalId) return;
    let vivo = true;
    setCargando(true);
    apiFetch<DatosParaRectificar>(companyPath(`/expense-invoices/${encodeURIComponent(originalId)}/rectificar`))
      .then((d) => vivo && setInicialAbono(inicialDeOriginal(d, hoy)))
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [originalId, hoy]);

  const elegir = (q: Que) => {
    setQue(q);
    // La URL refleja lo elegido (volver atrás o recargar no lo pierde).
    const url = q === 'rectificativa' ? `/dashboard/compras/nueva?tipo=rectificativa${originalId ? `&original=${encodeURIComponent(originalId)}` : ''}` : '/dashboard/compras/nueva';
    window.history.replaceState(null, '', url);
  };

  const abono = que === 'rectificativa';
  const inicial: FormInicial = abono ? (inicialAbono ?? { fechaEmision: hoy, rectificativa: estadoVacio() }) : { fechaEmision: hoy };

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-4xl items-center gap-3 px-4 md:px-8">
          <Link
            href={originalId ? `/dashboard/compras/${encodeURIComponent(originalId)}` : '/dashboard/compras'}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label={originalId ? 'Volver a la factura' : 'Volver a Compras'}
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="min-w-0 truncate font-semibold text-slate-900">{abono ? 'Nuevo abono o rectificativa' : 'Nueva factura de gasto'}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-6 pb-24 md:px-8 md:py-8">
        {!puedeEscribir ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Para dar de alta facturas de gasto hace falta el permiso de escritura en Compras. Pídeselo al administrador de la empresa.
          </p>
        ) : !urlLeida ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <>
            <fieldset className="mb-6 rounded-xl border border-slate-200 bg-white p-4 md:p-6">
              <legend className="sr-only">¿Qué vas a registrar?</legend>
              <p className="mb-3 text-base font-semibold text-slate-900" aria-hidden="true">
                ¿Qué vas a registrar?
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={opcion(que === 'factura')}>
                  <input type="radio" name="nueva-que" checked={que === 'factura'} onChange={() => elegir('factura')} className="mt-0.5 accent-emerald-600" />
                  <span>
                    <span className="font-medium">Factura</span>
                    <span className="block text-xs text-slate-500">Una compra o un gasto del proveedor.</span>
                  </span>
                </label>
                <label className={opcion(abono)}>
                  <input type="radio" name="nueva-que" checked={abono} onChange={() => elegir('rectificativa')} className="mt-0.5 accent-emerald-600" />
                  <span>
                    <span className="font-medium">Abono o rectificativa</span>
                    <span className="block text-xs text-slate-500">El proveedor corrige una factura: una devolución, un descuento, un rappel, un error de IVA…</span>
                  </span>
                </label>
              </div>
            </fieldset>

            {abono && error && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
            {abono && cargando ? (
              <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
            ) : (
              <FormFacturaGasto
                // Cambiar entre factura y abono empieza de cero.
                key={`${que}-${inicialAbono ? 'original' : 'vacio'}`}
                modo="alta"
                inicial={inicial}
                onGuardado={({ factura }) => {
                  guardarAvisosGasto(factura.id, factura.avisos);
                  router.push(`/dashboard/compras/${factura.id}?guardada=1`);
                }}
                onCancelar={() => router.push(originalId ? `/dashboard/compras/${encodeURIComponent(originalId)}` : '/dashboard/compras')}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
