'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import FormFacturaGasto, { type FormInicial } from '@/components/compras/FormFacturaGasto';
import { ApiError, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { esTipoGasto, type GastoDetalle } from '@/lib/compras';

/** Los datos de la factura guardada, en la forma del formulario. */
function inicialDe(g: GastoDetalle): FormInicial {
  const cuentas = new Set(g.lineas.map((l) => l.accountCode ?? ''));
  const unaCuenta = g.cuentaGasto ?? null;
  return {
    proveedor: { tipo: 'existente', id: g.supplier.id, nombre: g.supplier.nombreFiscal, nif: g.supplier.nifCif, pais: g.supplier.pais || 'ES' },
    numeroFacturaProveedor: g.numeroFacturaProveedor ?? '',
    fechaEmision: g.fechaEmision,
    fechaVencimiento: g.fechaVencimiento,
    fechaRegistro: g.fechaRegistro,
    tipoGasto: esTipoGasto(g.tipoGasto) ? g.tipoGasto : 'SUMINISTROS',
    cuentaGasto: unaCuenta,
    lineas: g.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      descuentoPorcentaje: l.descuentoPorcentaje,
      tipoIva: l.tipoIva,
      tipoRetencion: l.tipoRetencion,
      // Con varias cuentas, cada linea conserva la suya.
      cuenta: !unaCuenta && cuentas.size > 1 ? l.accountCode : null,
    })),
    observaciones: g.observaciones ?? '',
  };
}

export default function EditarFacturaGastoPage() {
  const router = useRouter();
  const id = useParams().id as string;
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);

  const [gasto, setGasto] = useState<GastoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // ?campo=fechaRegistro: viene del Motor contable, que no pudo aprobar el borrador
  // porque su trimestre ya esta presentado. Hasta leer la URL no se pinta el formulario.
  const [campoInicial, setCampoInicial] = useState<'fechaRegistro' | undefined>();
  const [urlLeida, setUrlLeida] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('campo') === 'fechaRegistro') setCampoInicial('fechaRegistro');
    setUrlLeida(true);
  }, []);

  useEffect(() => {
    let vivo = true;
    apiFetch<GastoDetalle>(companyPath(`/expense-invoices/${encodeURIComponent(id)}`))
      .then((g) => vivo && setGasto(g))
      .catch((e) => vivo && setError(e instanceof ApiError && e.status === 404 ? 'Factura de gasto no encontrada.' : errorMessage(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [id]);

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-4xl items-center gap-3 px-4 md:px-8">
          <Link href={`/dashboard/compras/${id}`} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Volver a la factura">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="min-w-0 truncate font-semibold text-slate-900">Modificar {gasto ? `gasto ${gasto.numeroCompleto}` : 'factura de gasto'}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-6 pb-24 md:px-8 md:py-8">
        {cargando || !urlLeida ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        ) : !gasto ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || 'No se pudo cargar la factura.'}</p>
        ) : !puedeEscribir ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Para modificar facturas de gasto hace falta el permiso de escritura en Compras.</p>
        ) : !gasto.acciones.editar.permitido ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p>{gasto.acciones.editar.motivo || 'Esta factura ya no se puede modificar.'}</p>
            <Link href={`/dashboard/compras/${id}`} className="font-semibold underline">
              Volver a la factura
            </Link>
          </div>
        ) : (
          <>
            {!gasto.numeroFacturaProveedor && (
              <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                Esta factura se registró sin el número del proveedor: escríbelo para poder guardarla.
              </p>
            )}
            <FormFacturaGasto
              modo="editar"
              facturaId={id}
              asientoEnFirme={gasto.asiento?.estado === 'POSTED'}
              inicial={inicialDe(gasto)}
              monedaCuenta={gasto.monedaCuenta}
              campoInicial={campoInicial}
              avisoInicial={
                campoInicial === 'fechaRegistro'
                  ? 'No se ha podido aprobar: el trimestre de la fecha de esta factura ya tiene el IVA (o las retenciones) presentado. Si la recibiste más tarde, pon la fecha en que te llegó, de un periodo sin presentar, y guarda. Después aprueba el asiento en el Motor contable.'
                  : undefined
              }
              onGuardado={() => router.push(`/dashboard/compras/${id}?modificada=1`)}
              onCancelar={() => router.push(`/dashboard/compras/${id}`)}
            />
          </>
        )}
      </main>
    </div>
  );
}
