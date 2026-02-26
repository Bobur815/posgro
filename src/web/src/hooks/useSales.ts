import { useState, useCallback } from 'react';
import { sales as salesApi } from '../api/client';

interface Summary {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalItems: number;
  cashSales: number;
  cardSales: number;
  averageTransaction: number;
}

export function useSales() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTodaySummary = useCallback(async (): Promise<Summary | null> => {
    setIsLoading(true);

    try {
      const summary = await salesApi.getTodaySummary();
      return summary as Summary;
    } catch (err) {
      console.error('Failed to get summary:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSales = useCallback(async (filters?: { startDate?: string; endDate?: string }) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await salesApi.getAll(filters);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    getTodaySummary,
    loadSales,
  };
}
