'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react';
import { API_BASE, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getToken } from '@/lib/auth';

/**
 * Una imagen de la plantilla B de factura (Configuración > Facturación): el
 * logo de la marca (`marca`, debajo del de la empresa) o el sello de la
 * empresa (`sello`, abajo a la izquierda). PNG o JPG de hasta 1 MB. Se ve, se
 * sube, se cambia y se quita (GET, PUT y DELETE /ajustes-facturacion/imagenes/:tipo).
 */
export default function ImagenPlantilla({
  tipo,
  titulo,
  ayuda,
  puedeEditar,
}: {
  tipo: 'marca' | 'sello';
  titulo: string;
  ayuda: string;
  puedeEditar: boolean;
}) {
  const ruta = companyPath(`/ajustes-facturacion/imagenes/${tipo}`);
  const [url, setUrl] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const idInput = `imagen-${tipo}`;

  // La imagen va con el token de la sesión: se pide con fetch y se muestra como blob.
  const cargar = useCallback(async () => {
    const token = getToken();
    const res = await fetch(`${API_BASE}${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }).catch(() => null);
    setUrl((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return null;
    });
    if (res?.ok) setUrl(URL.createObjectURL(await res.blob()));
  }, [ruta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const subir = async (fichero: File | undefined) => {
    if (!fichero) return;
    if (fichero.size > 1024 * 1024) {
      setMensaje({ ok: false, texto: 'La imagen no puede pasar de 1 MB.' });
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(fichero.type)) {
      setMensaje({ ok: false, texto: 'Tiene que ser una imagen PNG o JPG.' });
      return;
    }
    setOcupado(true);
    setMensaje(null);
    try {
      const datos = new FormData();
      datos.append('imagen', fichero);
      await apiFetch(ruta, { method: 'PUT', body: datos });
      await cargar();
      setMensaje({ ok: true, texto: 'Guardada. Saldrá en las facturas de la plantilla B.' });
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = '';
    }
  };

  const quitar = async () => {
    if (!window.confirm(`¿Quitar ${tipo === 'marca' ? 'el logo de la marca' : 'el sello'} de las facturas?`)) return;
    setOcupado(true);
    setMensaje(null);
    try {
      await apiFetch(ruta, { method: 'DELETE' });
      await cargar();
      setMensaje({ ok: true, texto: 'Quitada.' });
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
          <img src={url} alt={titulo} className="max-h-16 max-w-40 object-contain" />
        ) : (
          <span className="flex flex-col items-center text-xs text-slate-500">
            <ImageSquare size={24} aria-hidden="true" />
            Sin imagen
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium text-slate-900">{titulo}</p>
        <p className="text-xs text-slate-600">{ayuda}</p>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              id={idInput}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              aria-label={`${url ? 'Cambiar' : 'Subir'}: ${titulo.toLowerCase()}`}
              onChange={(e) => subir(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <UploadSimple size={16} aria-hidden="true" /> {url ? 'Cambiar' : 'Subir imagen'}
            </button>
            {url && (
              <button
                type="button"
                disabled={ocupado}
                onClick={quitar}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash size={16} aria-hidden="true" /> Quitar
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
