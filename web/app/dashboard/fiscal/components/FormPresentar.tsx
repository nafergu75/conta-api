'use client';

import { useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { ConfirmationModal } from '@/components/dashboard/ConfirmationModal';
import { hoyEspana } from '@/lib/verifactu';
import { fechaCorta } from '@/lib/compras';

interface FormPresentarProps {
  codigo: '111' | '115' | '180' | '190' | '200' | '202' | '303' | '347' | '349' | '390';
  ejercicio: number;
  trimestre?: number;
  /** Periodo con su codigo: mes '01'..'12' (303, 111, 115, 349), trimestre '1T'..'4T' (111, 115, 349) o pago '1P'..'3P' (202). Si va, manda sobre el trimestre. */
  periodo?: string;
  /** 303: las opciones de la pantalla (tipo de declaración, cuotas a compensar, cuenta) con que se presenta. */
  opciones?: Record<string, string>;
  /** Título del recuadro (por defecto, «Marcar como presentado»). */
  titulo?: string;
  onSuccess?: () => void;
  isLoading?: boolean;
}

export function FormPresentar({
  codigo,
  ejercicio,
  trimestre,
  periodo,
  opciones,
  titulo = 'Marcar como presentado',
  onSuccess,
  isLoading = false,
}: FormPresentarProps) {
  // La fecha por defecto es la de hoy en España (en UTC, entre las 00:00 y las 02:00 saldría el día anterior).
  const vacio = () => ({ numero: '', fecha: hoyEspana() });
  const [formData, setFormData] = useState(vacio);
  // Ids únicos por modelo: cada etiqueta lleva al usuario (y al lector de pantalla) a su campo.
  const idNumero = `pres-${codigo}-numero`;
  const idFecha = `pres-${codigo}-fecha`;
  const limpiar = () => {
    setFormData(vacio());
    setError('');
  };
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleClickMarcar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.numero || !formData.fecha) {
      setError('Escribe el número de justificante y la fecha de presentación.');
      return;
    }
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    await handleSubmit();
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess(false);
    setSubmitting(true);
    setShowConfirmation(false);

    try {
      const payload = {
        ejercicio,
        ...(periodo ? { periodo } : trimestre ? { trimestre } : {}),
        ...(opciones && Object.keys(opciones).length ? { opciones } : {}),
        justificante: {
          numero: formData.numero,
          fecha: formData.fecha,
        },
      };

      await apiFetch(companyPath(`/tax-models/${codigo}/presentado`), {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccess(true);
      setFormData(vacio());
      onSuccess?.();

      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h3 className="mb-4 font-semibold text-slate-900">{titulo}</h3>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <WarningCircle size={20} className="mt-0.5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Error</p>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle size={20} className="mt-0.5 text-green-600" />
          <div>
            <p className="font-medium text-green-900">Éxito</p>
            <p className="text-sm text-green-800">Modelo {codigo} marcado como presentado.</p>
          </div>
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={idNumero} className="block text-sm font-medium text-slate-700">
              Número de justificante *
            </label>
            <input
              id={idNumero}
              type="text"
              placeholder="El que da la sede al presentar"
              value={formData.numero}
              onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Lo encontrarás en el justificante que descargas de la sede.
            </p>
          </div>

          <div>
            <label htmlFor={idFecha} className="block text-sm font-medium text-slate-700">
              Fecha de presentación *
            </label>
            <input
              id={idFecha}
              type="date"
              value={formData.fecha}
              onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <button
            type="button"
            onClick={handleClickMarcar}
            disabled={submitting || isLoading}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 hover:bg-green-700"
          >
            {submitting ? 'Guardando…' : 'Marcar como presentado'}
          </button>

          <button
            type="button"
            onClick={limpiar}
            disabled={submitting || isLoading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>
      </form>

      <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Nota:</p>
        <p>
          Al marcarlo como presentado, la app guarda lo que se presentó (casillas, fichero, tipo de declaración e IBAN) con el
          justificante. Desde entonces la pantalla y el fichero enseñan eso, aunque cambien las facturas. Si luego hay que
          corregirlo, se prepara una complementaria o una sustitutiva.
        </p>
      </div>

      {/* Modal de Confirmación */}
      <ConfirmationModal
        isOpen={showConfirmation}
        title={`Confirmar la presentación del modelo ${codigo}`}
        message={`¿Marcar el modelo ${codigo}${periodo ? ` (${periodo})` : trimestre ? ` (${trimestre}T)` : ''} como presentado?`}
        details={
          <div className="space-y-2">
            <div>
              <span className="font-medium text-slate-900">Número de justificante:</span>
              <span className="ml-2 text-slate-700">{formData.numero || '—'}</span>
            </div>
            <div>
              <span className="font-medium text-slate-900">Fecha de presentación:</span>
              <span className="ml-2 text-slate-700">{fechaCorta(formData.fecha) || formData.fecha}</span>
            </div>
            <div>
              <span className="font-medium text-slate-900">Ejercicio:</span>
              <span className="ml-2 text-slate-700">{ejercicio}</span>
            </div>
            <p className="mt-3 text-xs italic text-slate-600">
              Lo presentado queda guardado tal cual. Para corregirlo después, prepara una complementaria o una sustitutiva.
            </p>
          </div>
        }
        confirmLabel="Marcar como presentado"
        cancelLabel="Cancelar"
        isDangerous={true}
        isLoading={submitting}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirmation(false)}
      />
    </div>
  );
}
