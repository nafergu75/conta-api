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
  // Divisas
  TIPO_CAMBIO_PROVISIONAL: { texto: 'El tipo de cambio es provisional: el definitivo se fija al pasarla a factura.', href: '', enlace: '' },
  TIPO_CAMBIO_PENDIENTE: { texto: 'Todavía no hay tipo de cambio: indícalo a mano al pasarla a factura si el BCE no responde.', href: '', enlace: '' },
  // Tipo de operacion de IVA (impiden emitirla)
  TIPO_AMBIGUO: { texto: 'Falta elegir el tipo de operación (nacional, intracomunitaria, exportación...).', href: '', enlace: '' },
  CLIENTE_SIN_NIF_IVA: { texto: 'Falta el NIF-IVA del cliente con el prefijo de su país (FR..., DE...; EL para Grecia).', href: '/dashboard/clientes', enlace: 'Ficha del cliente' },
  CLIENTE_NO_UE: { texto: 'Una entrega intracomunitaria exige un cliente de otro país de la UE.', href: '/dashboard/clientes', enlace: 'Ficha del cliente' },
  CLIENTE_ESPANOL: { texto: 'El cliente es de España: una exportación o un servicio no sujeto no se le puede facturar sin IVA.', href: '/dashboard/clientes', enlace: 'Ficha del cliente' },
  EXENCION_SIN_SUPUESTO: { texto: 'Indica el supuesto de exención (causa y precepto legal).', href: '', enlace: '' },
  ISP_CLIENTE: { texto: 'La inversión del sujeto pasivo exige un cliente español con NIF.', href: '/dashboard/clientes', enlace: 'Ficha del cliente' },
  LINEA_SIN_IVA: { texto: 'Todas las líneas van al 0 % en una factura nacional: elige el tipo de operación que corresponda o pon el IVA.', href: '', enlace: '' },
  LINEA_CON_IVA: { texto: 'El tipo de operación no lleva IVA: pon todas las líneas al 0 %.', href: '', enlace: '' },
  RETENCION_NO_RESIDENTE: { texto: 'A un cliente no residente no se le aplica retención de IRPF.', href: '', enlace: '' },
  F2_NO_PERMITIDA: { texto: 'Este tipo de operación no admite factura simplificada: usa la completa (F1).', href: '', enlace: '' },
};

const OBLIGATORIOS = new Set([
  'EMISOR_DENOMINACION',
  'EMISOR_NIF',
  'TIPO_AMBIGUO',
  'CLIENTE_SIN_NIF_IVA',
  'CLIENTE_NO_UE',
  'CLIENTE_ESPANOL',
  'EXENCION_SIN_SUPUESTO',
  'ISP_CLIENTE',
  'LINEA_SIN_IVA',
  'LINEA_CON_IVA',
  'RETENCION_NO_RESIDENTE',
  'F2_NO_PERMITIDA',
]);

export function AvisosFactura({ facturaId }: { facturaId: string }) {
  const [avisos, setAvisos] = useState<string[]>([]);

  useEffect(() => {
    apiFetch<{ avisos: string[] }>(companyPath(`/income-invoices/${facturaId}/avisos`))
      .then((r) => setAvisos(r.avisos ?? []))
      .catch(() => setAvisos([]));
  }, [facturaId]);

  if (avisos.length === 0) return null;
  const hayObligatorios = avisos.some((a) => OBLIGATORIOS.has(a));
  const hayFiscales = avisos.some((a) => OBLIGATORIOS.has(a) && !a.startsWith('EMISOR_'));

  return (
    <div className={`rounded-lg border p-4 text-sm ${hayObligatorios ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
      <p className="mb-2 flex items-center gap-2 font-medium">
        <WarningCircle size={18} />
        {hayFiscales
          ? 'Falta algo para poder pasarla a factura'
          : hayObligatorios
            ? 'Faltan datos obligatorios para emitir facturas'
            : 'Para que el documento salga completo'}
      </p>
      <ul className="space-y-1 pl-6">
        {avisos.map((a) => {
          const t = TEXTOS[a];
          if (!t) return null;
          return (
            <li key={a} className="list-disc">
              {t.texto}{' '}
              {t.href && (
                <Link href={t.href} className="font-medium underline">
                  {t.enlace}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
