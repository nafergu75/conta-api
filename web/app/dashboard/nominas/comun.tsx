'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CaretLeft, CaretRight, CheckCircle, LockKey, X, XCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';

/**
 * Piezas comunes de las pantallas de nominas: tipos de la API, formatos,
 * estado de cada nomina, selector de mes, ventana modal y medio de pago.
 * Solo admin y contable (nominas:read / nominas:write).
 */

// ---------------------------------------------------------------------------
// Tipos (los de la API: /companies/:id/nominas y /empleados)
// ---------------------------------------------------------------------------

export interface Importes {
  brutoDinerario: number;
  dietasExentas: number;
  especieValoracion: number;
  ingresoACuenta: number;
  ingresoACuentaRepercutido: boolean;
  indemnizacionExenta: number;
  indemnizacionSujeta: number;
  ssTrabajador: number;
  irpf: number;
  anticipos: number;
  embargos: number;
  otrasDeducciones: number;
  liquido: number;
  ssEmpresa: number;
}

export interface Cuadre {
  devengado: number;
  deducido: number;
  liquidoCalculado: number;
  diferencia: number;
  cuadra: boolean;
  costeEmpresa: number;
}

export type EstadoNomina = 'BORRADOR' | 'CONTABILIZADA' | 'PAGADA' | 'ANULADA';

export interface Nomina extends Importes {
  id: string;
  empleadoId: string;
  empleado?: { id: string; nif: string; nombreCompleto: string; subcuenta465: string | null; activo: boolean };
  ejercicio: number;
  mes: number;
  tipo: string;
  ejercicioDevengo: number | null;
  fechaDevengo: string;
  fechaPago: string;
  porcentajeIrpf: number | null;
  estado: EstadoNomina;
  asientoId: string | null;
  asientoNumero?: string | null;
  asientoAnulacionId: string | null;
  asientoPagoId: string | null;
  asientoPagoNumero?: string | null;
  cuentaPago: string | null;
  origen: string;
  observaciones: string | null;
  cuadre: Cuadre;
}

export interface Empleado {
  id: string;
  nif: string;
  nombre: string;
  apellidos: string;
  nombreCompleto: string;
  naf: string | null;
  fechaAlta: string | null;
  fechaBaja: string | null;
  tipoContrato: string;
  jornadaParcial: boolean;
  grupoCotizacion: number | null;
  porcentajeIrpfActual: number | null;
  clave190: string;
  subclave190: string | null;
  provincia: string | null;
  anioNacimiento: number | null;
  situacionFamiliar: number | null;
  nifConyuge: string | null;
  discapacidad: number | null;
  movilidadGeografica: boolean | null;
  subcuenta465: string | null;
  activo: boolean;
  observaciones: string | null;
}

export interface Totales {
  nominas: number;
  trabajadores: number;
  brutoDinerario: number;
  especieValoracion: number;
  ssTrabajador: number;
  irpf: number;
  embargos: number;
  anticipos: number;
  liquido: number;
  ssEmpresa: number;
  costeEmpresa: number;
}

export const TIPOS_NOMINA: Array<[string, string]> = [
  ['ORDINARIA', 'Ordinaria'],
  ['EXTRA', 'Paga extra'],
  ['ATRASOS', 'Atrasos'],
  ['FINIQUITO', 'Finiquito'],
  ['COMPLEMENTARIA', 'Complementaria'],
];
export const textoTipo = (t: string) => TIPOS_NOMINA.find(([k]) => k === t)?.[1] ?? t;

export const TIPOS_CONTRATO: Array<[string, string]> = [
  ['INDEFINIDO', 'Indefinido'],
  ['TEMPORAL', 'Temporal'],
  ['FIJO_DISCONTINUO', 'Fijo discontinuo'],
  ['FORMACION', 'Formación'],
  ['OTRO', 'Otro'],
];

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

export const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const num = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fechaEs = (f: string | null | undefined) => (f ? f.split('-').reverse().join('/') : '');

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (m: number) => MESES[m - 1] ?? String(m);
export const mesCapital = (m: number) => nombreMes(m).charAt(0).toUpperCase() + nombreMes(m).slice(1);
export const periodoTexto = (ejercicio: number, mes: number) => `${nombreMes(mes)} de ${ejercicio}`;

/** Texto con decimales (coma o punto) a numero; vacio = 0. NaN si no es un numero. */
export function aNumero(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  // "1.234,56" -> 1234.56; "1234.56" -> 1234.56; "1234,5" -> 1234.5; "1.234" -> 1234
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  const normal = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  return Number(normal);
}

/** Cuadre de una nomina, igual que el servidor (en centimos, 1 centimo de tolerancia). */
export function cuadreLocal(n: Importes): Cuadre {
  const c = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100);
  const devengado = c(n.brutoDinerario) + c(n.dietasExentas) + c(n.indemnizacionExenta) + c(n.indemnizacionSujeta) + c(n.especieValoracion);
  const deducido =
    c(n.ssTrabajador) +
    c(n.irpf) +
    (n.ingresoACuentaRepercutido ? c(n.ingresoACuenta) : 0) +
    c(n.especieValoracion) +
    c(n.anticipos) +
    c(n.embargos) +
    c(n.otrasDeducciones);
  const liquidoCalculado = devengado - deducido;
  const diferencia = c(n.liquido) - liquidoCalculado;
  const coste =
    c(n.brutoDinerario) + c(n.dietasExentas) + c(n.indemnizacionExenta) + c(n.indemnizacionSujeta) + c(n.ssEmpresa) + (n.ingresoACuentaRepercutido ? 0 : c(n.ingresoACuenta));
  return {
    devengado: devengado / 100,
    deducido: deducido / 100,
    liquidoCalculado: liquidoCalculado / 100,
    diferencia: diferencia / 100,
    cuadra: Math.abs(diferencia) <= 1,
    costeEmpresa: coste / 100,
  };
}

// ---------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------

/** Lo que puede hacer el usuario en la empresa activa. El panel solo pinta tras montar, asi que se lee directo. */
export function permisosNominas() {
  const u = getUser();
  return { leer: tieneAlgunPermiso(u, ['nominas:read', 'nominas:write']), escribir: tieneAlgunPermiso(u, ['nominas:write']) };
}

export function SinPermiso() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <LockKey size={32} className="mx-auto mb-3 text-slate-400" />
      <p className="font-medium text-slate-900">No tienes acceso a las nóminas de esta empresa.</p>
      <p className="mt-1 text-sm text-slate-600">Son datos personales y salariales: solo los ven el administrador y el contable.</p>
    </div>
  );
}

/** Contenedor de cada pantalla (el layout del panel no pone margenes). */
export const pagina = 'mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8';

// ---------------------------------------------------------------------------
// Cabecera y navegacion entre las pantallas de nominas
// ---------------------------------------------------------------------------

const SECCIONES: Array<{ href: string; texto: string; escribir?: boolean }> = [
  { href: '/dashboard/nominas', texto: 'Nóminas del mes' },
  { href: '/dashboard/nominas/importar', texto: 'Importar Excel', escribir: true },
  { href: '/dashboard/nominas/empleados', texto: 'Empleados' },
  { href: '/dashboard/nominas/coste', texto: 'Coste de personal' },
];

export function CabeceraNominas({ titulo, subtitulo, acciones }: { titulo: string; subtitulo: string; acciones?: ReactNode }) {
  const pathname = usePathname();
  const { escribir } = permisosNominas();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">{titulo}</h1>
          <p className="mt-1 text-slate-600">{subtitulo}</p>
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </div>
      <nav aria-label="Secciones de nóminas" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200">
        {SECCIONES.filter((s) => escribir || !s.escribir).map((s) => {
          const activa = pathname === s.href;
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={activa ? 'page' : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${activa ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {s.texto}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas visuales
// ---------------------------------------------------------------------------

const ESTILO_ESTADO: Record<string, [string, string]> = {
  BORRADOR: ['Borrador', 'bg-slate-100 text-slate-700'],
  CONTABILIZADA: ['Contabilizada', 'bg-blue-50 text-blue-700'],
  PAGADA: ['Pagada', 'bg-emerald-50 text-emerald-700'],
  ANULADA: ['Anulada', 'bg-red-50 text-red-700'],
};

export function EstadoBadge({ estado }: { estado: string }) {
  const [texto, clase] = ESTILO_ESTADO[estado] ?? [estado, 'bg-slate-100 text-slate-700'];
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${clase}`}>{texto}</span>;
}

export function MarcaCuadre({ cuadre }: { cuadre: Cuadre }) {
  if (cuadre.cuadra) {
    return (
      <span title={cuadre.diferencia ? `Diferencia de ${eur.format(cuadre.diferencia)} por redondeo` : 'Cuadra'}>
        <CheckCircle size={18} weight="fill" className="inline text-emerald-600" aria-label="Cuadra" />
      </span>
    );
  }
  return (
    <span title={`No cuadra: diferencia de ${eur.format(cuadre.diferencia)}`} className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
      <XCircle size={18} weight="fill" className="text-red-600" aria-hidden />
      {eur.format(cuadre.diferencia)}
    </span>
  );
}

export function Dato({ titulo, valor, nota, tono = 'normal' }: { titulo: string; valor: ReactNode; nota?: ReactNode; tono?: 'normal' | 'bien' | 'mal' | 'aviso' }) {
  const color = tono === 'bien' ? 'text-emerald-700' : tono === 'mal' ? 'text-red-700' : tono === 'aviso' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`mt-1 truncate text-lg font-semibold tabular-nums ${color}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}

export function Alerta({ tipo, children }: { tipo: 'error' | 'ok' | 'aviso' | 'info'; children: ReactNode }) {
  const clase =
    tipo === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tipo === 'ok'
        ? 'border-green-200 bg-green-50 text-green-800'
        : tipo === 'aviso'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-blue-200 bg-blue-50 text-blue-800';
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm ${clase}`}>
      {children}
    </div>
  );
}

/** Lista de avisos del servidor (en ambar). */
export function Avisos({ avisos }: { avisos: string[] }) {
  if (!avisos.length) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      {avisos.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
}

export const boton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
export const botonSecundario =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const botonPeligro =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50';
export const campo = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
export const etiqueta = 'block text-xs font-medium text-slate-600';

/** Ventana modal: cierra con Escape, con el boton o al pulsar fuera. */
export function Modal({ titulo, onCerrar, children, ancho = 'max-w-lg' }: { titulo: string; onCerrar: () => void; children: ReactNode; ancho?: string }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      // Va dentro de contenedores con space-y-*: sin esto hereda su margen superior y deja una franja sin tapar.
      style={{ margin: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div className={`max-h-[92dvh] w-full ${ancho} overflow-y-auto rounded-t-xl bg-white p-5 shadow-lg sm:rounded-lg sm:p-6`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selector de mes
// ---------------------------------------------------------------------------

export function SelectorMes({ ejercicio, mes, onCambiar }: { ejercicio: number; mes: number; onCambiar: (ejercicio: number, mes: number) => void }) {
  const anio = new Date().getFullYear();
  const anios = Array.from(new Set([anio + 1, anio, anio - 1, anio - 2, anio - 3, ejercicio])).sort((a, b) => b - a);
  const mover = (d: number) => {
    const t = ejercicio * 12 + (mes - 1) + d;
    onCambiar(Math.floor(t / 12), (t % 12) + 1);
  };
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => mover(-1)} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100" aria-label="Mes anterior">
        <CaretLeft size={16} />
      </button>
      <label className="sr-only" htmlFor="sel-mes">
        Mes
      </label>
      <select id="sel-mes" value={mes} onChange={(e) => onCambiar(ejercicio, Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        {MESES.map((m, i) => (
          <option key={m} value={i + 1}>
            {mesCapital(i + 1)}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="sel-anio">
        Ejercicio
      </label>
      <select id="sel-anio" value={ejercicio} onChange={(e) => onCambiar(Number(e.target.value), mes)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => mover(1)} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100" aria-label="Mes siguiente">
        <CaretRight size={16} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Medio de pago (liquidos y seguros sociales)
// ---------------------------------------------------------------------------

interface CuentaBancaria {
  id: string;
  iban: string;
  bancoNombre?: string;
  subcuentaCodigo: string;
  estado: string;
}

export interface MedioPago {
  fecha: string;
  /** '' = la primera cuenta bancaria activa; 'caja' = efectivo; si no, el id de la cuenta. */
  cuenta: string;
}

export const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Cuerpo de la peticion de pago a partir de lo elegido. */
export function cuerpoMedioPago(m: MedioPago): { fecha?: string; caja?: boolean; cuentaBancariaId?: string } {
  return { ...(m.fecha ? { fecha: m.fecha } : {}), ...(m.cuenta === 'caja' ? { caja: true } : m.cuenta ? { cuentaBancariaId: m.cuenta } : {}) };
}

export function CamposMedioPago({ valor, onCambiar }: { valor: MedioPago; onCambiar: (m: MedioPago) => void }) {
  const [cuentas, setCuentas] = useState<CuentaBancaria[] | null>(null);
  useEffect(() => {
    apiFetch<CuentaBancaria[]>(companyPath('/treasury/bank-accounts'))
      .then((c) => setCuentas((c ?? []).filter((x) => x.estado === 'activa')))
      .catch(() => setCuentas([]));
  }, []);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="pago-fecha" className={etiqueta}>
          Fecha del pago
        </label>
        <input id="pago-fecha" type="date" value={valor.fecha} onChange={(e) => onCambiar({ ...valor, fecha: e.target.value })} className={campo} required />
      </div>
      <div>
        <label htmlFor="pago-cuenta" className={etiqueta}>
          Desde
        </label>
        <select id="pago-cuenta" value={valor.cuenta} onChange={(e) => onCambiar({ ...valor, cuenta: e.target.value })} className={campo}>
          <option value="">{cuentas && cuentas.length ? 'Cuenta bancaria principal' : 'La cuenta bancaria activa'}</option>
          {(cuentas ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.bancoNombre ? `${c.bancoNombre} · ` : ''}
              {c.iban.replace(/\s/g, '').slice(-8)} ({c.subcuentaCodigo})
            </option>
          ))}
          <option value="caja">Caja, en efectivo (570)</option>
        </select>
      </div>
    </div>
  );
}
