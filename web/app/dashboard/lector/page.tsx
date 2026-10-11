import { redirect } from 'next/navigation';

/**
 * La antigua entrada "Lector de facturas (OCR)" abría aquí una página genérica
 * ("Interfaz próximamente"). Ahora el menú lleva al lector de ventas; quien
 * entre por la dirección antigua (un marcador, un enlace guardado) va allí.
 */
export default function LectorAntiguo() {
  redirect('/dashboard/ventas/lector-ingresos');
}
