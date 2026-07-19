'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from './useAuth';

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
  const { getAuthHeader } = useAuth();
  const ocrSessionId = searchParams.get('ocrSessionId');
  const companyId = searchParams.get('companyId') || '1';

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

        const response = await fetch(
          `/api/companies/${companyId}/ocr/sessions/${ocrSessionId}`,
          {
            headers: {
              ...getAuthHeader(),
            },
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error(`Error ${response.status}: Failed to fetch OCR session`);
        }

        const data = await response.json();
        setOcrData(data.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchOcrData();
  }, [ocrSessionId, companyId, getAuthHeader]);

  return { ocrData, loading, error, ocrSessionId };
}
