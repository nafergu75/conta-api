'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import FormFacturaGasto from '@/components/compras/FormFacturaGasto';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { hoyIso } from '@/lib/compras';

/** Alta de una factura de gasto: se guarda con su asiento en firme y su anotación en el libro de IVA. */
export default function NuevaFacturaGastoPage() {
  const router = useRouter();
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);
  const hoy = hoyIso();

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-4xl items-center gap-3 px-4 md:px-8">
          <Link href="/dashboard/compras" className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Volver a Compras">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-semibold text-slate-900">Nueva factura de gasto</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-6 pb-24 md:px-8 md:py-8">
        {puedeEscribir ? (
          <FormFacturaGasto
            modo="alta"
            inicial={{ fechaEmision: hoy }}
            onGuardado={({ factura }) => router.push(`/dashboard/compras/${factura.id}?guardada=1`)}
            onCancelar={() => router.push('/dashboard/compras')}
          />
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Para dar de alta facturas de gasto hace falta el permiso de escritura en Compras. Pídeselo al administrador de la empresa.
          </p>
        )}
      </main>
    </div>
  );
}
