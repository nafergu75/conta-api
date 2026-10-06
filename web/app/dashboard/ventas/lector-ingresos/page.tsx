'use client';


import { useState, useCallback , Suspense} from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Plus, ArrowLeft, Check } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { useOcrSession } from '@/lib/useOcrSession';
import { OcrSessionPanel } from '@/components/dashboard/OcrSessionPanel';


interface IngresoExtraido {
  /** Id del documento leido: confirmar usa los datos guardados en el servidor. */
  documentId: string;
  numeroFactura: string | null;
  cliente: string | null;
  nifCliente: string | null;
  fecha: string | null;
  concepto: string | null;
  cuentaContable: string | null;
  base: number | null;
  iva: number | null;
  total: number | null;
  retencion: number | null;
  confianza: number;
  errores: string[];
}

function LectorIngresosPageInner() {
  const router = useRouter();
  const { ocrData, loading: ocrLoading } = useOcrSession();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingreso, setIngreso] = useState<IngresoExtraido | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const validateAndProcess = async (selectedFile: File) => {
    const tiposPermitidos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!tiposPermitidos.includes(selectedFile.type)) {
      setError('Solo se permiten PDF e imágenes (JPG, PNG)');
      return;
    }

    setFile(selectedFile);
    setError(null);
    await procesarIngreso(selectedFile);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      await validateAndProcess(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      await validateAndProcess(droppedFiles[0]);
    }
  };

  /** El fichero en base64 (sin el prefijo data:). */
  const leerBase64 = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(f);
    });

  const procesarIngreso = async (file: File) => {
    setLoading(true);
    setError(null);
    setExito(null);
    try {
      // Antes el loading no se apagaba nunca tras una lectura correcta, y los
      // errores dentro de FileReader.onload no llegaban al catch.
      const archivoBase64 = await leerBase64(file);
      const leido = await apiFetch<IngresoExtraido>(companyPath('/ingresos-extractor/extraer-ia'), {
        method: 'POST',
        body: JSON.stringify({ archivoBase64, nombre: file.name, mimeType: file.type }),
      });
      setIngreso(leido);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmar = async () => {
    if (!ingreso) return;

    setLoading(true);
    setError(null);
    try {
      // Solo el id: el servidor registra la factura con los datos que leyo.
      const r = await apiFetch<{ numeroCompleto: string }>(companyPath('/ingresos-extractor/confirmar'), {
        method: 'POST',
        body: JSON.stringify({ documentId: ingreso.documentId }),
      });
      setExito(`Factura ${r.numeroCompleto} registrada.`);
      setIngreso(null);
      setFile(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard/facturas')}
              className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-semibold text-slate-900">Lector de Ingresos (OCR)</h1>
          </div>
          <div className="text-sm text-slate-600">
            Sube facturas de venta para extraer datos automáticamente
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: Formulario (2 cols) */}
          <div className="lg:col-span-2">
        {!ingreso ? (
          <>
            {/* Área de carga con drag-and-drop */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="bg-white rounded-xl border-2 border-dashed border-blue-300 p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
            >
              <Upload size={48} className="text-blue-600 mx-auto mb-4" weight="duotone" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">
                Arrastra una factura aquí o haz clic para seleccionar
              </h2>
              <p className="text-slate-600 mb-6">
                PDF, JPG o PNG. El sistema extraerá automáticamente los datos usando IA.
              </p>

              <label className="inline-block">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  disabled={loading}
                  className="hidden"
                />
                <button
                  className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none cursor-pointer inline-flex items-center gap-2"
                  disabled={loading}
                >
                  <Plus size={18} />
                  {loading ? 'Procesando...' : 'Seleccionar archivo'}
                </button>
              </label>

              {file && (
                <p className="text-sm text-slate-600 mt-4">
                  📄 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {exito && (
              <div role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 p-4">
                {exito}
              </div>
            )}
            {error && (
              <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4">
                ❌ {error}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Datos extraídos */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">Datos Extraídos</h2>

              {ingreso.errores.length > 0 && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900 mb-2">⚠️ Advertencias:</p>
                  <ul className="text-sm text-amber-800 space-y-1">
                    {ingreso.errores.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cliente */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Cliente
                  </label>
                  <div className="text-slate-900 font-semibold">
                    {ingreso.cliente || '—'}
                  </div>
                  {ingreso.nifCliente && (
                    <div className="text-xs text-slate-600 mt-1 font-mono">
                      {ingreso.nifCliente}
                    </div>
                  )}
                </div>

                {/* Número de Factura */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Nº Factura
                  </label>
                  <div className="text-slate-900 font-semibold">
                    {ingreso.numeroFactura || '—'}
                  </div>
                </div>

                {/* Fecha */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Fecha
                  </label>
                  <div className="text-slate-900 font-semibold">
                    {ingreso.fecha || '—'}
                  </div>
                </div>

                {/* Concepto */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Concepto de Ingreso
                  </label>
                  <div className="text-slate-900 font-semibold text-sm">
                    {ingreso.concepto || '—'}
                  </div>
                </div>

                {/* Cuenta Contable */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Cuenta Contable Sugerida
                  </label>
                  <div className="text-slate-900 font-semibold">
                    {ingreso.cuentaContable || '—'}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {ingreso.confianza >= 0.8 && <span>✓ Alta confianza</span>}
                    {ingreso.confianza >= 0.6 && ingreso.confianza < 0.8 && (
                      <span>⚠ Confianza media</span>
                    )}
                    {ingreso.confianza < 0.6 && <span>⚠ Baja confianza - revisar</span>}
                  </div>
                </div>

                {/* Totales */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Total
                  </label>
                  <div className="text-lg font-bold text-slate-900">
                    €{(ingreso.total || 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Base: €{(ingreso.base || 0).toFixed(2)} | IVA: €{(ingreso.iva || 0).toFixed(2)}
                    {(ingreso.retencion || 0) > 0 && <> | Retención: −€{(ingreso.retencion || 0).toFixed(2)}</>}
                  </div>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-3">
              <button
                onClick={() => setIngreso(null)}
                className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                ← Cargar otro
              </button>
              <button
                onClick={handleConfirmar}
                disabled={loading || ingreso.errores.length > 0}
                title={ingreso.errores.length > 0 ? 'Corrige los errores antes de registrar' : undefined}
                className="flex-1 px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
              >
                <Check size={18} />
                {loading ? 'Guardando...' : 'Confirmar y Registrar'}
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4">
                ❌ {error}
              </div>
            )}
          </>
        )}
          </div>

          {/* Columna derecha: Panel OCR (1 col) */}
          {ocrData && (
            <OcrSessionPanel ocrData={ocrData} loading={ocrLoading} />
          )}
        </div>
      </main>
    </div>
  );
}

export default function LectorIngresosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando...</div>}>
      <LectorIngresosPageInner />
    </Suspense>
  );
}
