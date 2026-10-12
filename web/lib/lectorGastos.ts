/**
 * Lector de gastos: de lo leido en una factura de proveedor a la propuesta del
 * formulario (inicialDe) y los avisos que la acompanan. Sin React: se usa en
 * app/dashboard/compras/lector-gastos y se puede probar por separado.
 */
import type { FormInicial, LineaInicial, MarcasLector, NivelMarca } from '@/components/compras/FormFacturaGasto';
import { pareceNifIvaUe } from './fiscal';
import { calcularLinea, hoyIso, paisDelPrefijo, TIPO_GASTO_INFO, tipoGastoDeCuenta, tipoGastoParaRetencion, TIPOS_GASTO, tipoIvaMasCercano, type TipoGasto } from './compras';
import { descripcionNeutraTramo, type EstadoCampo, type GastoLeido, type InfoLectura, type RectificativaLeida, type TramoGasto } from './lecturas';
import { estadoDesdeLectura } from './rectificativasGasto';

/** Tramos con base y tipo numericos. */
export const tramosValidos = (g: GastoLeido): TramoGasto[] =>
  (g.tramos ?? []).filter((t) => Number.isFinite(Number(t.base)) && Number.isFinite(Number(t.tipoIva)));

export const centimos = (n: number) => Math.round(n * 100);

/**
 * El IVA del tramo esta marcado por la comprobacion CUOTA_TIPO del servidor
 * (validaciones.ts: «El IVA del 21 % no corresponde a su base...» o, al 0 %,
 * «La base exenta no lleva IVA...»). Se reconoce por su codigo, no por el texto.
 */
const marcadoPorCuotaTipo = (c: EstadoCampo) => !!c.codigos?.includes('CUOTA_TIPO');

/**
 * Tramos cuyo IVA leido no coincide al centimo con el de la linea que se
 * propone al abrir el formulario (la de su tipo): solo diferencias de hasta
 * 5 centimos, las del redondeo. Se compara con la propuesta inicial: el
 * formulario no avisa de los cambios del usuario.
 *
 * El servidor marca el IVA de un tramo (CUOTA_TIPO) cuando se aparta de
 * base x tipo en mas de un centimo por partida de ese tipo, sea cual sea la
 * diferencia. Ese tramo ya sale en "Comprueba estos datos" con una tarjeta que
 * dice cuanto sale y cuanto pone, asi que aqui no se repite. Solo se quita el
 * aviso por ese motivo: si el IVA del tramo esta marcado por otra cosa (poca
 * seguridad al leerlo, calculado a partir de la base...), su tarjeta no habla
 * del descuadre y el aviso sigue saliendo.
 */
export function cuotasDescuadradas(
  g: GastoLeido,
  lineas: FormInicial['lineas'],
  campos: InfoLectura['campos'],
): Array<{ tipoIva: number; leida: number; linea: number }> {
  const conTarjeta = new Set(
    Object.entries(campos)
      .filter(([id, c]) => /^desglose\.\d+\.cuota$/.test(id) && c && c.estado !== 'ok' && typeof c.tipoIva === 'number' && marcadoPorCuotaTipo(c))
      .map(([, c]) => c!.tipoIva as number),
  );
  return tramosValidos(g).flatMap((t) => {
    const tipo = Number(t.tipoIva);
    const leida = Number(t.cuota);
    // Con un tipo que no es de los de la app, la linea lleva otro: no se compara.
    if (!Number.isFinite(leida) || tipoIvaMasCercano(tipo) !== tipo || conTarjeta.has(tipo)) return [];
    const suyas = (lineas ?? []).filter((l) => l.tipoIva === tipo);
    if (suyas.length !== 1) return [];
    const linea = calcularLinea({ cantidad: suyas[0].cantidad, precioUnitario: suyas[0].precioUnitario, tipoIva: tipo }).iva;
    const diferencia = Math.abs(centimos(linea) - centimos(leida));
    return diferencia > 0 && diferencia <= 5 ? [{ tipoIva: tipo, leida, linea }] : [];
  });
}

/** Las partidas del unico tramo; vacio si no lo hay o si solo trae el texto neutro. */
function descripcionUnTipo(t: TramoGasto | undefined): string {
  const d = t?.descripcion?.trim() ?? '';
  return d && d !== descripcionNeutraTramo(Number(t!.tipoIva)) ? d : '';
}

/** Cuenta de gasto valida (grupo 6, de 3 a 10 digitos) o null. */
const cuentaDeGasto = (c: string | null | undefined): string | null => (c && /^6\d{2,9}$/.test(c) ? c : null);

/**
 * Retencion leida (tipo en %). Si el lector solo dio el importe, sale de
 * importe / base, redondeada como en el servidor (15 de 100 -> 15 %).
 */
function retencionLeida(g: GastoLeido): number {
  const tipo = Number(g.tipoRetencion);
  if (Number.isFinite(tipo) && tipo > 0) return tipo;
  const importe = Number(g.retencion) || 0;
  const base = Number(g.base) || 0;
  return importe > 0 && base > 0 ? Math.round((importe / base) * 100) : 0;
}

/** La retencion leida no la admite ningun tipo de gasto (1 o 2 %): se conserva en las lineas y se avisa. */
export function retencionSinTipo(g: GastoLeido): number | null {
  const ret = retencionLeida(g);
  return ret > 0 && !TIPOS_GASTO.some((t) => TIPO_GASTO_INFO[t].retenciones.includes(ret)) ? ret : null;
}

/**
 * Lo leido, en la forma del formulario.
 *
 * Lineas: con varios tipos de IVA, una por tipo con su base (si no, el
 * formulario las juntaria al tipo mayor). De descripcion, las partidas del
 * tramo que manda el servidor. Con un solo tipo, si el servidor solo trae el
 * texto neutro ("Base al 21 %"), el concepto de la factura: la lectura con IA
 * no saca partidas y se perderia ("material de imprenta"); sin concepto, el
 * texto neutro.
 *
 * Cuenta: va en la factura (cuentaGasto) y las lineas la heredan; cada una se
 * puede llevar a otra con «Cambiar cuenta». Manda la cuenta habitual del
 * proveedor (la que mas han usado sus ultimas facturas); sin ella, la sugerida
 * por el concepto.
 *
 * Tipo de gasto: el de la cuenta habitual o el sugerido. Si la factura trae
 * retencion y ese tipo no la admite, el que la admite (profesionales con el 7 o
 * el 15 %, alquileres con el 19 %): si no, el formulario la pondria a 0 y el
 * total no cuadraria. Si ninguno la admite (1 o 2 %), se conserva la leida y la
 * pagina avisa (retencionSinTipo).
 */
export function inicialDe(g: GastoLeido, paisExistente: string | null): FormInicial {
  const habitual = cuentaDeGasto(g.cuentaHabitual?.codigo);
  const sugerida = cuentaDeGasto(g.cuentaContableBase);
  const ret = retencionLeida(g);
  let tipo: TipoGasto = habitual ? tipoGastoDeCuenta(habitual) : g.tipoGastoSugerido && TIPO_GASTO_INFO[g.tipoGastoSugerido] ? g.tipoGastoSugerido : 'SUMINISTROS';
  if (ret > 0 && !TIPO_GASTO_INFO[tipo].retenciones.includes(ret)) tipo = tipoGastoParaRetencion(ret) ?? tipo;
  // La sugerida solo vale si es de ese tipo (la de «Asesoramiento» era la 629 y el tipo pasa a profesionales).
  const cuentaGasto = habitual ?? (sugerida && tipoGastoDeCuenta(sugerida) === tipo ? sugerida : null);
  const base = Number(g.base) || 0;
  const tipoIva = g.tipoIva !== null && g.tipoIva !== undefined ? tipoIvaMasCercano(g.tipoIva) : base > 0 ? tipoIvaMasCercano(((Number(g.iva) || 0) / base) * 100) : 21;
  const nif = (g.nifProveedor ?? '').trim();
  let proveedor: FormInicial['proveedor'] = null;
  if (g.proveedorExistente) {
    proveedor = { tipo: 'existente', id: g.proveedorExistente.id, nombre: g.proveedorExistente.nombreFiscal, nif: g.proveedorExistente.nifCif, pais: paisExistente || 'ES' };
  } else if (g.proveedor || nif) {
    const pais = pareceNifIvaUe(nif) ? (paisDelPrefijo(nif) ?? 'ES') : 'ES';
    // La dirección leída en la factura (si la hay) ya va en la ficha: no hay que copiarla a mano.
    const d = g.direccionProveedor;
    proveedor = { tipo: 'nuevo', nombreFiscal: g.proveedor ?? '', nifCif: nif, pais, direccion: d?.calle ?? '', cp: d?.cp ?? '', municipio: d?.municipio ?? '', provincia: d?.provincia ?? '' };
  }
  const fecha = g.fecha && /^\d{4}-\d{2}-\d{2}$/.test(g.fecha) ? g.fecha : hoyIso();
  const concepto = g.conceptoGasto?.trim() || 'Gasto';
  // La leida se conserva aunque el tipo no la admita (1 o 2 %): asi se ve y el total cuadra; la pagina avisa.
  const tipoRetencion = ret;
  const tramos = tramosValidos(g);
  const lineas: LineaInicial[] =
    tramos.length > 1
      ? tramos.map((t) => ({
          descripcion: t.descripcion?.trim() || descripcionNeutraTramo(Number(t.tipoIva)),
          cantidad: 1,
          precioUnitario: Number(t.base),
          tipoIva: tipoIvaMasCercano(Number(t.tipoIva)),
          tipoRetencion,
        }))
      : [{ descripcion: descripcionUnTipo(tramos[0]) || g.conceptoGasto?.trim() || tramos[0]?.descripcion?.trim() || concepto, cantidad: 1, precioUnitario: base, tipoIva, tipoRetencion }];
  return {
    proveedor,
    numeroFacturaProveedor: g.numeroFactura ?? '',
    fechaEmision: fecha,
    tipoGasto: tipo,
    cuentaGasto,
    ...(cuentaGasto ? { origenCuentaGasto: cuentaGasto === habitual ? ('habitual' as const) : ('sugerida' as const) } : {}),
    lineas,
    totalDocumento: Number.isFinite(Number(g.total)) && Number(g.total) !== 0 ? Number(g.total) : undefined,
  };
}

/**
 * P6: los datos que el lector dejo en «revisar» o en «error», con el nombre del
 * campo del formulario, para marcarlos dentro de FormFacturaGasto (ademas de
 * listarlos en «Comprueba estos datos»):
 *  - NIF y nombre del emisor: el proveedor (nuevo: su NIF o su nombre).
 *  - Numero, fecha y total: sus campos.
 *  - Base e IVA de cada tramo: el precio y el IVA de la linea de ese tipo.
 *  - Retencion: el IRPF de todas las lineas.
 *  - Base, IVA total y concepto: los de la linea, si solo hay una.
 * Si dos datos van al mismo campo, manda el peor.
 */
export function marcasDelFormulario(campos: InfoLectura['campos'], inicial: FormInicial): MarcasLector {
  const m: MarcasLector = {};
  const poner = (campo: string, nivel: NivelMarca) => {
    if (m[campo] !== 'error') m[campo] = nivel;
  };
  const lineas = inicial.lineas ?? [];
  const todas = lineas.map((_, i) => i);
  const unica = lineas.length === 1 ? [0] : [];
  /** Lineas con ese tipo de IVA (la propuesta hace una por tipo). */
  const deTipo = (tipoIva: number | undefined) =>
    typeof tipoIva === 'number' ? todas.filter((i) => lineas[i].tipoIva === tipoIvaMasCercano(tipoIva)) : unica;
  for (const [id, c] of Object.entries(campos)) {
    if (!c || c.estado === 'ok') continue;
    const n: NivelMarca = c.estado;
    const parte = /^desglose\.\d+\.(base|cuota)$/.exec(id)?.[1];
    if (id === 'emisor.nif' || id === 'emisor.nombre') {
      poner('proveedor', n);
      poner(id === 'emisor.nif' ? 'proveedor.nifCif' : 'proveedor.nombreFiscal', n);
    } else if (id === 'numero') poner('numeroFacturaProveedor', n);
    else if (id === 'fechaEmision') poner('fechaEmision', n);
    else if (parte) for (const i of deTipo(c.tipoIva)) poner(`lineas.${i}.${parte === 'base' ? 'precioUnitario' : 'tipoIva'}`, n);
    else if (id === 'retencion.tipo' || id === 'retencion.importe') for (const i of todas) poner(`lineas.${i}.tipoRetencion`, n);
    else if (id === 'totales.base') for (const i of unica) poner(`lineas.${i}.precioUnitario`, n);
    else if (id === 'totales.cuotaIva') for (const i of unica) poner(`lineas.${i}.tipoIva`, n);
    else if (id === 'concepto') for (const i of unica) poner(`lineas.${i}.descripcion`, n);
    else if (id === 'totales.totalFactura' || id === 'totales.totalAPagar') poner('totalDocumento', n);
  }
  return m;
}

/**
 * Marca en ámbar la dirección del proveedor nuevo que el lector puso con poca
 * seguridad (solo los campos que rellenó). Se añade a las de marcasDelFormulario.
 */
export function marcasDireccion(g: GastoLeido, inicial: FormInicial): MarcasLector {
  const d = g.direccionProveedor;
  if (!d?.revisar || inicial.proveedor?.tipo !== 'nuevo') return {};
  const m: MarcasLector = {};
  if (d.calle) m['proveedor.direccion'] = 'revisar';
  if (d.cp) m['proveedor.cp'] = 'revisar';
  if (d.municipio) m['proveedor.municipio'] = 'revisar';
  if (d.provincia) m['proveedor.provincia'] = 'revisar';
  return m;
}

/**
 * Lectura de una rectificativa o un abono (V19 en «revisar»): la propuesta
 * del formulario como abono. Las líneas van en positivo, como se escriben en
 * un abono: con importes leídos en negativo («Reduce el importe») se les
 * cambia el signo, y una línea que va al revés queda con el signo menos.
 * El bloque «Rectificación» sale de lo que propone el servidor
 * (rectificativa.propuesta, tipoPropuesto, causaPropuesta, sentido).
 */
export function inicialComoAbono(inicial: FormInicial, r: RectificativaLeida): FormInicial {
  const signo = r.importesNegativos ? -1 : 1;
  return {
    ...inicial,
    lineas: (inicial.lineas ?? []).map((l) => ({ ...l, precioUnitario: signo * l.precioUnitario + 0 })),
    rectificativa: estadoDesdeLectura(r),
  };
}
