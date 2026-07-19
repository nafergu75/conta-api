'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Send, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { OcrStatusBadge } from '../../components/OcrStatusBadge';
import { OcrStepsRail } from '../../components/OcrStepsRail';
import { OcrPdfPreview } from '../../components/OcrPdfPreview';

interface OcrSessionDetail {
  id: string;
  originalFileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  processingTimeSeconds?: number;
  ocrPageCount?: number;
  ocrCharCount?: number;
  ocrTextExtracted: string;
  ocrPdfPath: string;
  invoiceType: 'expense' | 'income';
  errorCode?: string;
  errorMessage?: string;
}

interface Step {
  id: number;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'error';
}

export default function OcrSessionDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, loading: authLoading, getAuthHeader } = useAuth();
  const companyId = searchParams.get('companyId') || '1';
  const sessionId = params.id;

  const [session, setSession] = useState<OcrSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [sendingToReader, setSendingToReader] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/companies/${companyId}/ocr/sessions/${sessionId}`,
          {
            headers: {
              ...getAuthHeader(),
            },
            credentials: 'include',
          }
        );

        if (response.ok) {
          const data = await response.json();
          setSession(data.data);
          updateSteps(data.data.status);
        } else if (response.status === 401) {
          router.push('/dashboard/login');
        }
      } catch (error) {
        console.error('Error fetching session:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchSession();
    }
  }, [sessionId, companyId, router, authLoading, token, getAuthHeader]);

  const updateSteps = (status: string) => {
    const stepsData: Step[] = [
      { id: 1, label: 'PDF subido', status: 'completed' },
      { id: 2, label: 'OCR en proceso', status: status === 'PROCESSING' ? 'current' : status === 'FAILED' ? 'error' : 'completed' },
      { id: 3, label: 'Texto disponible', status: status === 'COMPLETED' ? 'completed' : status === 'FAILED' ? 'error' : 'pending' },
      { id: 4, label: 'En lector', status: 'pending' },
      { id: 5, label: 'Contabilizado', status: 'pending' },
    ];
    setSteps(stepsData);
  };

  const handleSendToReader = async () => {
    if (!session) return;

    try {
      setSendingToReader(true);
      const endpoint = session.invoiceType === 'expense'
        ? `/dashboard/compras/lector-gastos?ocrSessionId=${sessionId}`
        : `/dashboard/ventas/lector-ingresos?ocrSessionId=${sessionId}`;

      router.push(endpoint);
    } catch (error) {
      console.error('Error sending to reader:', error);
    } finally {
      setSendingToReader(false);
    }
  };

  const handleRetryOcr = async () => {
    try {
      const response = await fetch(
        `/api/companies/${companyId}/ocr/sessions/${sessionId}/retry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      if (response.ok) {
        setSession((prev) => prev ? { ...prev, status: 'PROCESSING' } : null);
        updateSteps('PROCESSING');
      }
    } catch (error) {
      console.error('Error retrying OCR:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-600 mt-4">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Sesión no encontrada</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{session.originalFileName}</h1>
          <p className="text-gray-600 text-sm mt-1">
            Sesión {session.id.slice(0, 8)}... • Creado hace 2 horas
          </p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold">Estado</p>
          <div className="mt-2">
            <OcrStatusBadge status={session.status} size="md" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold">Páginas</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{session.ocrPageCount || '-'}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold">Caracteres</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {session.ocrCharCount?.toLocaleString() || '-'}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold">Tiempo</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {session.processingTimeSeconds ? `${session.processingTimeSeconds}s` : '-'}
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Progreso</h2>
        <OcrStepsRail steps={steps} currentStep={steps.findIndex((s) => s.status === 'current') + 1} />
      </div>

      {/* PDF Preview */}
      {session.status === 'COMPLETED' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <OcrPdfPreview
            pdfUrl={session.ocrPdfPath}
            ocrText={session.ocrTextExtracted}
            sessionId={session.id}
          />
        </div>
      )}

      {/* Error message */}
      {session.status === 'FAILED' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-900">
            Error en OCR: {session.errorMessage || 'Error desconocido'}
          </p>
          <button
            onClick={handleRetryOcr}
            className="mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 rounded transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reintentar
          </button>
        </div>
      )}

      {/* Acciones */}
      {session.status === 'COMPLETED' && (
        <div className="flex gap-3">
          <button
            onClick={handleSendToReader}
            disabled={sendingToReader}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
            {session.invoiceType === 'expense' ? 'Enviar a lector de gastos' : 'Enviar a lector de ingresos'}
          </button>
        </div>
      )}
    </div>
  );
}
