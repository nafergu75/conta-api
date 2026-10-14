/**
 * Movimientos anotados a mano antes (tabla Movement). «Nuevo movimiento» está
 * retirado desde el 13-10-2026: ya no se crean, cambian ni borran (el servidor
 * da 410 MOVIMIENTOS_RETIRADOS) y la pantalla Movimientos solo sirve para
 * consultar los antiguos. Las ventas y los gastos se registran como facturas.
 */

/** Categorías con que se anotaban (filtro de la pantalla). */
export const CATEGORIES = [
  { value: 'ventas', label: 'Ventas' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'suministros', label: 'Suministros' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'software', label: 'Software' },
  { value: 'nominas', label: 'Nóminas' },
  { value: 'impuestos', label: 'Impuestos' },
  { value: 'otros', label: 'Otros' },
];

/** Estados que pueden tener. */
export const STATUSES = [
  { value: 'draft', label: 'Borrador' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'reconciled', label: 'Conciliado' },
];
