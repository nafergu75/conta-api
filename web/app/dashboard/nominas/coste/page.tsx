'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileXls } from '@phosphor-icons/react';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { Alerta, Avisos, botonSecundario, CabeceraNominas, Dato, eur, num, pagina, permisosNominas, SinPermiso } from '../comun';

/**
 * Coste de personal del ejercicio por mes o por trabajador: bruto, dietas,
 * indemnizaciones y SS a cargo de la empresa (lo que va a las 640, 641 y 642).
 * Sin las nominas anuladas; las de borrador cuentan, con aviso.
 */

interface FilaCoste {
  clave: string;
  etiqueta: string;
  mes?: number;
  nif?: string;
  nominas: number;
  trabajadores: number;
  bruto: number;
  dietas: number;
  indemnizaciones: number;
  ssEmpresa: number;
  ingresosACuentaNoRepercutidos: number;
  costeEmpresa: number;
  especie: number;
  ssTrabajador: number;
  irpf: number;
  liquido: number;
  borradores: number;
}

interface InformeCoste {
  ejercicio: number;
  agrupar: 'mes' | 'empleado';
  filas: FilaCoste[];
  totales: FilaCoste;
  avisos: string[];
}

type Agrupar = 'mes' | 'empleado';

export default function CostePersonalPage() {
  const { leer } = permisosNominas();
  const anioActual = new Date().getFullYear();
  const [ejercicio, setEjercicio] = useState(anioActual);
  const [agrupar, setAgrupar] = useState<Agrupar>('mes');
  const [inf, setInf] = useState<InformeCoste | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setInf(await apiFetch<InformeCoste>(companyPath(`/nominas/informes/coste?ejercicio=${ejercicio}&agrupar=${agrupar}`)));
    } catch (e) {
      setInf(null);
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, [ejercicio, agrupar]);

  useEffect(() => {
    if (leer) cargar();
  }, [cargar, leer]);

  const excel = async () => {
    try {
      await apiDownload(companyPath(`/nominas/informes/coste?ejercicio=${ejercicio}&agrupar=${agrupar}&formato=xlsx`), `coste_personal_${ejercicio}_${agrupar}.xlsx`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!leer) {
    return (
      <div className={pagina}>
        <CabeceraNominas titulo="Coste de personal" subtitulo="Lo que cuesta la plantilla a la empresa." />
        <SinPermiso />
      </div>
    );
  }

  const t = inf?.totales;
  const conIndemnizaciones = !!t && (t.indemnizaciones > 0 || t.dietas > 0);
  const conIngresos = !!t && t.ingresosACuentaNoRepercutidos > 0;
  const filas = inf?.filas ?? [];
  const anios = [anioActual + 1, anioActual, anioActual - 1, anioActual - 2, anioActual - 3];

  return (
    <div className={pagina}>
      <CabeceraNominas
        titulo="Coste de personal"
        subtitulo="Bruto, indemnizaciones y Seguridad Social a cargo de la empresa, por mes de devengo o por trabajador."
        acciones={
          <button type="button" onClick={excel} disabled={!inf || !inf.totales.nominas} className={botonSecundario}>
            <FileXls size={16} /> Descargar Excel
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="co-anio">
          Ejercicio
        </label>
        <select id="co-anio" value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Agrupar">
          {(
            [
              ['mes', 'Por mes'],
              ['empleado', 'Por trabajador'],
            ] as Array<[Agrupar, string]>
          ).map(([k, texto]) => (
            <button
              key={k}
              type="button"
              aria-pressed={agrupar === k}
              onClick={() => setAgrupar(k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${agrupar === k ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {error && <Alerta tipo="error">{error}</Alerta>}

      {t && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dato titulo="Coste empresa" valor={eur.format(t.costeEmpresa)} nota={`${t.nominas} ${t.nominas === 1 ? 'nómina' : 'nóminas'}`} />
          <Dato titulo="Bruto" valor={eur.format(t.bruto)} />
          <Dato titulo="SS empresa" valor={eur.format(t.ssEmpresa)} nota={t.bruto ? `${num.format((t.ssEmpresa / t.bruto) * 100)} % del bruto` : undefined} />
          <Dato titulo="Trabajadores" valor={t.trabajadores} />
        </div>
      )}
      {inf && <Avisos avisos={inf.avisos} />}

      <div className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">{agrupar === 'mes' ? 'Mes' : 'Trabajador'}</th>
              <th className="px-4 py-3 text-right font-medium">{agrupar === 'mes' ? 'Trabajadores' : 'Nóminas'}</th>
              <th className="px-4 py-3 text-right font-medium">Bruto</th>
              {conIndemnizaciones && <th className="px-4 py-3 text-right font-medium">Dietas e indemn.</th>}
              <th className="px-4 py-3 text-right font-medium">SS empresa</th>
              {conIngresos && <th className="px-4 py-3 text-right font-medium">Ingresos a cuenta</th>}
              <th className="px-4 py-3 text-right font-medium">Coste empresa</th>
              <th className="px-4 py-3 text-right font-medium">Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando && !inf ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Cargando...
                </td>
              </tr>
            ) : !t || t.nominas === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No hay nóminas en {ejercicio}.
                </td>
              </tr>
            ) : (
              filas.map((f) => {
                const vacia = f.nominas === 0;
                return (
                  <tr key={f.clave} className={vacia ? 'text-slate-400' : ''}>
                    <td className="px-4 py-2">
                      <span className={vacia ? '' : 'text-slate-900'}>{f.etiqueta}</span>
                      {f.nif && <span className="block font-mono text-xs text-slate-500">{f.nif}</span>}
                      {f.borradores > 0 && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{f.borradores} en borrador</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{vacia ? '' : agrupar === 'mes' ? f.trabajadores : f.nominas}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{vacia ? '' : num.format(f.bruto)}</td>
                    {conIndemnizaciones && <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{vacia || !(f.dietas + f.indemnizaciones) ? '' : num.format(f.dietas + f.indemnizaciones)}</td>}
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{vacia ? '' : num.format(f.ssEmpresa)}</td>
                    {conIngresos && <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{vacia || !f.ingresosACuentaNoRepercutidos ? '' : num.format(f.ingresosACuentaNoRepercutidos)}</td>}
                    <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums text-slate-900">{vacia ? '—' : num.format(f.costeEmpresa)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{vacia ? '' : num.format(f.liquido)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {t && t.nominas > 0 && (
            <tfoot className="bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-2">Total {ejercicio}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{agrupar === 'mes' ? t.trabajadores : t.nominas}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{num.format(t.bruto)}</td>
                {conIndemnizaciones && <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{num.format(t.dietas + t.indemnizaciones)}</td>}
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{num.format(t.ssEmpresa)}</td>
                {conIngresos && <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{num.format(t.ingresosACuentaNoRepercutidos)}</td>}
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{num.format(t.costeEmpresa)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{num.format(t.liquido)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Coste empresa = bruto + dietas + indemnizaciones + SS a cargo de la empresa + ingresos a cuenta de la especie que asume la empresa. La especie en sí no se suma: su gasto entra con la factura del proveedor.
      </p>
    </div>
  );
}
