'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bank,
  BookBookmark,
  Buildings,
  CalendarCheck,
  CheckCircle,
  Circle,
  Gear,
  ListNumbers,
  Robot,
  RocketLaunch,
  ShieldCheck,
  TreeStructure,
  WarningCircle,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { ApiError, apiFetch, companyPath } from '@/lib/api';
import { tieneAlgunPermiso } from '@/lib/auth';
import { nombrePais } from '@/lib/fiscal';
import { NOMBRE_MONEDA } from '@/lib/moneda';
import { NOMBRE_FORMA, puedeVer, type EjercicioConfig, type SerieConfig } from '@/lib/configuracion';
import { useConfiguracion } from './contexto';
import { BASE, Indice } from './indice';
import { LongitudSubcuentas } from './LongitudSubcuentas';

/**
 * Portada de Configuracion: lista de comprobacion de la puesta en marcha
 * (calculada con los GET que ya existen, en paralelo) y enlaces a las
 * pantallas que ya tienen su sitio. Un punto que el usuario no puede
 * comprobar (403) no se muestra.
 */

type EstadoPunto = 'ok' | 'pendiente' | 'error';

interface Punto {
  clave: string;
  titulo: string;
  estado: EstadoPunto;
  detalle: string;
  href: string;
  enlace: string;
}

/** null: el usuario no lo puede ver (403) o no aplica; 'error': no se ha podido comprobar. */
async function leer<T>(path: string): Promise<T | null | 'error'> {
  try {
    return await apiFetch<T>(companyPath(path));
  } catch (e) {
    return e instanceof ApiError && e.status === 403 ? null : 'error';
  }
}

const anioActual = () => new Date().getFullYear();

export default function ConfiguracionPortada() {
  const { user, listo, empresa, empresaLeida, espanola, inscribible } = useConfiguracion();
  const [puntos, setPuntos] = useState<Punto[] | null>(null);

  const verContabilidad = tieneAlgunPermiso(user, ['contabilidad:read']);
  const verTesoreria = tieneAlgunPermiso(user, ['tesoreria:read']);
  const altaCuentas = tieneAlgunPermiso(user, ['tesoreria:write']);
  const verSeries = puedeVer(user, 'series');
  const verEjercicios = puedeVer(user, 'ejercicios');
  const verImpuestos = puedeVer(user, 'impuestos');

  useEffect(() => {
    if (!listo || !empresaLeida) return;
    let vivo = true;
    const anio = anioActual();
    const moneda = String(empresa?.monedaCuenta ?? 'EUR');
    (async () => {
      const [ejercicios, series, cuentas, plan, fiscales] = await Promise.all([
        verEjercicios ? leer<EjercicioConfig[]>('/fiscal-years') : null,
        verSeries ? leer<SerieConfig[]>('/series') : null,
        verTesoreria ? leer<Array<{ estado: string; moneda?: string }>>('/treasury/bank-accounts') : null,
        verContabilidad ? leer<{ cantidad: number }>('/accounting/chart-of-accounts?nivel=1') : null,
        verImpuestos && espanola === true ? leer<{ guardado: boolean }>('/ajustes-fiscales') : null,
      ]);
      const lista: Punto[] = [];
      const noComprobado = 'No se ha podido comprobar. Vuelve a cargar la página.';

      lista.push({
        clave: 'empresa',
        titulo: 'Datos de la empresa completos',
        estado: !empresa ? 'error' : empresa.completo === false ? 'pendiente' : 'ok',
        detalle: !empresa
          ? noComprobado
          : empresa.completo === false
            ? `Faltan: ${(empresa.pendientes ?? []).join(', ')}. Salen en todas tus facturas.`
            : 'Los datos que salen en tus facturas están completos.',
        href: '/dashboard/empresa',
        enlace: 'Datos de la empresa',
      });

      if (ejercicios !== null) {
        const delAnio = ejercicios === 'error' ? undefined : ejercicios.find((e) => e.label === String(anio));
        lista.push({
          clave: 'ejercicio',
          titulo: `Ejercicio ${anio} creado y abierto`,
          estado: ejercicios === 'error' ? 'error' : delAnio?.estadoEfectivo === 'ABIERTO' ? 'ok' : 'pendiente',
          detalle:
            ejercicios === 'error'
              ? noComprobado
              : !delAnio
                ? `Todavía no has creado el ejercicio ${anio}.`
                : delAnio.estadoEfectivo === 'ABIERTO'
                  ? `El ${anio} está abierto: se pueden registrar facturas y asientos.`
                  : `El ${anio} está cerrado: no se pueden registrar facturas ni asientos con fecha de este año.`,
          href: `${BASE}/ejercicios`,
          enlace: 'Ejercicios y periodos',
        });
      }

      if (series !== null) {
        const serieLista = (tipo: string) =>
          series !== 'error' && series.some((s) => s.tipoDocumento === tipo && s.activa) && series.some((s) => s.tipoDocumento === tipo && s.activa && s.porDefecto);
        const faltan = [!serieLista('FACTURA') && 'facturas', !serieLista('RECTIFICATIVA') && 'rectificativas'].filter(Boolean);
        lista.push({
          clave: 'series',
          titulo: 'Series de facturas y de rectificativas',
          estado: series === 'error' ? 'error' : faltan.length ? 'pendiente' : 'ok',
          detalle:
            series === 'error'
              ? noComprobado
              : faltan.length
                ? `Falta una serie activa y predeterminada de ${faltan.join(' y de ')}.`
                : 'Hay una serie activa y predeterminada de cada tipo.',
          href: `${BASE}/series`,
          enlace: 'Series de numeración',
        });
      }

      if (cuentas !== null) {
        const hay = cuentas !== 'error' && cuentas.some((c) => c.estado === 'activa' && (c.moneda ?? 'EUR') === moneda);
        lista.push({
          clave: 'cuentas',
          titulo: `Cuenta bancaria activa en ${moneda}`,
          estado: cuentas === 'error' ? 'error' : hay ? 'ok' : 'pendiente',
          detalle:
            cuentas === 'error'
              ? noComprobado
              : hay
                ? 'Tus clientes ya tienen a dónde pagarte: sale en las facturas.'
                : altaCuentas
                  ? `Da de alta la cuenta del banco en ${moneda} para que salga en tus facturas.`
                  : `Pide al administrador de la empresa que dé de alta la cuenta del banco en ${moneda} para que salga en tus facturas.`,
          href: '/dashboard/tesoreria/cuentas',
          enlace: hay || altaCuentas ? 'Cuentas bancarias' : 'Ver cuentas bancarias',
        });
      }

      if (plan !== null) {
        const ok = plan !== 'error' && plan.cantidad > 0;
        lista.push({
          clave: 'plan',
          titulo: 'Plan contable preparado',
          estado: plan === 'error' ? 'error' : ok ? 'ok' : 'pendiente',
          detalle: plan === 'error' ? noComprobado : ok ? 'Las cuentas del Plan General Contable están listas.' : 'El plan contable está vacío.',
          href: '/dashboard/plan-contable',
          enlace: 'Plan contable',
        });
      }

      if (fiscales !== null) {
        lista.push({
          clave: 'fiscales',
          titulo: 'Ajustes fiscales revisados',
          estado: fiscales === 'error' ? 'error' : fiscales.guardado ? 'ok' : 'pendiente',
          detalle:
            fiscales === 'error'
              ? noComprobado
              : fiscales.guardado
                ? 'El calendario de modelos sigue tus ajustes (IVA mensual o trimestral, SII...).'
                : 'Revisa si declaras el IVA cada mes o cada trimestre: de ello depende el calendario de modelos.',
          href: `${BASE}/impuestos`,
          enlace: 'Impuestos',
        });
      }

      if (vivo) setPuntos(lista);
    })();
    return () => {
      vivo = false;
    };
  }, [listo, empresaLeida, empresa, espanola, verEjercicios, verSeries, verTesoreria, altaCuentas, verContabilidad, verImpuestos]);

  // El indice enlaza a #contabilidad: al llegar, el navegador salta al ancla
  // antes de que se rellene la lista de arriba, que luego empuja las tarjetas.
  // Cuando la lista ya esta, se vuelve a llevar el bloque a la vista.
  useEffect(() => {
    if (!puntos) return;
    try {
      if (window.location.hash === '#contabilidad') document.getElementById('contabilidad')?.scrollIntoView();
    } catch {
      // Sin acceso a la URL: no pasa nada, la pagina se ve igual.
    }
  }, [puntos]);

  const pendientes = puntos?.filter((p) => p.estado !== 'ok').length ?? 0;
  const moneda = String(empresa?.monedaCuenta ?? 'EUR');

  return (
    <>
      <div className="flex items-start gap-3">
        <Gear size={26} className="mt-1 shrink-0 text-emerald-700" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
          <p className="mt-1 text-sm text-slate-600">Ejercicios, series, facturación, impuestos y accesos de la empresa.</p>
        </div>
      </div>

      {/* Movil: el indice como lista. */}
      <div className="md:hidden">
        <Indice variante="lista" />
      </div>

      <section aria-labelledby="puesta-en-marcha" className="rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 md:px-5">
          <h2 id="puesta-en-marcha" className="font-semibold text-slate-900">
            Puesta en marcha
          </h2>
          {puntos && (
            <span className={`text-sm ${pendientes ? 'text-amber-700' : 'text-emerald-700'}`}>
              {pendientes ? `${pendientes} ${pendientes === 1 ? 'punto pendiente' : 'puntos pendientes'}` : 'Todo listo'}
            </span>
          )}
        </header>
        {!puntos ? (
          <p className="px-4 py-4 text-sm text-slate-500 md:px-5" aria-busy="true">
            Comprobando…
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {puntos.map((p) => (
              <li key={p.clave} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center md:px-5">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {p.estado === 'ok' ? (
                    <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" aria-label="Hecho" />
                  ) : p.estado === 'pendiente' ? (
                    <Circle size={22} className="mt-0.5 shrink-0 text-amber-600" aria-label="Pendiente" />
                  ) : (
                    <WarningCircle size={22} className="mt-0.5 shrink-0 text-slate-400" aria-label="Sin comprobar" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{p.titulo}</p>
                    <p className="text-sm text-slate-600">{p.detalle}</p>
                  </div>
                </div>
                <Link
                  href={p.href}
                  className="inline-flex items-center gap-1 self-start pl-9 text-sm font-medium text-emerald-700 hover:underline sm:self-center sm:pl-0"
                >
                  {p.enlace} <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Datos de la empresa: resumen y enlace (el formulario vive en su pantalla). */}
      <section aria-labelledby="empresa-resumen" className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="empresa-resumen" className="flex items-center gap-2 font-semibold text-slate-900">
            <Buildings size={20} className="text-slate-500" /> Datos de la empresa
          </h2>
          <Link href="/dashboard/empresa" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
            Ver o cambiar <ArrowRight size={14} />
          </Link>
        </div>
        {!empresaLeida ? (
          <p className="mt-3 text-sm text-slate-500">Cargando…</p>
        ) : empresa ? (
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <DatoEmpresa titulo="Denominación" valor={empresa.denominacion} />
            <DatoEmpresa titulo={espanola === false ? 'Identificación fiscal' : 'NIF'} valor={empresa.nif} />
            <DatoEmpresa titulo="País" valor={empresa.pais ? nombrePais(empresa.pais) : 'España'} />
            <DatoEmpresa titulo="Moneda de la contabilidad" valor={`${moneda} — ${NOMBRE_MONEDA[moneda] ?? moneda}`} />
            <DatoEmpresa titulo="Forma jurídica" valor={empresa.tipoSociedad ? (NOMBRE_FORMA[empresa.tipoSociedad] ?? empresa.tipoSociedad) : null} />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No se han podido leer los datos de la empresa.</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" id="contabilidad">
        {verContabilidad && (
          <Tarjeta icono={TreeStructure} titulo="Plan contable" href="/dashboard/plan-contable">
            Cuentas y subcuentas del Plan General Contable de la empresa.
          </Tarjeta>
        )}
        {tieneAlgunPermiso(user, ['contabilidad:write']) && (
          <Tarjeta icono={RocketLaunch} titulo="Puesta en marcha" href="/dashboard/contabilidad/puesta-en-marcha">
            Importa el balance de apertura y los saldos que traes de otro programa.
          </Tarjeta>
        )}
        {verContabilidad && (
          <Tarjeta icono={CalendarCheck} titulo="Cierre y traspaso de saldos" href="/dashboard/contabilidad/cierre-ejercicio">
            Regularización, cierre del ejercicio y apertura del siguiente. Aquí también se deshace un cierre.
          </Tarjeta>
        )}
        {tieneAlgunPermiso(user, ['tesoreria:read', 'tesoreria:write']) && (
          <Tarjeta icono={Bank} titulo="Cuentas bancarias" href="/dashboard/tesoreria/cuentas">
            Las cuentas de la empresa. La que elijas en Facturación sale en tus facturas.
          </Tarjeta>
        )}
        {inscribible && verContabilidad && (
          <Tarjeta icono={BookBookmark} titulo="Registro Mercantil" href="/dashboard/registro-mercantil">
            Legalización de libros y depósito de las cuentas anuales.
          </Tarjeta>
        )}
        {verSeries && (
          <Tarjeta icono={ListNumbers} titulo="Series de numeración" href={`${BASE}/series`}>
            Series de facturas, rectificativas y proformas, con su próximo número.
          </Tarjeta>
        )}
        {tieneAlgunPermiso(user, ['admin:empresa']) && (
          <Tarjeta icono={Robot} titulo="Inteligencia artificial de Carmen" href="/dashboard/empresa#carmen-ia">
            Activa o desactiva la IA del asistente en esta empresa y mira el gasto del mes.
          </Tarjeta>
        )}
        {user?.esAdminGlobal && (
          <Tarjeta icono={ShieldCheck} titulo="Administración global" href="/dashboard/admin">
            Todas las empresas y usuarios de la plataforma: altas, accesos y roles.
          </Tarjeta>
        )}
      </div>

      {verContabilidad && <LongitudSubcuentas puedeEditar={tieneAlgunPermiso(user, ['contabilidad:write'])} />}
    </>
  );
}

function DatoEmpresa({ titulo, valor }: { titulo: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{titulo}</dt>
      <dd className="truncate text-slate-900">{valor || <span className="text-amber-700">Sin rellenar</span>}</dd>
    </div>
  );
}

function Tarjeta({ icono: Icono, titulo, href, children }: { icono: Icon; titulo: string; href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50">
      <Icono size={22} className="mt-0.5 shrink-0 text-emerald-700" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
          {titulo} <ArrowRight size={14} className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className="mt-0.5 block text-sm text-slate-600">{children}</span>
      </span>
    </Link>
  );
}
