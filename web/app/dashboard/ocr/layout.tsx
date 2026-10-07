'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { esRutaDesactivada } from '@/components/dashboard/nav';
import { AvisoPantallaRetirada } from '@/components/dashboard/AvisoPantallaRetirada';

/**
 * La Bandeja OCR (la bandeja, la subida y el detalle de cada sesión) está fuera
 * del menú hasta que la subida funcione. Quien llegue por un enlace guardado ve
 * el aviso y no la pantalla. Analytics OCR (/dashboard/ocr/analytics) se ve igual
 * que antes.
 */
export default function OcrLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (esRutaDesactivada(pathname)) {
    return (
      <AvisoPantallaRetirada
        titulo="Bandeja OCR"
        mensaje="La Bandeja OCR aún no está disponible: da de alta las facturas de proveedor en Compras."
      />
    );
  }
  return <>{children}</>;
}
