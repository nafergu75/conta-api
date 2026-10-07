'use client';

import { AvisoPantallaRetirada } from '@/components/dashboard/AvisoPantallaRetirada';

/**
 * El lector de gastos está fuera del menú hasta que registre el gasto de verdad
 * (el confirmar decía «Gasto registrado» sin guardar nada). Quien llegue por un
 * enlace guardado o desde la Bandeja OCR ve el aviso y no la pantalla.
 */
export default function LectorGastosLayout() {
  return (
    <AvisoPantallaRetirada
      titulo="Lector de gastos"
      mensaje="El lector de gastos aún no está disponible: da de alta la factura en Compras."
    />
  );
}
