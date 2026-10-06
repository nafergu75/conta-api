'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, companyPath, errorMessage } from './api';

export interface OcrSessionData {
  id: string;
  originalFileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  ocrTextExtracted: string;
  ocrPageCount: number;
  ocrPdfPath: string;
  invoiceType: 'expense' | 'income';
}

export function useOcrSession() {
  const searchParams = useSearchParams();
  const ocrSessionId = searchParams.get('ocrSessionId');

  const [ocrData, setOcrData] = useState<OcrSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ocrSessionId) {
      setOcrData(null);
      return;
    }

    const fetchOcrData = async () => {
      try {
        setLoading(true);
        setError(null);

        setOcrData(await apiFetch<OcrSessionData>(companyPath(`/ocr/sessions/${ocrSessionId}`)));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchOcrData();
  }, [ocrSessionId]);

  return { ocrData, loading, error, ocrSessionId };
}
