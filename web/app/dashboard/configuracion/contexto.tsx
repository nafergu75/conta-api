'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, companyPath } from '@/lib/api';
import type { SessionUser } from '@/lib/auth';
import { EVENTO_DATOS_EMPRESA } from '@/lib/fiscal';
import { esPaisEspana, FORMAS_INSCRIBIBLES, useUsuarioSesion, type DatosEmpresaResumen } from '@/lib/configuracion';

/**
 * Lo que comparten el indice y los bloques de Configuracion: el usuario (con
 * sus permisos en la empresa activa) y los datos de la empresa, leidos una
 * vez. Se vuelven a leer con EVENTO_SESION y EVENTO_DATOS_EMPRESA.
 */
interface ContextoConfiguracion {
  user: SessionUser | null;
  /** false hasta montar: la sesion vive en localStorage. */
  listo: boolean;
  empresa: DatosEmpresaResumen | null;
  /** true cuando ya se ha intentado leer (empresa null tras leer: no se ha podido). */
  empresaLeida: boolean;
  /** null mientras se lee o si no se puede leer: no se oculta nada por ello. */
  espanola: boolean | null;
  /** Sociedad española que se inscribe en el Registro Mercantil (SA, SL, SLU). */
  inscribible: boolean;
  recargarEmpresa: () => void;
}

const Contexto = createContext<ContextoConfiguracion>({
  user: null,
  listo: false,
  empresa: null,
  empresaLeida: false,
  espanola: null,
  inscribible: false,
  recargarEmpresa: () => undefined,
});

export function ProveedorConfiguracion({ children }: { children: ReactNode }) {
  const { user, listo } = useUsuarioSesion();
  const [empresa, setEmpresa] = useState<DatosEmpresaResumen | null>(null);
  const [empresaLeida, setEmpresaLeida] = useState(false);

  const recargarEmpresa = useCallback(() => {
    apiFetch<DatosEmpresaResumen>(companyPath('/legal-config'))
      .then(setEmpresa)
      .catch(() => setEmpresa(null))
      .finally(() => setEmpresaLeida(true));
  }, []);

  useEffect(() => {
    recargarEmpresa();
    window.addEventListener(EVENTO_DATOS_EMPRESA, recargarEmpresa);
    return () => window.removeEventListener(EVENTO_DATOS_EMPRESA, recargarEmpresa);
  }, [recargarEmpresa]);

  const espanola = empresa ? esPaisEspana(empresa.pais) : null;
  const inscribible = espanola === true && FORMAS_INSCRIBIBLES.includes(String(empresa?.tipoSociedad ?? ''));

  return <Contexto.Provider value={{ user, listo, empresa, empresaLeida, espanola, inscribible, recargarEmpresa }}>{children}</Contexto.Provider>;
}

export const useConfiguracion = () => useContext(Contexto);
