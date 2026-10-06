'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath } from '@/lib/api';

/**
 * Datos que faltan para que la factura (y su PDF) salga completa, con enlace a
 * donde se rellenan. El NIF y la denominacion de la empresa son obligatorios
 * para emitir; el resto mejora la factura.
 */
const TEXTOS: Record<string, { texto: string; href: string; enlace: string }> = {
  EMISOR_DENOMINACION: { texto: 'Falta la denominación (razón social) de tu empresa.', href: '/dashboard/registro-mercantil', enlace: 'Datos de la sociedad' },
  EMISOR_NIF: { texto: 'Falta el NIF de tu empresa.', href: '/dashboard/registro-mercantil', enlace: 'Datos de la sociedad' },
  EMISOR_DOMICILIO: { texto: 'Falta el domicilio de tu empresa.', href: '/dashboard/registro-mercantil', enlace: 'Datos de la sociedad' },
  EMISOR_LOGO: { texto: 'Puedes añadir el logo de tu empresa.', href: '/dashboard/registro-mercantil', enlace: 'Subir logo' },
  CLIENTE_DIRECCION: { texto: 'El cliente no tiene dirección completa.', href: '/dashboard/clientes', enlace: 'Ficha del cliente' },
  CUENTA_BANCARIA: { texto: 'Para cobrar por transferencia, da de alta tu cuenta bancaria y saldrá el IBAN.', href: '/dashboard/tesoreria/cuentas', enlace: 'Cuentas bancarias' },
};

const OBLIGATORIOS = new Set(['EMISOR_DENOMINACION', 'EMISOR_NIF']);

export function AvisosFactura({ facturaId }: { facturaId: string }) {
  const [avisos, setAvisos] = useState<string[]>([]);

  useEffect(() => {
    apiFetch<{ avisos: string[] }>(companyPath(`/income-invoices/${facturaId}/avisos`))
      .then((r) => setAvisos(r.avisos ?? []))
      .catch(() => setAvisos([]));
  }, [facturaId]);

  if (avisos.length === 0) return null;
  const hayObligatorios = avisos.some((a) => OBLIGATORIOS.has(a));

  return (
    <div className={`rounded-lg border p-4 text-sm ${hayObligatorios ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
      <p className="mb-2 flex items-center gap-2 font-medium">
        <WarningCircle size={18} />
        {hayObligatorios ? 'Faltan datos obligatorios para emitir facturas' : 'Para que el documento salga completo'}
      </p>
      <ul className="space-y-1 pl-6">
        {avisos.map((a) => {
          const t = TEXTOS[a];
          if (!t) return null;
          return (
            <li key={a} className="list-disc">
              {t.texto}{' '}
              <Link href={t.href} className="font-medium underline">
                {t.enlace}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
