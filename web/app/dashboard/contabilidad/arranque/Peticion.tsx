'use client';

import { useState } from 'react';
import { CheckCircle, Copy } from '@phosphor-icons/react';
import { ANIO_GESTORIA, EJERCICIO_ARRANQUE } from '@/lib/arranque';
import { Bloque, botonSecundario } from './comun';

const A = ANIO_GESTORIA;

/** Lo que hay que pedir a la gestoría, fichero a fichero. */
const FICHEROS: Array<{ que: string; para: string; hace: 'Sí' | 'Si hay' | 'Mejor sí' }> = [
  { que: 'Plan de cuentas con todas las subcuentas, también las de saldo cero, y el NIF de clientes y proveedores', para: 'Crear las mismas cuentas, con su nombre y su número de dígitos', hace: 'Sí' },
  { que: `Sumas y saldos a 31-12-${A} por subcuenta, sin el asiento de cierre`, para: `La apertura del 1-1-${EJERCICIO_ARRANQUE} y la columna del año anterior`, hace: 'Sí' },
  { que: 'Listados de clientes y de proveedores con NIF, domicilio, correo y teléfono', para: 'Dar de alta las fichas con sus datos', hace: 'Mejor sí' },
  { que: `Libro diario de ${A} completo`, para: `Consultar en la app el mayor, el sumas y saldos y los informes de ${A}`, hace: 'Mejor sí' },
  { que: `Facturas pendientes de cobro y de pago a 31-12-${A}`, para: 'Cobrarlas y pagarlas desde la app', hace: 'Si hay' },
  { que: `Fichas de inmovilizado: coste, amortización acumulada a 31-12-${A}, fecha de alta y porcentaje`, para: `Calcular la amortización de ${EJERCICIO_ARRANQUE}`, hace: 'Si hay' },
  { que: `Cuenta de pérdidas y ganancias de ${A}`, para: 'La columna del año anterior, si el sumas y saldos viene regularizado', hace: 'Si hay' },
  { que: `Último 303 de ${A} (4.º trimestre), bases negativas y deducciones pendientes`, para: `Comprobar el IVA y arrastrar lo que se compensa en ${EJERCICIO_ARRANQUE}`, hace: 'Sí' },
];

const TEXTO_PETICION = `Hola:

Desde el 1 de enero de ${EJERCICIO_ARRANQUE} vamos a llevar la contabilidad en nuestro programa. Para empezar con vuestros saldos, ¿nos podéis mandar estos ficheros de ${A}, en Excel o CSV (no en PDF)?

1. Plan de cuentas con todas las subcuentas, también las de saldo cero, y el NIF de cada cliente y proveedor.
2. Sumas y saldos a 31-12-${A} al nivel de subcuenta (el máximo de dígitos), sin el asiento de cierre y con las cuentas a cero.
3. Listados de clientes y de proveedores con NIF, domicilio, código postal, población, correo y teléfono.
4. Libro diario de ${A} completo.
5. Facturas pendientes de cobro y de pago a 31-12-${A}: subcuenta o NIF, número de factura, fecha, vencimiento, importe total e importe pendiente.
6. Fichas del inmovilizado: descripción, cuenta, fecha de alta, coste, amortización acumulada a 31-12-${A} y porcentaje de amortización.
7. Cuenta de pérdidas y ganancias de ${A}, si el sumas y saldos va regularizado.
8. El 303 del 4.º trimestre de ${A}, las cuotas de IVA que quedan por compensar, las bases imponibles negativas y las deducciones pendientes.

Al principio nos vale un cierre provisional. Cuando cerréis el año, os pediremos los mismos ficheros con el cierre definitivo.

Si os va bien, mandadnos antes una muestra (por ejemplo, el plan y el sumas y saldos a 30 de septiembre) para comprobar que el formato de vuestro programa se lee bien.

Gracias.`;

/** Dónde lo saca cada programa (ayuda para la gestoría). */
const RUTAS_PROGRAMA: Array<[string, string]> = [
  ['a3ECO / a3asesor', 'Listados › Contables › Sumas y saldos, en Excel «por niveles» hasta subcuenta. La cartera, en «Composición de saldos».'],
  ['ContaPlus / Sage Despachos', 'Informes › Financieros › Sumas y saldos con «Reflejar saldo cero», a hoja de cálculo o CSV. También valen las tablas .dbf.'],
  ['Sage 50 / Sage 200', 'Contabilidad › Listados › Balances › Sumas y saldos a nivel de cuentas, en CSV si los decimales salen mal.'],
  ['Holded', 'Analítica › Informes › Finanzas › Sumas y saldos, con el máximo de dígitos.'],
  ['Contasol', 'Impresión › Libros › Sumas y saldos › «Generar en EXCEL».'],
  ['Monitor Informático y otros', 'Cualquier Excel o CSV con las columnas de cuenta, nombre e importes.'],
];

export function Peticion() {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(TEXTO_PETICION);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      // Sin portapapeles (http sin TLS): se deja ver el texto para copiarlo a mano.
      setCopiado(false);
      window.prompt('Copia este texto:', TEXTO_PETICION);
    }
  };

  return (
    <Bloque
      titulo="Qué pedir a la gestoría"
      extra={
        <button type="button" onClick={copiar} className={botonSecundario}>
          {copiado ? <CheckCircle size={16} className="text-emerald-600" /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar la petición para la gestoría'}
        </button>
      }
    >
      <p className="text-sm text-slate-600">
        Para cada empresa, en Excel o CSV. No hace falta saber de qué programa vienen: la app mira las columnas y el contenido de cada hoja. Puedes subirlos todos de una vez,
        también un libro con varias hojas.
      </p>
      <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {FICHEROS.map((f) => (
          <li key={f.que} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-900">{f.que}</p>
              <p className="text-slate-600">{f.para}</p>
            </div>
            <span
              className={`shrink-0 self-start rounded-full px-2 py-0.5 text-xs font-medium ${f.hace === 'Sí' ? 'bg-emerald-100 text-emerald-800' : f.hace === 'Mejor sí' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'}`}
            >
              {f.hace === 'Sí' ? 'Imprescindible' : f.hace === 'Mejor sí' ? 'Muy recomendable' : 'Si lo hay'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-600">
        El saldo de cada banco a 31-12-{A} lo da el banco, no la gestoría: lo escribirás a mano en el resumen. Las cifras del 303 también se escriben a mano.
      </p>
      <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Dónde lo saca cada programa</summary>
        <ul className="mt-2 space-y-1.5 text-slate-600">
          {RUTAS_PROGRAMA.map(([p, r]) => (
            <li key={p}>
              <span className="font-medium text-slate-800">{p}:</span> {r}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Son las rutas habituales de cada programa; según la versión pueden cambiar un poco.</p>
      </details>
    </Bloque>
  );
}
