'use client';

import { useEffect, useState } from 'react';
import { EVENTO_SESION, getUser, tieneAlgunPermiso, type Areas, type SessionUser } from './auth';

/**
 * Piezas comunes de Configuracion (/dashboard/configuracion): quien puede
 * cambiar cada bloque y los datos que devuelve el backend. Los permisos se
 * piden con tieneAlgunPermiso, la misma regla que authorize en el servidor:
 * el administrador ('*') lo puede todo y cada area la edita su responsable.
 */

/** Usuario de la sesion, leido tras montar y al cambiar sus permisos (EVENTO_SESION). */
export function useUsuarioSesion(): { user: SessionUser | null; listo: boolean } {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [listo, setListo] = useState(false);
  useEffect(() => {
    setUser(getUser());
    setListo(true);
    const alActualizar = () => setUser(getUser());
    window.addEventListener(EVENTO_SESION, alActualizar);
    return () => window.removeEventListener(EVENTO_SESION, alActualizar);
  }, []);
  return { user, listo };
}

/** Permisos de lectura y de edicion de cada bloque (los mismos que pide el servidor). */
export const PERMISOS_CONFIGURACION = {
  ejercicios: { ver: ['contabilidad:read'], editar: ['contabilidad:write'] },
  series: { ver: ['ventas:read', 'contabilidad:read'], editar: ['ventas:write'] },
  facturacion: { ver: ['ventas:read', 'contabilidad:read'], editar: ['ventas:write'] },
  impuestos: { ver: ['impuestos:read'], editar: ['impuestos:write'] },
  miembros: { ver: ['admin:empresa'], editar: ['admin:empresa'] },
  reabrir: { ver: ['admin:empresa'], editar: ['admin:empresa'] },
} as const;

export type BloqueConfiguracion = keyof typeof PERMISOS_CONFIGURACION;

export function puedeVer(user: SessionUser | null, bloque: BloqueConfiguracion): boolean {
  return tieneAlgunPermiso(user, [...PERMISOS_CONFIGURACION[bloque].ver]);
}

export function puedeEditar(user: SessionUser | null, bloque: BloqueConfiguracion): boolean {
  return tieneAlgunPermiso(user, [...PERMISOS_CONFIGURACION[bloque].editar]);
}

/** Quien puede cambiar cada bloque, para el aviso de solo lectura. */
export const QUIEN_EDITA: Record<'ejercicios' | 'series' | 'facturacion' | 'impuestos', string> = {
  ejercicios: 'el administrador de la empresa y quien lleva la contabilidad',
  series: 'el administrador de la empresa y quien factura (permiso de ventas)',
  facturacion: 'el administrador de la empresa y quien factura (permiso de ventas)',
  impuestos: 'el administrador de la empresa y quien lleva los impuestos',
};

// ---------------------------------------------------------------------------
// Datos del backend
// ---------------------------------------------------------------------------

export type EstadoEfectivoEjercicio = 'ABIERTO' | 'CERRADO' | 'CERRADO_SIN_ASIENTOS';

export interface EjercicioConfig {
  id: string;
  label: string;
  fechaInicio: string;
  fechaFin: string;
  estado: 'OPEN' | 'CLOSED';
  closingDate: string | null;
  legalizationDeadline: string | null;
  accountsDepositDeadline: string | null;
  asientosBloqueados?: boolean;
  tieneAsientosCierre: boolean;
  estadoEfectivo: EstadoEfectivoEjercicio;
  /** Solo en los cerrados sin asientos: si el servidor deja reabrirlo. */
  puedeReabrir?: boolean;
  /** Por que no se puede reabrir (ya cerrado uno posterior, o sin asientos). */
  motivoNoReabrir?: string | null;
}

export interface PeriodoMes {
  id: string;
  ejercicio: number;
  mes: number;
  estado: 'abierto' | 'bloqueado' | 'cerrado';
  modelosPresentados?: string[];
}

export interface SerieConfig {
  id: string;
  codigo: string;
  descripcion: string;
  tipoDocumento: 'FACTURA' | 'RECTIFICATIVA' | 'PROFORMA' | string;
  activa: boolean;
  porDefecto: boolean;
  ultimoNumero: number;
  numeroSiguiente: number;
  documentos: number;
}

export interface CuentaParaFactura {
  id: string;
  iban: string;
  bancoNombre: string | null;
  moneda: string;
}

export interface AjustesFacturacion {
  formaPago: 'TRANSFERENCIA' | 'GIRO' | 'CONTADO';
  diasVencimiento: number;
  irpfDefecto: number;
  cuentaBancariaId: string | null;
  mostrarIban: boolean;
  textoPie: string | null;
  guardado: boolean;
  empresaEspanola: boolean;
  monedaCuenta: string;
  cuentasBancarias: CuentaParaFactura[];
  actualizadoEn: string | null;
}

export interface ModeloPrevisto {
  codigo: string;
  periodo: string;
  periodoEtiqueta: string;
  descripcion: string;
  fechaVencimiento: string;
  rellenoManual: boolean;
  /** vigente o expirado (segun hoy), presentado u omitido. Falta en servidores antiguos. */
  estado?: 'vigente' | 'expirado' | 'presentado' | 'omitido';
}

export interface AjustesFiscales {
  periodicidadIva: 'TRIMESTRAL' | 'MENSUAL';
  redeme: boolean;
  sii: boolean;
  granEmpresa: boolean;
  recargoEquivalencia: boolean;
  criterioCaja: boolean;
  prorrata: number | null;
  guardado: boolean;
  autonomo: boolean;
  actualizadoEn: string | null;
  calendario: { ejercicio: number; modelos: ModeloPrevisto[] };
}

export interface Miembro {
  userId: string;
  nombre: string | null;
  email: string;
  rol: string;
  activo: boolean;
  /** Tiene permisos a medida, distintos de los de su perfil. */
  personalizado?: boolean;
  /** Lo que puede en cada area. null con el perfil Administrador (todo). */
  areas?: Areas | null;
}

export const FORMAS_PAGO: Array<[AjustesFacturacion['formaPago'], string]> = [
  ['TRANSFERENCIA', 'Transferencia bancaria'],
  ['GIRO', 'Giro o recibo domiciliado'],
  ['CONTADO', 'Contado'],
];

export const IRPF_PERMITIDOS = [0, 1, 2, 7, 15, 19];

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** '2026-03-31' o un ISO completo -> '31/03/2026'. */
export function fechaCorta(f: string | null | undefined): string {
  if (!f) return '';
  const [a, m, d] = f.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : f;
}

/** Nombre corto del tipo de sociedad. */
export const NOMBRE_FORMA: Record<string, string> = {
  SL: 'Sociedad limitada',
  SLU: 'Sociedad limitada unipersonal',
  SA: 'Sociedad anónima',
  AUTONOMO: 'Autónomo',
  SCP: 'Sociedad civil',
  OTRA: 'Otra',
};

/** Formas que se inscriben en el Registro Mercantil (las mismas que CamposEmpresa). */
export const FORMAS_INSCRIBIBLES = ['SL', 'SLU', 'SA'];

/** Datos de /legal-config que usa Configuracion. */
export interface DatosEmpresaResumen {
  denominacion?: string | null;
  nif?: string | null;
  pais?: string | null;
  monedaCuenta?: string | null;
  tipoSociedad?: string | null;
  completo?: boolean;
  pendientes?: string[];
}

export const esPaisEspana = (pais: string | null | undefined) => {
  const p = String(pais ?? '').trim().toUpperCase();
  return p === '' || p === 'ES' || p === 'ESP';
};

/** Clases comunes de los formularios de Configuracion. */
export const claseCampo =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500';
export const claseBoton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';
export const claseBotonSecundario =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
