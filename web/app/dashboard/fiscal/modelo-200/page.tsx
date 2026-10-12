'use client';

import { useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/api';
import { ejercicioAnualAPresentar } from '@/lib/aeatCalendar';
import { Declaraciones } from '../components/Declaraciones';
import {
  CabeceraBorrador,
  Cargando,
  Cifra,
  DescargarFichero,
  ErrorCarga,
  ErroresYAvisos,
  eur,
  PaginaCasillas,
  rutaBorrador,
  SelectorEjercicio,
  type PaginaBorrador,
} from '../components/BorradorAeat';

interface Borrador200 {
  ejercicio: number;
  diseno: string;
  revisar: string;
  paginas: PaginaBorrador[];
  liquidacion: {
    resultadoContable: number;
    resultadoAntesImpuestos: number;
    basePrevia: number;
    compensacionBins: number;
    baseImponible: number;
    tipo: { codigo: string; descripcion: string };
    cuotaIntegra: number;
    cuotaLiquida: number;
    retenciones: number;
    pagosFraccionados: number;
    cuotaDiferencial: number;
    resultado: number;
    tipoDeclaracion: 'I' | 'N' | 'D';
    binsGeneradas: number;
  };
  paginasPendientes: Array<{ codigo: string; motivo: string }>;
  advertencias: string[];
  errores: string[];
}

interface Datos {
  bins: string;
  pf1: string;
  pf2: string;
  pf3: string;
  retenciones: string;
  nuevaCreacion: boolean;
}

const VACIO: Datos = { bins: '', pf1: '', pf2: '', pf3: '', retenciones: '', nuevaCreacion: false };

/** "1.234,56" -> "1234.56" (el backend espera el punto decimal). */
const cifra = (s: string) => (s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s).trim();
const parametrosDe = (d: Datos) => ({
  bins: cifra(d.bins),
  pf1: cifra(d.pf1),
  pf2: cifra(d.pf2),
  pf3: cifra(d.pf3),
  retenciones: cifra(d.retenciones),
  nuevaCreacion: d.nuevaCreacion ? 1 : undefined,
});

/** Lo mismo como texto, para guardarlo con lo presentado. */
const opcionesDe = (d: Datos): Record<string, string> =>
  Object.fromEntries(Object.entries(parametrosDe(d)).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));

const tipo = (v: number | string) => {
  const s = String(v).padStart(4, '0');
  const [a, b] = [Number(s.slice(0, 2)), Number(s.slice(2))];
  return b ? `${a} % y ${b} %` : `${a} %`;
};
const personas = (v: number | string) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2 });
const FORMATO = { '00558': tipo, '00041': personas, '00042': personas };

const RESULTADO: Record<string, string> = { I: 'A ingresar', N: 'Resultado cero', D: 'A devolver' };

/** Páginas que una pyme suele necesitar y que la app aún no rellena. */
const CLAVE_PYME = new Set(['02000', '09000', '10000', '11000', '13000', '15000', '20B00', '20D00']);

export default function Modelo200Page() {
  // Modelo anual: se presenta por el ejercicio anterior.
  const [ejercicio, setEjercicio] = useState(ejercicioAnualAPresentar);
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [aplicados, setAplicados] = useState<Datos>(VACIO);
  const [borrador, setBorrador] = useState<Borrador200 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verResto, setVerResto] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const parametros = parametrosDe(aplicados);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError('');
    apiFetch<Borrador200>(rutaBorrador('200', ejercicio, parametrosDe(aplicados)))
      .then((b) => vivo && setBorrador(b))
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [ejercicio, aplicados, recarga]);

  if (loading && !borrador) return <Cargando />;
  if (error && !borrador) return <ErrorCarga mensaje={error} />;
  if (!borrador) return <ErrorCarga mensaje="No se ha podido preparar el borrador." />;

  const b = borrador;
  const l = b.liquidacion;
  const clave = b.paginasPendientes.filter((p) => CLAVE_PYME.has(p.codigo));
  const resto = b.paginasPendientes.filter((p) => !CLAVE_PYME.has(p.codigo));
  const campo = (k: keyof Datos, etiqueta: string, ayuda?: string) => (
    <label className="block text-sm font-medium text-slate-700">
      {etiqueta}
      <input
        value={String(datos[k])}
        onChange={(e) => setDatos({ ...datos, [k]: e.target.value })}
        inputMode="decimal"
        placeholder="0,00"
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {ayuda && <span className="mt-1 block text-xs font-normal text-slate-500">{ayuda}</span>}
    </label>
  );

  return (
    <div className="space-y-6">
      <CabeceraBorrador
        titulo="Modelo 200 · Impuesto sobre Sociedades (borrador)"
        subtitulo="Borrador a partir de las cuentas anuales que calcula la app, con el balance y la cuenta de pérdidas y ganancias del modelo PYMES."
        diseno={`Diseño oficial de la AEAT, versión ${b.diseno}. ${b.revisar}`}
      />

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <SelectorEjercicio ejercicio={ejercicio} onChange={setEjercicio} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={datos.nuevaCreacion} onChange={(e) => setDatos({ ...datos, nuevaCreacion: e.target.checked })} />
            Entidad de nueva creación (tipo del 15 %)
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campo('bins', 'Bases negativas de años anteriores pendientes', 'Se compensan con el límite del art. 26 LIS [00547].')}
          {campo('retenciones', 'Retenciones e ingresos a cuenta [01766]')}
          {campo('pf1', 'Primer pago fraccionado (abril) [00601]')}
          {campo('pf2', 'Segundo pago fraccionado (octubre) [00603]')}
          {campo('pf3', 'Tercer pago fraccionado (diciembre) [00605]')}
        </div>
        <button
          type="button"
          onClick={() => setAplicados(datos)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Recalcular con estos datos
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <ErroresYAvisos errores={b.errores} advertencias={b.advertencias} ejercicio={ejercicio} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="[00500] Resultado de la cuenta de PyG" valor={eur.format(l.resultadoContable)} />
        <Cifra etiqueta="[00501] Resultado antes del impuesto" valor={eur.format(l.resultadoAntesImpuestos)} />
        <Cifra etiqueta="[00547] Bases negativas compensadas" valor={eur.format(l.compensacionBins)} />
        <Cifra etiqueta="[00552] Base imponible" valor={eur.format(l.baseImponible)} nota={l.binsGeneradas ? `Base negativa a compensar en años siguientes: ${eur.format(l.binsGeneradas)}` : undefined} />
        <Cifra etiqueta="[00558] Tipo de gravamen" valor={tipo(l.tipo.codigo)} nota={l.tipo.descripcion} />
        <Cifra etiqueta="[00562] Cuota íntegra" valor={eur.format(l.cuotaIntegra)} />
        <Cifra etiqueta="Retenciones y pagos fraccionados" valor={eur.format(l.retenciones + l.pagosFraccionados)} />
        <Cifra etiqueta="[00621] Resultado" valor={eur.format(l.resultado)} nota={RESULTADO[l.tipoDeclaracion]} />
      </div>

      <div className="space-y-3">
        {b.paginas.map((p) => (
          <PaginaCasillas key={p.codigo} pagina={p} formato={FORMATO} />
        ))}
      </div>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <h2 className="font-semibold">Qué queda por completar en Sociedades WEB</h2>
        <p className="mt-1">
          Esto es un borrador, no la declaración completa: no se presenta tal cual. El fichero lleva las páginas de arriba. Al importarlo en Sociedades WEB, revisa y
          completa estas otras, que la app todavía no rellena, y presenta desde allí:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {clave.map((p) => (
            <li key={p.codigo}>
              <span className="font-mono">{p.codigo}</span>: {p.motivo}
            </li>
          ))}
        </ul>
        {resto.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={() => setVerResto(!verResto)} className="font-medium underline">
              {verResto ? 'Ocultar' : 'Ver'} las otras {resto.length} páginas del modelo (regímenes especiales, que no aplican a una pyme normal)
            </button>
            {verResto && <p className="mt-2 font-mono text-xs">{resto.map((p) => p.codigo).join(', ')}</p>}
          </div>
        )}
      </section>

      <div className="space-y-4">
        <DescargarFichero ruta={rutaBorrador('200', ejercicio, parametros, true)} nombre={`200_${ejercicio}.txt`} bloqueado={b.errores.length > 0} texto="Descargar borrador para Sociedades WEB" />
        <p className="text-xs text-slate-500">La persona de contacto y el teléfono para incidencias son los de Más &gt; Datos de la empresa, apartado Contacto.</p>
        <Declaraciones codigo="200" ejercicio={ejercicio} opcionesPresentar={opcionesDe(aplicados)} recarga={recarga} onCambio={() => setRecarga((n) => n + 1)} />
      </div>
    </div>
  );
}
