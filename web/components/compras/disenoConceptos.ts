/**
 * Diseño de las líneas de una factura de gasto («Conceptos»), compartido por
 * el formulario (FormFacturaGasto) y por las líneas de la factura original de
 * una rectificativa por sustitución (BloqueRectificacion > LineasOriginal):
 * las dos se colocan igual, en tarjeta o en tabla segun el ancho del bloque.
 */

/**
 * Conceptos: se colocan segun el ancho del bloque, no el de la ventana (container
 * queries de CSS, con variantes arbitrarias de Tailwind). El mismo formulario va
 * en una columna estrecha (lector de gastos, movil) y a todo lo ancho (Compras >
 * Nueva o Modificar):
 *
 * - Menos de 24rem: tarjeta con la descripcion a lo ancho y debajo, en dos
 *   columnas, Cantidad y Precio; despues IVA e IRPF.
 * - De 24rem a 46rem: tarjeta con Cantidad, Precio (sin IVA) e IVA en una fila.
 *   El IRPF, si lo hay, debajo del IVA; desde 34rem, en la misma fila. Desde
 *   34rem el precio no pasa de 12rem: los campos van juntos a la izquierda en vez
 *   de estirar el precio hasta el borde.
 * - Desde 46rem y sin IRPF: tabla, con una fila de cabeceras y columnas de ancho
 *   fijo para que nada se solape; las etiquetas de cada campo siguen ahi para el
 *   lector de pantalla.
 * - Con IRPF siempre tarjeta: en una tabla con una columna mas, la descripcion
 *   (lo que mas se lee de cada linea) se quedaria en unos 190 px. En la tarjeta va
 *   a lo ancho y los cuatro campos, en una fila debajo.
 *
 * Para eso el bloque se llama distinto con IRPF («conceptosirpf»): las reglas de
 * la tabla, que preguntan por «conceptos», no le afectan.
 *
 * Anchos: la cantidad cabe con tres cifras, el IVA ensena «21 %» o «Exento»
 * enteros y la base, hasta 999.999.999,99 € (si alguna vez no cabe, baja de linea
 * en vez de salirse). Las clases van escritas enteras para que Tailwind las encuentre.
 */
export const CONCEPTOS = {
  sinIrpf: {
    /** El bloque que se mide. */
    contenedor: 'flex flex-col gap-3 [container-name:conceptos] [container-type:inline-size]',
    cabecera:
      'hidden [@container_conceptos_(min-width:46rem)]:grid [@container_conceptos_(min-width:46rem)]:grid-cols-[minmax(0,1fr)_4.5rem_7rem_6.5rem_7.5rem_2.25rem]',
    linea:
      '[@container_conceptos_(min-width:24rem)_and_(max-width:33.99rem)]:grid-cols-[5rem_minmax(0,1fr)_7.5rem] [@container_conceptos_(min-width:34rem)_and_(max-width:45.99rem)]:grid-cols-[5rem_minmax(7rem,12rem)_7.5rem_minmax(0,1fr)] [@container_conceptos_(min-width:46rem)]:grid-cols-[minmax(0,1fr)_4.5rem_7rem_6.5rem_7.5rem_2.25rem]',
    /** IRPF: no lo hay. */
    irpf: '',
  },
  conIrpf: {
    contenedor: 'flex flex-col gap-3 [container-name:conceptosirpf] [container-type:inline-size]',
    /** Sin tabla: no hay cabeceras. */
    cabecera: 'hidden',
    linea:
      '[@container_conceptosirpf_(min-width:24rem)_and_(max-width:33.99rem)]:grid-cols-[5rem_minmax(0,1fr)_7.5rem] [@container_conceptosirpf_(min-width:34rem)]:grid-cols-[5rem_minmax(7rem,12rem)_7.5rem_6.5rem_minmax(0,1fr)]',
    /** IRPF: en la tarjeta de tres columnas, debajo del IVA. */
    irpf: '[@container_conceptosirpf_(min-width:24rem)_and_(max-width:33.99rem)]:col-start-3',
  },
  /** Tarjeta (estrecho o con IRPF) o fila de la tabla (ancho, sin IRPF). */
  fila:
    'grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 [@container_conceptos_(min-width:46rem)]:items-center [@container_conceptos_(min-width:46rem)]:gap-x-3 [@container_conceptos_(min-width:46rem)]:gap-y-2 [@container_conceptos_(min-width:46rem)]:rounded-none [@container_conceptos_(min-width:46rem)]:border-0 [@container_conceptos_(min-width:46rem)]:border-b [@container_conceptos_(min-width:46rem)]:px-0 [@container_conceptos_(min-width:46rem)]:pt-0 [@container_conceptos_(min-width:46rem)]:pb-3',
  /** Cabecera de la tabla: una celda (solo se ve en ancho). */
  titulo: 'text-xs font-medium leading-tight text-slate-500',
  /** Descripcion: a lo ancho en la tarjeta, primera columna en la tabla. */
  descripcion: 'col-span-full [@container_conceptos_(min-width:46rem)]:col-span-1',
  /** Etiqueta de cada campo: visible en la tarjeta; en la tabla la sustituye la cabecera. */
  etiqueta: 'block text-sm font-medium text-slate-700 mb-1 [@container_conceptos_(min-width:46rem)]:sr-only',
  /** Base y papelera: una fila al pie de la tarjeta; en la tabla, dos columnas. */
  pie: 'col-span-full flex items-center justify-between gap-2 [@container_conceptos_(min-width:46rem)]:contents',
  /** Cifras del mismo ancho (tabular-nums) para que las bases cuadren entre lineas. */
  base: 'min-w-0 text-sm tabular-nums text-slate-600 [overflow-wrap:anywhere] [@container_conceptos_(min-width:46rem)]:text-right',
  palabraBase: '[@container_conceptos_(min-width:46rem)]:sr-only',
  papelera:
    'shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 disabled:opacity-40 [@container_conceptos_(min-width:46rem)]:justify-self-end',
};
