'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react';
import { API_BASE, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getToken } from '@/lib/auth';

/**
 * Logo de la empresa: sale arriba a la derecha en las facturas.
 * PNG o JPG de hasta 1 MB; mejor con fondo blanco o transparente.
 */
export function LogoEmpresa({ puedeEditar }: { puedeEditar: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // La imagen va con el token de la sesion: se pide con fetch y se muestra como blob.
  const cargar = useCallback(async () => {
    const token = getToken();
    const res = await fetch(`${API_BASE}${companyPath('/legal-config/logo')}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => null);
    setUrl((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return null;
    });
    if (res?.ok) {
      const blob = await res.blob();
      setUrl(URL.createObjectURL(blob));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const subir = async (fichero: File | undefined) => {
    if (!fichero) return;
    if (fichero.size > 1024 * 1024) {
      setMensaje({ ok: false, texto: 'El logo no puede pasar de 1 MB.' });
      return;
    }
    setOcupado(true);
    setMensaje(null);
    try {
      const datos = new FormData();
      datos.append('logo', fichero);
      await apiFetch(companyPath('/legal-config/logo'), { method: 'PUT', body: datos });
      await cargar();
      setMensaje({ ok: true, texto: 'Logo guardado. Saldrá en las facturas.' });
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = '';
    }
  };

  const quitar = async () => {
    if (!window.confirm('¿Quitar el logo de las facturas?')) return;
    setOcupado(true);
    setMensaje(null);
    try {
      await apiFetch(companyPath('/legal-config/logo'), { method: 'DELETE' });
      await cargar();
      setMensaje({ ok: true, texto: 'Logo quitado.' });
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center">
      <div className="flex h-20 w-44 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Logo de la empresa" className="max-h-16 max-w-40 object-contain" />
        ) : (
          <span className="flex flex-col items-center text-xs text-slate-400">
            <ImageSquare size={24} />
            Sin logo
          </span>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium text-slate-900">Logo de la empresa</p>
        <p className="text-xs text-slate-500">Sale arriba a la derecha en las facturas. PNG o JPG, hasta 1 MB; mejor con fondo blanco o transparente.</p>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => subir(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <UploadSimple size={16} /> {url ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {url && (
              <button
                type="button"
                disabled={ocupado}
                onClick={quitar}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash size={16} /> Quitar
              </button>
            )}
          </div>
        )}
        {mensaje && (
          <p role={mensaje.ok ? 'status' : 'alert'} className={`text-xs ${mensaje.ok ? 'text-green-700' : 'text-red-700'}`}>
            {mensaje.texto}
          </p>
        )}
      </div>
    </div>
  );
}
