'use client';

import { useEffect, useRef, useState } from 'react';
import { FileArrowUp, WarningCircle, X } from '@phosphor-icons/react';

/**
 * Arrastrar la factura a cualquier parte de la pagina del lector (gastos y
 * ventas). Mientras se arrastra un archivo por la ventana, una capa cubre la
 * pagina con «Suelta la factura aquí»; al soltarlo empieza la lectura igual
 * que con «Seleccionar archivo», que sigue siendo el camino con el teclado.
 *
 * - Solo reaccionan los archivos: arrastrar texto o un enlace no hace nada.
 * - La capa no parpadea al pasar por encima de otros elementos: se cuentan los
 *   dragenter y dragleave de la ventana. Si el navegador no avisa al salir de
 *   la ventana, se quita sola cuando dejan de llegar dragover.
 * - Varios archivos: se lee el primero y se avisa. Un tipo que no se puede
 *   leer o un archivo de mas de 4 MB: se avisa y no se lee.
 * - Si hay una lectura en curso o sin registrar, se pregunta antes de
 *   descartarla (la descarta la pagina al leer la nueva, como «Leer otra»).
 */

/** Lo mismo que aceptan los dos lectores (y el servidor). */
export const TIPOS_FACTURA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const MAX_BYTES_FACTURA = 4 * 1024 * 1024;

const megas = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** Por que no se puede leer un archivo, o null si se puede. */
export function motivoArchivoNoValido(f: File): string | null {
  if (!TIPOS_FACTURA.includes(f.type)) return `«${f.name}» no se puede leer: solo se leen PDF e imágenes (JPG, PNG o WEBP).`;
  if (f.size > MAX_BYTES_FACTURA) return `«${f.name}» pesa ${megas(f.size)} y el máximo son 4 MB: redúcelo o haz la foto con menos resolución.`;
  return null;
}

/**
 * ¿Lo que se arrastra trae archivos? (texto y enlaces, no). Con un dialogo
 * abierto (dar de alta, descartar...) tampoco: primero se termina con el.
 */
function traeArchivos(e: DragEvent): boolean {
  if (document.querySelector('[aria-modal="true"]')) return false;
  return !!e.dataTransfer && Array.from(e.dataTransfer.types ?? []).includes('Files');
}

/**
 * Escucha el arrastre de archivos en toda la ventana. Devuelve si hay un
 * archivo encima de la pagina; `alSoltar` recibe los archivos soltados.
 */
export function useArrastreArchivos(activo: boolean, alSoltar: (archivos: File[]) => void): boolean {
  const [arrastrando, setArrastrando] = useState(false);
  const alSoltarRef = useRef(alSoltar);
  alSoltarRef.current = alSoltar;

  useEffect(() => {
    if (!activo) {
      setArrastrando(false);
      return;
    }
    let dentro = 0;
    let vigilante: ReturnType<typeof setTimeout> | undefined;
    const ocultar = () => {
      dentro = 0;
      clearTimeout(vigilante);
      setArrastrando(false);
    };
    // Mientras el archivo esta encima, el navegador manda dragover sin parar: si dejan de llegar, ya no esta.
    const vigilar = () => {
      clearTimeout(vigilante);
      vigilante = setTimeout(ocultar, 600);
    };
    const alEntrar = (e: DragEvent) => {
      if (!traeArchivos(e)) return;
      e.preventDefault();
      dentro += 1;
      setArrastrando(true);
      vigilar();
    };
    const alPasar = (e: DragEvent) => {
      if (!traeArchivos(e)) return;
      // Sin esto el navegador no deja soltar (y abriria el archivo en la pestaña).
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      vigilar();
    };
    const alSalir = (e: DragEvent) => {
      if (!traeArchivos(e)) return;
      dentro = Math.max(0, dentro - 1);
      if (dentro === 0) ocultar();
    };
    const alSoltarArchivos = (e: DragEvent) => {
      if (!traeArchivos(e)) return;
      e.preventDefault();
      ocultar();
      const archivos = Array.from(e.dataTransfer?.files ?? []);
      if (archivos.length) alSoltarRef.current(archivos);
    };
    window.addEventListener('dragenter', alEntrar);
    window.addEventListener('dragover', alPasar);
    window.addEventListener('dragleave', alSalir);
    window.addEventListener('drop', alSoltarArchivos);
    window.addEventListener('blur', ocultar);
    return () => {
      clearTimeout(vigilante);
      window.removeEventListener('dragenter', alEntrar);
      window.removeEventListener('dragover', alPasar);
      window.removeEventListener('dragleave', alSalir);
      window.removeEventListener('drop', alSoltarArchivos);
      window.removeEventListener('blur', ocultar);
    };
  }, [activo]);

  return arrastrando;
}

interface Props {
  /** Si se puede leer (con permiso de escritura). */
  activo: boolean;
  /** Hay una lectura en curso o leida sin registrar: se pregunta antes de descartarla. */
  hayLectura: boolean;
  /** Lee el archivo (la pagina descarta la lectura anterior, como con «Leer otra»). */
  onArchivo: (f: File) => void;
}

/**
 * La capa «Suelta la factura aquí», la pregunta de descartar la lectura actual
 * y el aviso de lo que no se ha podido leer. Va al principio del <main>: el
 * aviso se ve ahi; la capa y la pregunta van por encima de toda la pagina.
 */
export default function SoltarFactura({ activo, hayLectura, onArchivo }: Props) {
  const [aviso, setAviso] = useState<string[]>([]);
  const [pendiente, setPendiente] = useState<File | null>(null);

  const arrastrando = useArrastreArchivos(activo, (archivos) => {
    const primero = archivos[0];
    const avisos: string[] = [];
    if (archivos.length > 1) {
      avisos.push(`Has soltado ${archivos.length} archivos: solo se lee uno cada vez. Se lee el primero, «${primero.name}»; los demás, súbelos después de uno en uno.`);
    }
    const motivo = motivoArchivoNoValido(primero);
    if (motivo) avisos.push(motivo);
    setAviso(avisos);
    if (motivo) return;
    if (hayLectura) setPendiente(primero);
    else onArchivo(primero);
  });

  return (
    <>
      {/* Se anuncia sin mover el foco: «Seleccionar archivo» sigue siendo el camino con el teclado. */}
      <div role="status" aria-live="polite" className={arrastrando ? 'pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/30 p-4' : 'sr-only'}>
        {arrastrando && (
          <div className="flex w-full max-w-lg flex-col items-center gap-2 rounded-2xl border-4 border-dashed border-emerald-400 bg-white px-6 py-10 text-center shadow-xl">
            <FileArrowUp size={56} weight="duotone" className="text-accent-600" aria-hidden="true" />
            <p className="text-lg font-semibold text-slate-900">Suelta la factura aquí</p>
            <p className="text-sm text-slate-600">PDF, JPG, PNG o WEBP de hasta 4 MB. Se lee en cuanto la sueltes.</p>
          </div>
        )}
      </div>

      {aviso.length > 0 && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1 break-words">
            {aviso.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
          <button type="button" onClick={() => setAviso([])} aria-label="Cerrar el aviso" className="shrink-0 rounded p-0.5 text-amber-800 hover:bg-amber-100">
            <X size={16} />
          </button>
        </div>
      )}

      {pendiente && (
        <PreguntaDescartar
          nombre={pendiente.name}
          onSi={() => {
            const f = pendiente;
            setPendiente(null);
            onArchivo(f);
          }}
          onNo={() => setPendiente(null)}
        />
      )}
    </>
  );
}

/** «¿Descartar la lectura actual y leer esta?», con el foco en «Seguir con la actual» (lo que no pierde nada). */
function PreguntaDescartar({ nombre, onSi, onNo }: { nombre: string; onSi: () => void; onNo: () => void }) {
  const noRef = useRef<HTMLButtonElement>(null);
  const siRef = useRef<HTMLButtonElement>(null);
  const antesRef = useRef<Element | null>(null);
  const onNoRef = useRef(onNo);
  onNoRef.current = onNo;

  useEffect(() => {
    antesRef.current = document.activeElement;
    noRef.current?.focus();
    // Escape cierra aunque el foco no este en la pregunta.
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onNoRef.current();
    };
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('keydown', alEscape);
      const antes = antesRef.current;
      if (antes instanceof HTMLElement && document.contains(antes)) antes.focus({ preventScroll: true });
    };
  }, []);

  const alTeclear = (e: React.KeyboardEvent) => {
    // Solo hay dos botones: el tabulador va de uno a otro sin salir de la pregunta.
    if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === noRef.current ? siRef.current : noRef.current)?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={onNo}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="descartar-titulo"
        aria-describedby="descartar-texto"
        onKeyDown={alTeclear}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="descartar-titulo" className="text-lg font-semibold text-slate-900">
          ¿Descartar la lectura actual y leer esta?
        </h2>
        <p id="descartar-texto" className="mt-2 break-words text-sm text-slate-600">
          La factura que tienes abierta todavía no está registrada. Si sigues, se descarta lo que llevas y se lee «{nombre}».
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={noRef}
            type="button"
            onClick={onNo}
            className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
          >
            Seguir con la actual
          </button>
          <button
            ref={siRef}
            type="button"
            onClick={onSi}
            className="rounded-lg bg-accent-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2"
          >
            Descartar y leer esta
          </button>
        </div>
      </div>
    </div>
  );
}
