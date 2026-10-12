'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CaretLeft } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';
import { AvisosBorrador, CamposRegistro, DescargarFichero, ESTADO_MODELO, Seccion, type CampoLeido } from '../components/RegistroAeat';
import SelectorAnio from '@/components/SelectorAnio';
import { anioDeTexto, hoyIso } from '@/lib/anios';
import { pago202APresentar } from '@/lib/aeatCalendar';
import { useAniosEmpresa, useElegido } from '@/lib/useAniosEmpresa';
import { CargandoModelo, ErrorModelo } from '../components/BorradorAeat';
import { Declaraciones } from '../components/Declaraciones';

/**
 * Modelo 202 (pago fraccionado del Impuesto sobre Sociedades) en la
 * modalidad de cuota (art. 40.2 LIS): borrador con el diseño de registro de la
 * AEAT. Las casillas salen del fichero que se descarga, leído campo a campo.
 */

interface Borrador202 {
  ejercicio: number;
  periodo: '1P' | '2P' | '3P';
  estado: string;
  /** «Presentado · complementaria en preparación» cuando hay una presentada y otra en curso (el estado de la fila dice 'vigente'). */
  estadoTexto?: string | null;
  opciones: {
    modalidad: 'A' | 'B';
    baseManual: number | null;
    domiciliar: boolean;
    complementaria: boolean;
    justificanteAnterior: string | null;
    resultadoAnterior: number | null;
  };
  base: { origen: 'manual' | 'modelo200' | 'ninguno'; ejercicio200: number; importe: number };
  cifraNegociosAnterior: number | null;
  errores: string[];
  avisos: string[];
  pantalla: { cabecera: CampoLeido[]; pagina01: CampoLeido[]; pagina02: CampoLeido[] } | null;
}

const PERIODOS: Array<[string, string]> = [
  ['1P', '1P – abril'],
  ['2P', '2P – octubre'],
  ['3P', '3P – diciembre'],
];
const eur = (n: number) => formatoImporte(n, 'EUR');

const IDENTIFICACION = ['tipoDeclaracion', 'nif', 'denominacion', 'territorioForal', 'ejercicio', 'periodo', 'fechaInicioPeriodo', 'cnae'];
const MODALIDAD_A = ['modalidad', 'c01', 'c02', 'c03'];

export default function Modelo202Page() {
  return (
    <Suspense fallback={<CargandoModelo />}>
      <Modelo202 />
    </Suspense>
  );
}

function Modelo202() {
  // Periodo de la URL (?ejercicio=2027&periodo=1P) o el que toca ahora. Años: los de la empresa hasta el actual (y el del pago que toca).
  const sp = useSearchParams();
  const aniosEmpresa = useAniosEmpresa();
  const periodoUrl = PERIODOS.some(([k]) => k === sp?.get('periodo')) ? (sp?.get('periodo') as string) : null;
  // El pago cuyo plazo no ha vencido, nunca antes del primer año de la empresa.
  const queToca = pago202APresentar(hoyIso(), aniosEmpresa.primeroReal);
  const [ejercicio, setEjercicio] = useElegido(anioDeTexto(sp?.get('ejercicio')), queToca.ejercicio);
  const [periodo, setPeriodo] = useElegido(periodoUrl, queToca.periodo);
  const anios = aniosEmpresa.aniosModelos([ejercicio, queToca.ejercicio]);
  const [b, setB] = useState<Borrador202 | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [base, setBase] = useState('');
  const [domiciliar, setDomiciliar] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!aniosEmpresa.listo) return;
    let vivo = true;
    setCargando(true);
    setError('');
    apiFetch<Borrador202>(companyPath(`/tax-models/202?ejercicio=${ejercicio}&periodo=${periodo}`))
      .then((r) => {
        if (!vivo) return;
        setB(r);
        setBase(r.opciones.baseManual === null ? '' : String(r.opciones.baseManual).replace('.', ','));
        setDomiciliar(r.opciones.domiciliar);
      })
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [aniosEmpresa.listo, ejercicio, periodo, recarga]);

  const importe = (texto: string): number | null => {
    // "12.345,67" (con coma decimal) o "12345.67".
    const limpio = texto.trim().replace(/\s|€/g, '');
    const t = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio;
    return t === '' ? null : Number(t);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje('');
    const b1 = importe(base);
    if (b1 !== null && !(b1 >= 0)) {
      setMensaje('Escribe la base en positivo, con coma para los decimales.');
      return;
    }
    try {
      const r = await apiFetch<Borrador202>(companyPath('/tax-models/202/opciones'), {
        method: 'PUT',
        body: JSON.stringify({
          ejercicio,
          periodo,
          baseManual: b1,
          domiciliar,
        }),
      });
      setB(r);
      setMensaje('Guardado.');
    } catch (err) {
      setMensaje(errorMessage(err));
    }
  };

  const presentado = b?.estado === 'presentado';
  const bloqueado = !b || b.errores.length > 0 || !b.pantalla;
  const p1 = b?.pantalla?.pagina01 ?? [];
  const solo = (ids: string[]) => p1.filter((c) => ids.includes(c.id));
  const adicionales = p1.filter((c) => /^marca|tipoGravamen|tramoIncn/.test(c.id));
  const modalidadB = [...p1.filter((c) => c.casilla && !MODALIDAD_A.includes(c.id)), ...(b?.pantalla?.pagina02 ?? []).filter((c) => c.casilla)];
  const pagina2Datos = (b?.pantalla?.pagina02 ?? []).filter((c) => ['complementaria', 'justificanteAnterior', 'iban'].includes(c.id));

  const origenBase = (x: Borrador202['base']) =>
    x.origen === 'manual'
      ? `Indicada a mano (cuota del 200 de ${x.ejercicio200})`
      : x.origen === 'modelo200'
        ? `Cuota líquida menos retenciones del 200 de ${x.ejercicio200} presentado en la app`
        : `No hay 200 de ${x.ejercicio200}: indica la base a mano`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/fiscal" className="mb-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Modelo 202 – Pago fraccionado de Sociedades</h1>
        <p className="mt-2 text-slate-600">
          El 18 % de la cuota del último Impuesto sobre Sociedades presentado. Se paga en abril, octubre y diciembre. Lo que ves es lo que lleva el fichero para la sede de la AEAT.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <SelectorAnio id="m202-ej" valor={ejercicio} anios={anios} onChange={(a) => a !== null && setEjercicio(a)} />
        <div>
          <label htmlFor="m202-pe" className="block text-sm font-medium text-slate-700">
            Periodo
          </label>
          <select id="m202-pe" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {PERIODOS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {cargando && !b ? (
        <CargandoModelo />
      ) : error ? (
        <ErrorModelo mensaje={error} />
      ) : (
        b && (
          <div className={`space-y-6 ${cargando ? 'opacity-60' : ''}`}>
            <AvisosBorrador errores={b.errores} avisos={b.avisos} />

            <Seccion
              titulo={`Modalidad A – ${b.periodo} de ${b.ejercicio}`}
              extra={<span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">{b.estadoTexto ?? ESTADO_MODELO[b.estado] ?? b.estado}</span>}
            >
              <p className="text-sm text-slate-600">
                Base: {origenBase(b.base)}.{' '}
                {b.cifraNegociosAnterior !== null && <>Cifra de negocios de {b.ejercicio - 1}: {eur(b.cifraNegociosAnterior)}.</>}
              </p>
              {b.pantalla && <CamposRegistro campos={solo(MODALIDAD_A)} />}
            </Seccion>

            {b.pantalla && (
              <>
                <Seccion titulo="Identificación y devengo">
                  <CamposRegistro campos={solo(IDENTIFICACION)} />
                </Seccion>
                <Seccion titulo="Datos adicionales">
                  <CamposRegistro campos={adicionales} />
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <strong>Tipo de gravamen: por confirmar.</strong> Ni el diseño de registro ni las instrucciones de la AEAT dicen cómo se escriben los tipos en el fichero
                    (en el formulario se eligen en un desplegable). Al importar el fichero en la sede, comprueba que el tipo que sale es el correcto y cámbialo si no.
                  </p>
                </Seccion>
                {pagina2Datos.some((c) => String(c.valor).trim()) && (
                  <Seccion titulo="Complementaria y domiciliación">
                    <CamposRegistro campos={pagina2Datos} />
                  </Seccion>
                )}
                <details className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
                  <summary className="cursor-pointer font-semibold text-slate-900">Casillas de la modalidad B (a cero en la modalidad A)</summary>
                  <div className="mt-4">
                    <CamposRegistro campos={modalidadB} />
                  </div>
                </details>
              </>
            )}

            {!presentado && (
              <Seccion titulo="Datos de esta declaración">
                <form onSubmit={guardar} className="space-y-4">
                  <div className="max-w-sm">
                    <label htmlFor="m202-base" className="block text-sm font-medium text-slate-700">
                      Base a mano [01]
                    </label>
                    <input id="m202-base" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder="Vacío = la del 200 de la app" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <p className="mt-1 text-xs text-slate-500">
                      Si el 200 de {b.base.ejercicio200} se presentó fuera de la app: su cuota íntegra menos deducciones, bonificaciones, retenciones e ingresos a cuenta.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={domiciliar} onChange={(e) => setDomiciliar(e.target.checked)} />
                    Domiciliar el pago en la cuenta bancaria de la empresa
                  </label>
                  {b.opciones.complementaria && (
                    <p className="text-sm text-slate-600">
                      Complementaria de la presentada con el justificante <span className="font-mono">{b.opciones.justificanteAnterior}</span>: la casilla [02] lleva lo ya ingresado (
                      {(b.opciones.resultadoAnterior ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}).
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Guardar
                    </button>
                    {mensaje && <span className="text-sm text-slate-600">{mensaje}</span>}
                  </div>
                </form>
              </Seccion>
            )}

            <DescargarFichero ruta={companyPath(`/tax-models/202/fichero?ejercicio=${ejercicio}&periodo=${periodo}`)} nombre={`202_${ejercicio}_${periodo}.txt`} bloqueado={bloqueado} />
            <Declaraciones codigo="202" ejercicio={ejercicio} periodo={periodo} recarga={recarga} onCambio={() => setRecarga((n) => n + 1)} />
          </div>
        )
      )}
    </div>
  );
}
