'use client';


import { useState, useCallback , Suspense} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload, Plus, ArrowLeft, Check, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { useOcrSession } from '@/lib/useOcrSession';
import { OcrSessionPanel } from '@/components/dashboard/OcrSessionPanel';


interface GastoExtraido {
  numeroFactura: string | null;
  proveedor: string | null;
  nifProveedor: string | null;
  fecha: string | null;
  conceptoGasto: string | null;
  cuentaContable: string | null;
  base: number | null;
  iva: number | null;
  total: number | null;
  confianza: number;
  errores: string[];
  /** Una nomina o un recibo de la SS no es una factura: se registra en Nominas. */
  tipoDocumento?: 'factura' | 'nomina' | 'seguros_sociales';
}

function LectorGastosPageInner() {
  const router = useRouter();
  const { ocrData, loading: ocrLoading } = useOcrSession();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gasto, setGasto] = useState<GastoExtraido | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const validateAndProcess = async (selectedFile: File) => {
    const tiposPermitidos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!tiposPermitidos.includes(selectedFile.type)) {
      setError('Solo se permiten PDF e imágenes (JPG, PNG)');
      return;
    }

    setFile(selectedFile);
    setError(null);
    await procesarGasto(selectedFile);
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

  const procesarGasto = async (file: File) => {
    setLoading(true);
    setError(null);
    setExito(null);
    try {
      // Antes el loading no se apagaba nunca tras una lectura correcta, y los
      // errores dentro de FileReader.onload no llegaban al catch.
      const archivoBase64 = await leerBase64(file);
      const leido = await apiFetch<GastoExtraido>(companyPath('/gastos-extractor/extraer-ia'), {
        method: 'POST',
        body: JSON.stringify({ archivoBase64, nombre: file.name, mimeType: file.type }),
      });
      setGasto(leido);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmar = async () => {
    if (!gasto) return;

    setLoading(true);
    setError(null);
    try {
      await apiFetch(companyPath('/gastos-extractor/confirmar'), {
        method: 'POST',
        body: JSON.stringify(gasto),
      });
      setExito('Gasto registrado.');
      setGasto(null);
      setFile(null);
    } catch (err) {
      // El mensaje del backend (p. ej. un campo que falta) llega al usuario.
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
              onClick={() => router.push('/dashboard/compras')}
              className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-semibold text-slate-900">Lector de Gastos (OCR)</h1>
          </div>
          <div className="text-sm text-slate-600">
            Sube facturas y comprobantes para extraer datos automáticamente
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: Formulario (2 cols) */}
          <div className="lg:col-span-2">
        {!gasto ? (
          <>
            {/* Área de carga con drag-and-drop */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="bg-white rounded-xl border-2 border-dashed border-accent-300 p-12 text-center hover:border-accent-400 transition-colors cursor-pointer"
            >
              <Upload size={48} className="text-accent-600 mx-auto mb-4" weight="duotone" />
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
                  className="px-6 py-3 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none cursor-pointer inline-flex items-center gap-2"
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

              {gasto.errores.length > 0 && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900 mb-2">⚠️ Advertencias:</p>
                  <ul className="text-sm text-amber-800 space-y-1">
                    {gasto.errores.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(gasto.tipoDocumento === 'nomina' || gasto.tipoDocumento === 'seguros_sociales') && (
                <div className="mb-6 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  <p>
                    {gasto.tipoDocumento === 'nomina' ? 'Parece una nómina' : 'Parecen unos seguros sociales'}: si la empresa lleva sus nóminas en la app, no se registra como factura de gasto.{' '}
                    <Link href="/dashboard/nominas" className="font-semibold underline">
                      Ve a Nóminas
                    </Link>
                    , importa el Excel de la gestoría y guarda allí este PDF.
                  </p>
                  <p>
                    Si no lo es (por ejemplo, la cuota de autónomos del administrador, o una empresa sin trabajadores),{' '}
                    <button
                      type="button"
                      onClick={() => setGasto({ ...gasto, tipoDocumento: 'factura' })}
                      className="font-semibold underline"
                    >
                      es una factura de gasto
                    </button>
                    .
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Proveedor */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Proveedor
                  </label>
                  <div className="text-slate-900 font-semibold">
                    {gasto.proveedor || '—'}
                  </div>
                  {gasto.nifProveedor && (
                    <div className="text-xs text-slate-600 mt-1 font-mono">
                      {gasto.nifProveedor}
                    </div>
                  )}
                </div>

                {/* Número de Factura */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Nº Factura
                  </label>
                  <div className="text-slate-900 font-semibold">
                    {gasto.numeroFactura || '—'}
                  </div>
                </div>

                {/* Fecha */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Fecha
                  </label>
                  <div className="text-slate-900 font-semibold">
                    {gasto.fecha || '—'}
                  </div>
                </div>

                {/* Concepto */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Concepto de Gasto
                  </label>
                  <div className="text-slate-900 font-semibold text-sm">
                    {gasto.conceptoGasto || '—'}
                  </div>
                </div>

                {/* Cuenta Contable */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Cuenta Contable Sugerida
                  </label>
                  <div className="text-slate-900 font-semibold">
                    {gasto.cuentaContable || '—'}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {gasto.confianza >= 0.8 && <span>✓ Alta confianza</span>}
                    {gasto.confianza >= 0.6 && gasto.confianza < 0.8 && (
                      <span>⚠ Confianza media</span>
                    )}
                    {gasto.confianza < 0.6 && <span>⚠ Baja confianza - revisar</span>}
                  </div>
                </div>

                {/* Totales */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Total
                  </label>
                  <div className="text-lg font-bold text-slate-900">
                    €{(gasto.total || 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Base: €{(gasto.base || 0).toFixed(2)} | IVA: €{(gasto.iva || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-3">
              <button
                onClick={() => setGasto(null)}
                className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                ← Cargar otro
              </button>
              <button
                onClick={handleConfirmar}
                disabled={loading || gasto.tipoDocumento === 'nomina' || gasto.tipoDocumento === 'seguros_sociales'}
                className="flex-1 px-4 py-3 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
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

export default function LectorGastosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando...</div>}>
      <LectorGastosPageInner />
    </Suspense>
  );
}
