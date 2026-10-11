'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { trimestreAPresentar, ejerciciosSeleccionables } from '@/lib/aeatCalendar';
import { CaretLeft, Download, WarningCircle } from '@phosphor-icons/react';
import { Casillas303, type Casilla303 } from '../components/Casillas303';
import { AvisosModelo } from '../components/AvisosModelo';
import { FormPresentar } from '../components/FormPresentar';
import { Tooltip } from '../components/Tooltip';

type TipoDeclaracion = 'I' | 'U' | 'C' | 'D' | 'N';

interface Modelo303 {
  id: string;
  ejercicio: number;
  trimestre: number;
  ivaRepercutido: { total: number; desglose: any[] };
  ivaSoportado: { total: number; desglose: any[] };
  /** Resultado [71]. */
  resultado: number;
  estado: 'vigente' | 'presentado';
  casillas303: Casilla303[];
  tipoDeclaracion: TipoDeclaracion;
  tiposDeclaracion: Array<{ codigo: TipoDeclaracion; nombre: string }>;
  aCompensar: { importe: number; origen: 'manual' | 'periodo-anterior' | 'sin-dato'; periodo?: string; estado?: string };
  cuentas: Array<{ id: string; iban: string; banco: string | null }>;
  cuentaBancariaId: string | null;
  sinActividad: boolean;
  errores: string[];
  advertencias: string[];
}

/** Lo que elige la persona; vacío = lo que propone el servidor. */
interface Opciones {
  tipoDeclaracion: string;
  aCompensar: string;
  cuentaBancariaId: string;
}

const SIN_OPCIONES: Opciones = { tipoDeclaracion: '', aCompensar: '', cuentaBancariaId: '' };

/** Query del borrador: la misma para la pantalla y para el fichero, así salen iguales. */
function queryOpciones(o: Opciones): string {
  const q = new URLSearchParams();
  if (o.tipoDeclaracion) q.set('tipoDeclaracion', o.tipoDeclaracion);
  if (o.aCompensar.trim()) q.set('aCompensar', o.aCompensar.trim().replace(',', '.'));
  if (o.cuentaBancariaId) q.set('cuentaBancariaId', o.cuentaBancariaId);
  const s = q.toString();
  return s ? `&${s}` : '';
}

const TITULO_RESULTADO: Record<TipoDeclaracion, string> = {
  I: 'A ingresar',
  U: 'A ingresar (domiciliado)',
  C: 'A compensar',
  D: 'A devolver',
  N: 'Sin actividad o resultado cero',
};

export default function Modelo303Page() {
  const [modelo, setModelo] = useState<Modelo303 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avisoDescarga, setAvisoDescarga] = useState('');
  // Se abre en el trimestre que toca presentar (en octubre, el 3T).
  const [ejercicio, setEjercicio] = useState(() => trimestreAPresentar().ejercicio);
  const [trimestre, setTrimestre] = useState(() => trimestreAPresentar().trimestre);
  const [opciones, setOpciones] = useState<Opciones>(SIN_OPCIONES);
  const [compensarEscrito, setCompensarEscrito] = useState('');

  useEffect(() => {
    const fetchModelo = async () => {
      try {
        setLoading(true);
        setError('');
        setModelo(
          await apiFetch<Modelo303>(companyPath(`/tax-models/303?ejercicio=${ejercicio}&trimestre=${trimestre}${queryOpciones(opciones)}`)),
        );
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchModelo();
  }, [ejercicio, trimestre, opciones]);

  // Al cambiar de periodo se vuelve a lo que propone el servidor.
  const cambiarPeriodo = (cambio: () => void) => {
    cambio();
    setOpciones(SIN_OPCIONES);
    setCompensarEscrito('');
  };

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const descargarAEAT = async () => {
    setAvisoDescarga('');
    try {
      await apiDownload(
        companyPath(`/tax/export/modelo-303?period=Q${trimestre}-${ejercicio}&format=txt${queryOpciones(opciones)}`),
        `modelo-303-${trimestre}T-${ejercicio}.txt`,
      );
    } catch (err) {
      setAvisoDescarga(errorMessage(err));
    }
  };

  const aplicarCompensar = () => {
    if (compensarEscrito.trim() === opciones.aCompensar.trim()) return;
    setOpciones((o) => ({ ...o, aCompensar: compensarEscrito, tipoDeclaracion: '' }));
  };

  if (loading && !modelo) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-96 animate-pulse rounded-lg bg-slate-200" />
      </div>
    );
  }

  if (!modelo) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-800">{error || 'Modelo no encontrado'}</p>
        </div>
      </div>
    );
  }

  const tipo = modelo.tipoDeclaracion;
  const aIngresar = tipo === 'I' || tipo === 'U';
  const conCuenta = tipo === 'U' || tipo === 'D';
  const origenCompensar =
    modelo.aCompensar.origen === 'periodo-anterior'
      ? `Sale del 303 del ${modelo.aCompensar.periodo}${modelo.aCompensar.estado === 'presentado' ? ' (presentado)' : ' (sin presentar)'}.`
      : modelo.aCompensar.origen === 'manual'
        ? 'Importe puesto a mano.'
        : 'No hay un 303 anterior guardado: si tienes cuotas pendientes de compensar, escríbelas aquí.';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Modelo 303 – IVA Trimestral</h1>
        <p className="mt-2 text-slate-600">
          Borrador con el diseño de registro 2026 de la AEAT. El fichero se importa en el formulario del 303 de la sede.
        </p>
      </div>

      {/* Período y datos de la declaración */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="ejercicio-303" className="block text-sm font-medium text-slate-700">Ejercicio</label>
          <select
            id="ejercicio-303"
            value={ejercicio}
            onChange={(e) => cambiarPeriodo(() => setEjercicio(parseInt(e.target.value)))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ejerciciosSeleccionables().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="trimestre-303" className="block text-sm font-medium text-slate-700">Trimestre</label>
          <select
            id="trimestre-303"
            value={trimestre}
            onChange={(e) => cambiarPeriodo(() => setTrimestre(parseInt(e.target.value)))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                {t}T
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tipo-303" className="block text-sm font-medium text-slate-700">Tipo de declaración</label>
          <select
            id="tipo-303"
            value={tipo}
            disabled={modelo.estado === 'presentado'}
            onChange={(e) => setOpciones((o) => ({ ...o, tipoDeclaracion: e.target.value }))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {modelo.tiposDeclaracion.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} · {t.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[14rem] flex-1">
          <label htmlFor="compensar-303" className="flex items-center gap-2 text-sm font-medium text-slate-700">
            Cuotas a compensar de periodos anteriores [110]
            <Tooltip text="Lo que quedó a tu favor en otros 303 y todavía no has compensado. Se aplica en [78] hasta dejar el resultado a cero; lo que sobra pasa a [87]." />
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="compensar-303"
              inputMode="decimal"
              placeholder={eur.format(modelo.aCompensar.importe)}
              value={compensarEscrito}
              disabled={modelo.estado === 'presentado'}
              onChange={(e) => setCompensarEscrito(e.target.value)}
              onBlur={aplicarCompensar}
              onKeyDown={(e) => e.key === 'Enter' && aplicarCompensar()}
              className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {opciones.aCompensar && (
              <button
                type="button"
                onClick={() => {
                  setCompensarEscrito('');
                  setOpciones((o) => ({ ...o, aCompensar: '', tipoDeclaracion: '' }));
                }}
                className="text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                Usar el del 303 anterior
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">{origenCompensar}</p>
        </div>

        {conCuenta && (
          <div>
            <label htmlFor="cuenta-303" className="block text-sm font-medium text-slate-700">
              {tipo === 'U' ? 'Cuenta para domiciliar' : 'Cuenta para la devolución'}
            </label>
            {modelo.cuentas.length ? (
              <select
                id="cuenta-303"
                value={modelo.cuentaBancariaId ?? ''}
                onChange={(e) => setOpciones((o) => ({ ...o, cuentaBancariaId: e.target.value }))}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {modelo.cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.iban}
                    {c.banco ? ` · ${c.banco}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm text-slate-600">La empresa no tiene cuentas bancarias activas.</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* Resumen rápido: [27], [45] y [71] */}
      <div className={`grid grid-cols-1 gap-4 md:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <p className="text-sm text-slate-600">Total cuota devengada [27]</p>
            <Tooltip text="IVA de tus ventas del trimestre, más el que autoliquidas por compras a otros países de la UE o con inversión del sujeto pasivo." />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{eur.format(modelo.ivaRepercutido.total)}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <p className="text-sm text-slate-600">Total a deducir [45]</p>
            <Tooltip text="IVA de tus compras y gastos deducibles del trimestre." />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{eur.format(modelo.ivaSoportado.total)}</p>
        </div>

        <div className={`rounded-lg border-2 p-6 ${aIngresar ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
          <div className="flex items-center gap-2">
            <p className={`text-sm ${aIngresar ? 'text-amber-700' : 'text-green-700'}`}>
              {TITULO_RESULTADO[tipo]} · resultado [71]
            </p>
          </div>
          <p className={`mt-2 text-2xl font-bold ${aIngresar ? 'text-amber-900' : 'text-green-900'}`}>
            {eur.format(Math.abs(modelo.resultado))}
          </p>
          {modelo.sinActividad && <p className="mt-1 text-xs text-slate-600">Se marca «Declaración sin actividad».</p>}
        </div>
      </div>

      {modelo.errores.length > 0 && (
        <div role="alert" className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="flex items-center gap-2 font-medium">
            <WarningCircle size={18} aria-hidden /> Para descargar el fichero falta:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            {modelo.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <AvisosModelo avisos={modelo.advertencias} ejercicio={modelo.ejercicio} />

      {/* Casillas oficiales: las mismas que el fichero */}
      <Casillas303 casillas={modelo.casillas303} />

      {/* Desglose de Facturas */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Facturas Emitidas (Repercutido)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left py-2">NIF</th>
                  <th className="text-right py-2">Base</th>
                  <th className="text-right py-2">Cuota</th>
                </tr>
              </thead>
              <tbody>
                {modelo.ivaRepercutido.desglose.slice(0, 5).map((f: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2">{new Date(f.fecha).toLocaleDateString('es-ES')}</td>
                    <td className="py-2 truncate">{f.nif}</td>
                    <td className="text-right py-2">{eur.format(f.base)}</td>
                    <td className="text-right py-2 font-medium">{eur.format(f.cuota)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {modelo.ivaRepercutido.desglose.length > 5 && (
            <p className="mt-2 text-xs text-slate-500">
              ... y {modelo.ivaRepercutido.desglose.length - 5} facturas más
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Facturas Recibidas (Soportado)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left py-2">NIF</th>
                  <th className="text-right py-2">Base</th>
                  <th className="text-right py-2">Cuota</th>
                </tr>
              </thead>
              <tbody>
                {modelo.ivaSoportado.desglose.slice(0, 5).map((f: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2">{new Date(f.fecha).toLocaleDateString('es-ES')}</td>
                    <td className="py-2 truncate">{f.nif}</td>
                    <td className="text-right py-2">{eur.format(f.base)}</td>
                    <td className="text-right py-2 font-medium">{eur.format(f.cuota)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {modelo.ivaSoportado.desglose.length > 5 && (
            <p className="mt-2 text-xs text-slate-500">
              ... y {modelo.ivaSoportado.desglose.length - 5} facturas más
            </p>
          )}
        </div>
      </div>

      {/* Acciones Finales */}
      <div className="space-y-4">
        {/* Botón de Descarga AEAT */}
        {modelo.estado === 'vigente' && (
          <>
            <button
              onClick={descargarAEAT}
              disabled={modelo.errores.length > 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={18} />
              Descargar fichero para la sede de la AEAT (TXT)
            </button>
            {avisoDescarga && (
              <p role="status" className="mt-2 text-sm text-amber-700">{avisoDescarga}</p>
            )}
          </>
        )}

        {/* Formulario de Presentación */}
        {modelo.estado === 'vigente' && (
          <FormPresentar codigo="303" ejercicio={ejercicio} trimestre={trimestre} />
        )}
      </div>
    </div>
  );
}
